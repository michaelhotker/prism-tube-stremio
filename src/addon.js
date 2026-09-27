import sdk from 'stremio-addon-sdk';
import { TtlCache, mapLimit } from './cache.js';
import { createTextFetcher } from './http.js';
import { decodeId, sourceForUrl } from './ids.js';
import { listUrl, parseSite, siteHosts, siteLabel } from './sites.js';
import { createExtractor, metaFromExtraction, streamsFromExtraction } from './extractor.js';
import { DEFAULT_CATEGORIES, DEFAULT_CATEGORY_TEXT, categoryTerm, resolvePreferences } from './preferences.js';

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
    id: 'community.prism.tube', version: '1.2.0', name: 'Prism Tube',
    description: 'Search and play videos from configured gay tube sources.',
    resources: ['catalog', 'meta', 'stream'], types: ['movie'], idPrefixes: ['prism-tube:'],
    catalogs: [{ id: 'prism-tube', type: 'movie', name: 'Prism Tube', extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: DEFAULT_CATEGORIES.map(category => category.label), optionsLimit: 1 },
      { name: 'skip', isRequired: false }
    ] }],
    config: [
      { key: 'sources', type: 'text', title: 'Enabled provider adapters', default: config.enabledSources.join(','), required: true },
      { key: 'primaryTag', type: 'text', title: 'Primary result tag', default: 'Gay Male', required: true },
      { key: 'categories', type: 'text', title: 'Category labels and search terms', default: DEFAULT_CATEGORY_TEXT, required: true }
    ],
    behaviorHints: { adult: true, p2p: false, configurable: true }
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

  builder.defineCatalogHandler(async ({ id, type, extra = {}, config: userConfig = {} }) => {
    if (id !== 'prism-tube' || type !== 'movie') return { metas: [] };
    const preferences = resolvePreferences(userConfig, config.enabledSources);
    const search = String(extra.search || '').trim().slice(0, 100);
    const genre = String(extra.genre || '').trim();
    const genreQuery = genre ? categoryTerm(preferences.categories, genre) : '';
    if (genre && !genreQuery) return { metas: [] };
    const query = [genreQuery, search].filter(Boolean).join(' ').slice(0, 100);
    const skip = Math.max(0, Math.min(1000, Number.parseInt(extra.skip, 10) || 0));
    const page = Math.floor(skip / Math.max(1, Math.floor(config.maxResults / preferences.enabledSources.length)));
    const preferenceKey = JSON.stringify([preferences.enabledSources, preferences.primaryTag, preferences.categories]);
    const key = `${preferenceKey}\0${genre}\0${search}\0${page}`;
    const cached = catalogCache.get(key);
    if (cached) return cached;
    const groups = await mapLimit(preferences.enabledSources, config.searchConcurrency, async source => {
      try {
        const html = await fetchText(listUrl(source, query, page), siteHosts(source));
        const items = parseSite(source, html);
        for (const item of items) {
          item.genres = [...new Set([preferences.primaryTag, ...(genre ? [genre] : [])])];
          itemCache.set(item.id, item, 3600);
        }
        return items;
      } catch {
        log({ event: 'source_failed', source }); return [];
      }
    });
    // mapLimit flattens by design; regroup here so sources remain evenly represented.
    const bySource = preferences.enabledSources.map(source => groups.filter(item => item.source === siteLabel(source)));
    const response = { metas: interleave(bySource, config.maxResults) };
    catalogCache.set(key, response, config.cacheTtlSeconds);
    log({ event: 'catalog_complete', search: Boolean(search), genre: genre || undefined, results: response.metas.length });
    return response;
  });

  builder.defineMetaHandler(async ({ type, id, config: userConfig = {} }) => {
    if (type !== 'movie') return { meta: null };
    const preferences = resolvePreferences(userConfig, config.enabledSources);
    const pageUrl = decodeId(id);
    if (!pageUrl || !preferences.enabledSources.includes(sourceForUrl(pageUrl))) return { meta: null };
    const known = itemCache.get(id);
    const baseTags = known?.genres || [preferences.primaryTag];
    try { return { meta: { ...known, ...metaFromExtraction(await extraction(pageUrl), id, pageUrl, baseTags) } }; }
    catch {
      if (known) return { meta: known };
      return { meta: { id, type: 'movie', name: `${siteLabel(sourceForUrl(pageUrl))} video`, genres: baseTags,
        behaviorHints: { defaultVideoId: id } } };
    }
  });

  builder.defineStreamHandler(async ({ type, id, config: userConfig = {} }) => {
    if (type !== 'movie') return { streams: [] };
    const preferences = resolvePreferences(userConfig, config.enabledSources);
    const pageUrl = decodeId(id);
    const source = pageUrl && sourceForUrl(pageUrl);
    if (!source || !preferences.enabledSources.includes(source)) return { streams: [] };
    let streams = [];
    try { streams = streamsFromExtraction(await extraction(pageUrl), pageUrl, config); }
    catch { log({ event: 'extract_failed', source }); }
    streams.push({ name: `Open on ${siteLabel(source)}`, title: 'Open the original video page', description: 'Open the original video page', externalUrl: pageUrl });
    return { streams };
  });

  return builder.getInterface();
}
