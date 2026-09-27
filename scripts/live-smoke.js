import { loadConfig } from '../src/config.js';
import { createTextFetcher } from '../src/http.js';
import { createExtractor, streamsFromExtraction } from '../src/extractor.js';
import { listUrl, parseSite, siteHosts, siteLabel } from '../src/sites.js';

const config = loadConfig();
const fetchText = createTextFetcher(config);
const extract = createExtractor(config);
let failed = false;

async function checkMedia(stream) {
  const response = await fetch(stream.url, {
    signal: AbortSignal.timeout(12000),
    headers: { ...stream.behaviorHints?.proxyHeaders?.request, Range: 'bytes=0-0' }
  });
  const status = response.status;
  await response.body?.cancel();
  if (![200, 206].includes(status)) throw new Error(`Media returned HTTP ${status}`);
  return status;
}

for (const source of config.enabledSources) {
  try {
    const html = await fetchText(listUrl(source, 'romance', 0), siteHosts(source));
    const items = parseSite(source, html);
    if (!items.length) throw new Error('No listing results parsed');
    const data = await extract(items[0].url);
    const streams = streamsFromExtraction(data, items[0].url, config);
    if (!streams.length) throw new Error('No direct streams extracted');
    const status = await checkMedia(streams[0]);
    console.log(`${siteLabel(source)}: ${items.length} listing results; ${streams.length} direct stream option(s); media HTTP ${status}`);
  } catch (error) {
    failed = true;
    console.error(`${siteLabel(source)}: failed (${error.message})`);
  }
}

if (failed) process.exitCode = 1;
