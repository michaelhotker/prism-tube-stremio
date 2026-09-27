import sdk from 'stremio-addon-sdk';
import { TtlCache, mapLimit } from './cache.js';
import { createTextFetcher } from './http.js';
import { decodeId, encodeId, sourceForUrl } from './ids.js';
import { getSite, listUrl, parseSite, siteHosts, siteLabel } from './sites.js';
import { createExtractor, metaFromExtraction, streamsFromExtraction } from './extractor.js';

function interleave(groups, limit) {
  const output = [];
  for (let index = 0; output.length < limit; index++) {
    let added = false;
    for (const group of groups) if (group[index]) { output.push(group[index]); added = true; if (output.length === limit) break; }
    if (!added) break;
  }
  return output;
}

export function createAddon(config, dependencies = {}) {
  const fetchText = dependencies.fetchText || createTextFetcher(config);
  const extract = dependencies.extract || createExtractor(config);
  const log = dependencies.log || (record => console.log(JSON.stringify(record)));
  const catalogCache = new TtlCache(config.maxCacheEntries);
  const extractCache = new TtlCache(config.maxCacheEntries);
  const itemCache = new TtlCache(config.maxCacheEntries);
  const extractionInFlight = new Map();
  const builder = new sdk.addonBuilder({
    id: 'community.prism.tube', version: '1.0.0', name: 'Prism Tube',
    description: 'Search and play videos from configured gay tube sources.',
    resources: ['catalog', 'meta', 'stream'], types: ['movie'], idPrefixes: ['prism-tube:'],
    catalogs: [{ id: 'prism-tube', type: 'movie', name: 'Prism Tube', extra: [
      { name: 'search', isRequired: false }, { name: 'skip', isRequired: false }
    ] }],
    behaviorHints: { adult: true, p2p: false }
  });

  async function extraction(pageUrl) {
    const hit = extractCache.get(pageUrl);
    if (hit) return hit;
    if (extractionInFlight.has(pageUrl)) return extractionInFlight.get(pageUrl);
    const pending = extract(pageUrl).then(value => {
      extractCache.set(pageUrl, value, Math.min(config.cacheTtlSeconds, 300)); return value;
    }).finally(() => extractionInFlight.delete(pageUrl));
    extractionInFlight.set(pageUrl, pending);
    return pending;
  }

  builder.defineCatalogHandler(async ({ id, type, extra = {} }) => {
    if (id !== 'prism-tube' || type !== 'movie') return { metas: [] };
    const search = String(extra.search || '').trim().slice(0, 100);
    const skip = Math.max(0, Math.min(1000, Number.parseInt(extra.skip, 10) || 0));
    const page = Math.floor(skip / Math.max(1, Math.floor(config.maxResults / config.enabledSources.length)));
    const key = `${search}\0${page}`;
    const cached = catalogCache.get(key);
    if (cached) return cached;
    const groups = await mapLimit(config.enabledSources, config.searchConcurrency, async source => {
      try {
        const html = await fetchText(listUrl(source, search, page), siteHosts(source));
        const items = parseSite(source, html);
        for (const item of items) itemCache.set(item.id, item, 3600);
        return items;
      } catch {
        log({ event: 'source_failed', source }); return [];
      }
    });
    // mapLimit flattens by design; regroup here so sources remain evenly represented.
    const bySource = config.enabledSources.map(source => groups.filter(item => item.source === siteLabel(source)));
    const response = { metas: interleave(bySource, config.maxResults) };
    catalogCache.set(key, response, config.cacheTtlSeconds);
    log({ event: 'catalog_complete', search: Boolean(search), results: response.metas.length });
    return response;
  });

  builder.defineMetaHandler(async ({ type, id }) => {
    if (type !== 'movie') return { meta: null };
    const pageUrl = decodeId(id);
    if (!pageUrl || !config.enabledSources.includes(sourceForUrl(pageUrl))) return { meta: null };
    const known = itemCache.get(id);
    if (known) return { meta: known };
    try { return { meta: metaFromExtraction(await extraction(pageUrl), id, pageUrl) }; }
    catch { return { meta: { id, type: 'movie', name: `${siteLabel(sourceForUrl(pageUrl))} video`, behaviorHints: { defaultVideoId: id } } }; }
  });

  builder.defineStreamHandler(async ({ type, id }) => {
    if (type !== 'movie') return { streams: [] };
    const pageUrl = decodeId(id);
    const source = pageUrl && sourceForUrl(pageUrl);
    if (!source || !config.enabledSources.includes(source)) return { streams: [] };
    let streams = [];
    try { streams = streamsFromExtraction(await extraction(pageUrl), pageUrl, config); }
    catch { log({ event: 'extract_failed', source }); }
    streams.push({ name: `Open on ${siteLabel(source)}`, title: 'Open the original video page', description: 'Open the original video page', externalUrl: pageUrl });
    return { streams };
  });

  return builder.getInterface();
}
