import sdk from 'stremio-addon-sdk';
import { TtlCache } from './cache.js';
import { createTextFetcher } from './http.js';
import { decodeId, sourceForUrl } from './ids.js';
import { catalogId, categoryListUrl, listUrl, parseSite, parseSiteCategories, siteHosts, siteLabel, sourceForCatalog } from './sites.js';
import { createExtractor, metaFromExtraction, streamsFromExtraction } from './extractor.js';
import { DEFAULT_CATEGORIES, DEFAULT_CATEGORY_TEXT, categoryTerm, resolvePreferences } from './preferences.js';

export function createAddon(config, dependencies = {}) {
  const fetchText = dependencies.fetchText || createTextFetcher(config);
  const extract = dependencies.extract || createExtractor(config);
  const log = dependencies.log || (record => console.log(JSON.stringify(record)));
  const catalogCache = new TtlCache(config.maxCacheEntries);
  const extractCache = new TtlCache(config.maxCacheEntries);
  const itemCache = new TtlCache(config.maxCacheEntries);
  const categoryCache = new TtlCache(Math.max(10, config.enabledSources.length));
  const extractionInFlight = new Map();
  const builder = new sdk.addonBuilder({
    id: 'community.prism.tube', version: '1.3.0', name: 'Prism Tube',
    description: 'Search and play videos from configured gay tube sources.',
    resources: ['catalog', 'meta', 'stream'], types: ['Porn'], idPrefixes: ['prism-tube:'],
    catalogs: config.enabledSources.map(source => ({ id: catalogId(source), type: 'Porn', name: `Prism Tube · ${siteLabel(source)}`, extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: DEFAULT_CATEGORIES.map(category => category.label), optionsLimit: 1 },
      { name: 'skip', isRequired: false }
    ] })),
    config: [
      { key: 'sources', type: 'text', title: 'Enabled provider adapters', default: config.enabledSources.join(','), required: true },
      { key: 'primaryTag', type: 'text', title: 'Primary result tag', default: 'Gay Male', required: true },
      { key: 'categories', type: 'text', title: 'Category labels and search terms', default: DEFAULT_CATEGORY_TEXT, required: true }
    ],
    behaviorHints: { adult: true, p2p: false, configurable: true }
  });

  async function sourceCategories(source) {
    const hit = categoryCache.get(source);
    if (hit) return hit;
    let categories = [];
    try {
      const html = await fetchText(categoryListUrl(source), siteHosts(source));
      categories = parseSiteCategories(source, html);
    } catch { log({ event: 'category_discovery_failed', source }); }
    if (!categories.length) categories = DEFAULT_CATEGORIES.map(category => ({ ...category }));
    categoryCache.set(source, categories, 21600);
    return categories;
  }

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
    const source = sourceForCatalog(id);
    if (!source || type !== 'Porn') return { metas: [] };
    const preferences = resolvePreferences(userConfig, config.enabledSources);
    if (!preferences.enabledSources.includes(source)) return { metas: [] };
    const search = String(extra.search || '').trim().slice(0, 100);
    const genre = String(extra.genre || '').trim();
    const availableCategories = genre ? [...preferences.categories, ...(await sourceCategories(source))] : preferences.categories;
    const genreQuery = genre ? categoryTerm(availableCategories, genre) : '';
    if (genre && !genreQuery) return { metas: [] };
    const query = [genreQuery, search].filter(Boolean).join(' ').slice(0, 100);
    const skip = Math.max(0, Math.min(1000, Number.parseInt(extra.skip, 10) || 0));
    const page = Math.floor(skip / config.maxResults);
    const preferenceKey = JSON.stringify([preferences.enabledSources, preferences.primaryTag, preferences.categories]);
    const key = `${source}\0${preferenceKey}\0${genre}\0${search}\0${page}`;
    const cached = catalogCache.get(key);
    if (cached) return cached;
    let items = [];
    try {
      const html = await fetchText(listUrl(source, query, page), siteHosts(source));
      items = parseSite(source, html).slice(0, config.maxResults);
      for (const item of items) {
        item.genres = [...new Set([preferences.primaryTag, ...(genre ? [genre] : [])])];
        itemCache.set(item.id, item, 3600);
      }
    } catch { log({ event: 'source_failed', source }); }
    const response = { metas: items };
    catalogCache.set(key, response, config.cacheTtlSeconds);
    log({ event: 'catalog_complete', source, search: Boolean(search), genre: genre || undefined, results: response.metas.length });
    return response;
  });

  builder.defineMetaHandler(async ({ type, id, config: userConfig = {} }) => {
    if (type !== 'Porn') return { meta: null };
    const preferences = resolvePreferences(userConfig, config.enabledSources);
    const pageUrl = decodeId(id);
    if (!pageUrl || !preferences.enabledSources.includes(sourceForUrl(pageUrl))) return { meta: null };
    const known = itemCache.get(id);
    const baseTags = known?.genres || [preferences.primaryTag];
    try { return { meta: { ...known, ...metaFromExtraction(await extraction(pageUrl), id, pageUrl, baseTags) } }; }
    catch {
      if (known) return { meta: known };
      return { meta: { id, type: 'Porn', name: `${siteLabel(sourceForUrl(pageUrl))} video`, genres: baseTags,
        behaviorHints: { defaultVideoId: id } } };
    }
  });

  builder.defineStreamHandler(async ({ type, id, config: userConfig = {} }) => {
    if (type !== 'Porn') return { streams: [] };
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

  const addon = builder.getInterface();
  addon.discoverCategories = async () => Object.fromEntries(await Promise.all(
    config.enabledSources.map(async source => [source, await sourceCategories(source)])
  ));
  return addon;
}
