import * as cheerio from 'cheerio';
import { encodeId } from './ids.js';

const clean = (value, limit = 300) => String(value || '')
  .replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);

const safeStatusUrl = (value, expectedHandle) => {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)\/?$/);
    if (url.protocol !== 'https:' || !['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname.toLowerCase()) || !match) return null;
    if (expectedHandle && match[1].toLowerCase() !== expectedHandle) return null;
    return `https://x.com/${match[1]}/status/${match[2]}`;
  } catch { return null; }
};

const safeMediaUrl = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['video.twimg.com', 'pbs.twimg.com'].includes(url.hostname.toLowerCase()) ? url.href : null;
  } catch { return null; }
};

export function parseTwitterFeed(xml, account) {
  const handle = String(account).toLowerCase();
  const $ = cheerio.load(xml, { xmlMode: true });
  const items = [];
  $('item, entry').each((_index, node) => {
    const item = $(node);
    const linkNode = item.find('link').first();
    const pageUrl = safeStatusUrl(linkNode.attr('href') || linkNode.text(), handle);
    const content = item.find('content\\:encoded').first().text() || item.find('description, content').first().text();
    const fragment = cheerio.load(content || '');
    const video = fragment('video[src]').first();
    const mediaUrl = safeMediaUrl(video.attr('src'));
    const poster = safeMediaUrl(video.attr('poster')) || safeMediaUrl(fragment('img[src]').first().attr('src'));
    if (!pageUrl || !mediaUrl) return;
    const title = clean(item.find('title').first().text()) || `Video from @${handle}`;
    const tags = [...new Set((content.match(/#[\p{L}\p{N}_]+/gu) || []).map(tag => tag.slice(1)).filter(Boolean))].slice(0, 20);
    const id = encodeId(pageUrl);
    items.push({ id, type: 'Porn', name: title, ...(poster ? { poster, background: poster } : {}), posterShape: 'landscape',
      description: `X · @${handle}`, genres: tags, behaviorHints: { defaultVideoId: id }, source: `X @${handle}`,
      url: pageUrl, mediaUrl, publishedAt: item.find('pubDate, published, updated').first().text() });
  });
  const seen = new Set();
  return items.filter(item => !seen.has(item.id) && seen.add(item.id));
}

export function createTwitterFeedFetcher(config, fetchImpl = fetch) {
  return async function fetchTwitterFeed(account) {
    if (!config.xAccounts.includes(account)) throw new Error('Unknown X account');
    const url = new URL(`/twitter/media/${encodeURIComponent(account)}/count=40`, `${config.rssHubBaseUrl}/`);
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(config.requestTimeoutMs),
      headers: { accept: 'application/rss+xml, application/xml;q=0.9', 'user-agent': config.userAgent } });
    if (!response.ok || Number(response.headers.get('content-length')) > 4_000_000) throw new Error('X feed request failed');
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 4_000_000) throw new Error('X feed is too large');
      chunks.push(chunk);
    }
    const xml = Buffer.concat(chunks).toString('utf8');
    return parseTwitterFeed(xml, account);
  };
}

export function twitterCatalogId(account) { return `prism-tube-x-${account}`; }
export function twitterAccount(source) { return String(source).startsWith('x:') ? String(source).slice(2) : null; }

export function streamFromTwitterItem(item, config) {
  if (!safeMediaUrl(item?.mediaUrl)) return null;
  return { name: 'Prism Tube · X video', title: `${item.source} · Video`, description: `${item.source} · Video`, url: item.mediaUrl,
    behaviorHints: { notWebReady: true, filename: `${clean(item.name, 100).replace(/[^\p{L}\p{N}._ -]+/gu, '') || 'x-video'}.mp4`,
      proxyHeaders: { request: { 'User-Agent': config.userAgent, Referer: item.url } } } };
}
