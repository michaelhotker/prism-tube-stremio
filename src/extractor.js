import youtubedl from 'youtube-dl-exec';
import * as cheerio from 'cheerio';
import { createTextFetcher } from './http.js';
import { sourceForUrl } from './ids.js';
import { siteHosts } from './sites.js';

const SOURCE_LABELS = { xvideos: 'XVideos', homo: 'Homo.xxx', xhamster: 'xHamster', xnxx: 'XNXX' };

function safeHeaderMap(headers, pageUrl, userAgent) {
  const output = { 'User-Agent': userAgent, Referer: pageUrl };
  for (const [key, value] of Object.entries(headers || {})) {
    if (['user-agent', 'referer', 'origin'].includes(key.toLowerCase()) && typeof value === 'string' && !/[\r\n]/.test(value)) output[key] = value;
  }
  return output;
}

const httpsUrl = value => {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
};

function durationString(value) {
  const match = String(value || '').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return undefined;
  const parts = [match[1], match[2], match[3]].filter(value => value !== undefined).map((value, index, values) => index ? value.padStart(2, '0') : String(Number(value)));
  return parts.join(':');
}

function findPlayer(value, seen = new WeakSet(), depth = 0) {
  if (!value || typeof value !== 'object' || depth > 20 || seen.has(value)) return null;
  seen.add(value);
  if (value.sources?.mp4 && typeof value.sources.mp4 === 'object') return value;
  for (const child of Object.values(value)) {
    const found = findPlayer(child, seen, depth + 1);
    if (found) return found;
  }
  return null;
}

function normalizedTags(values, limit = 14) {
  const seen = new Set();
  const tags = [];
  for (const value of values.flat()) {
    const tag = clean(value).replace(/\s+/g, ' ').slice(0, 40);
    const key = tag.toLocaleLowerCase('en');
    if (!tag || tag.length < 2 || seen.has(key)) continue;
    seen.add(key); tags.push(tag);
    if (tags.length === limit) break;
  }
  return tags;
}

export function parsePublicPlayerPage(source, html) {
  const $ = cheerio.load(html);
  let tags = [];
  if (source === 'xvideos' || source === 'xnxx') tags = $('.is-keyword').map((_index, node) => $(node).text()).get();
  if (source === 'homo') tags = $('a[href*="/categories/"]').map((_index, node) => $(node).text()).get()
    .filter(tag => tag.trim().toLocaleLowerCase('en') !== 'categories');
  if (source === 'xvideos' || source === 'xnxx') {
    for (const node of $('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse($(node).text());
        const url = httpsUrl(data.contentUrl);
        if (!url) continue;
        const thumbnail = (Array.isArray(data.thumbnailUrl) ? data.thumbnailUrl : [data.thumbnailUrl]).map(httpsUrl).find(Boolean);
        const height = Number(url.match(/video_(\d{3,4})p/i)?.[1]) || undefined;
        return { title: clean(data.name || 'Tube video'), thumbnail, duration_string: durationString(data.duration), tags: normalizedTags(tags),
          formats: [{ url, height, ext: 'mp4', vcodec: 'unknown', acodec: 'unknown' }] };
      } catch { /* try the next JSON-LD block */ }
    }
  }
  if (source === 'xhamster') {
    const marker = 'window.initials=';
    const start = html.indexOf(marker);
    const end = start < 0 ? -1 : html.indexOf(';</script>', start + marker.length);
    if (start >= 0 && end > start && end - start < 2_000_000) {
      try {
        const initials = JSON.parse(html.slice(start + marker.length, end));
        const player = findPlayer(initials);
        tags = (initials.videoTagsComponent?.tags || [])
          .filter(tag => tag?.isCategory || tag?.isTag)
          .map(tag => tag.name);
        const formats = Object.entries(player?.sources?.mp4 || {}).map(([label, value]) => ({
          url: httpsUrl(value), height: Number(label.match(/(\d{3,4})p/i)?.[1]) || undefined,
          ext: 'mp4', vcodec: 'unknown', acodec: 'unknown'
        })).filter(format => format.url);
        if (formats.length) return { title: clean(player.videoTitle || $('meta[property="og:title"]').attr('content') || 'Tube video'),
          thumbnail: httpsUrl($('meta[property="og:image"]').attr('content')), tags: normalizedTags(tags), formats };
      } catch { /* fall through to a generic extraction error */ }
    }
  }
  if (source === 'homo' && tags.length) return {
    title: clean($('meta[property="og:title"]').attr('content') || 'Tube video'),
    thumbnail: httpsUrl($('meta[property="og:image"]').attr('content')),
    tags: normalizedTags(tags)
  };
  throw new Error('Public player metadata was not found');
}

const hasMedia = data => Boolean(data?.url || data?.formats?.some(format => format?.url));

export function createExtractor(config, runner = youtubedl, pageFetcher = createTextFetcher(config)) {
  return async function extract(pageUrl) {
    const source = sourceForUrl(pageUrl);
    if (!source) throw new Error('Unsupported video URL');
    let pageData;
    try { pageData = parsePublicPlayerPage(source, await pageFetcher(pageUrl, siteHosts(source))); }
    catch { /* the maintained extractor may still support this page */ }
    if (hasMedia(pageData)) return pageData;
    let data;
    try {
      data = await runner(pageUrl, {
        dumpSingleJson: true, noPlaylist: true, noWarnings: true, skipDownload: true,
        socketTimeout: Math.max(3, Math.floor(config.extractTimeoutMs / 1000)),
        userAgent: config.userAgent
      }, { timeout: config.extractTimeoutMs, killSignal: 'SIGKILL', maxBuffer: 8 * 1024 * 1024 });
    } catch { /* handled below */ }
    if (data && typeof data === 'object' && hasMedia(data)) return {
      ...pageData,
      ...data,
      thumbnail: data.thumbnail || pageData?.thumbnail,
      title: data.title || pageData?.title,
      tags: normalizedTags([pageData?.tags || [], data.categories || [], data.tags || []])
    };
    throw new Error('Video extraction failed');
  };
}

const heightOf = format => Number(format.height) || (String(format.format_note || '').match(/(\d{3,4})p/i)?.[1] | 0);
const quality = format => heightOf(format) ? `${heightOf(format)}p` : clean(format.format_note || format.format_id || 'Video');
const clean = value => String(value || '').replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 180);

export function streamsFromExtraction(data, pageUrl, config) {
  const source = sourceForUrl(pageUrl);
  const sourceLabel = SOURCE_LABELS[source] || source;
  const formats = Array.isArray(data.formats) ? [...data.formats] : [];
  if (data.url) formats.push({ url: data.url, ext: data.ext, height: data.height, width: data.width,
    format_id: data.format_id, format_note: data.format_note, protocol: data.protocol,
    vcodec: data.vcodec, acodec: data.acodec, http_headers: data.http_headers });
  const playable = formats.filter(format => {
    try {
      const url = new URL(format.url);
      return ['http:', 'https:'].includes(url.protocol) && format.vcodec !== 'none' && format.acodec !== 'none';
    } catch { return false; }
  }).sort((a, b) => heightOf(b) - heightOf(a) || Number(b.tbr || 0) - Number(a.tbr || 0));
  const seen = new Set();
  const selected = playable.filter(format => {
    const transport = String(format.protocol || '').includes('m3u8') || new URL(format.url).pathname.endsWith('.m3u8') ? 'hls' : 'http';
    const key = `${heightOf(format) || 'unknown'}:${transport}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, config.maxStreams);
  const title = clean(data.title || 'Video');
  const headers = safeHeaderMap(data.http_headers, pageUrl, config.userAgent);
  return selected.map(format => {
    const q = quality(format);
    const ext = clean(format.ext || 'mp4').replace(/[^a-z0-9]/gi, '') || 'mp4';
    return {
      name: `Prism Tube · ${q}`,
      title: `${sourceLabel} · ${q}`,
      description: `${sourceLabel} · ${q}`,
      url: format.url,
      behaviorHints: {
        notWebReady: true,
        filename: `${title.replace(/[^\p{L}\p{N}._ -]+/gu, '').slice(0, 100) || 'video'}.${ext}`,
        proxyHeaders: { request: headers }
      }
    };
  });
}

export function metaFromExtraction(data, id, pageUrl, baseTags = []) {
  const thumbnails = Array.isArray(data.thumbnails) ? data.thumbnails : [];
  const poster = data.thumbnail || thumbnails.at(-1)?.url;
  return {
    id, type: 'movie', name: clean(data.title || 'Tube video'),
    ...(poster ? { poster, background: poster } : {}),
    posterShape: 'landscape',
    description: [SOURCE_LABELS[sourceForUrl(pageUrl)], data.duration_string].filter(Boolean).join(' · '),
    genres: normalizedTags([baseTags, data.categories || [], data.tags || []]),
    behaviorHints: { defaultVideoId: id }
  };
}
