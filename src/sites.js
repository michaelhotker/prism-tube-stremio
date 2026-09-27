import * as cheerio from 'cheerio';
import { encodeId } from './ids.js';

const clean = value => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
const absolute = (value, base) => {
  try { const url = new URL(value, base); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
};

const definitions = {
  xvideos: {
    label: 'XVideos', hosts: ['www.xvideos.com', 'xvideos.com'], base: 'https://www.xvideos.com',
    list(query, page) { return query ? `${this.base}/gay/${page || ''}?k=${encodeURIComponent(query)}` : `${this.base}/gay/${page || ''}`; },
    parse(html) {
      const $ = cheerio.load(html); const rows = [];
      $('.thumb-block, .frame-block.thumb-block').each((_i, node) => {
        const link = $(node).find('a[title][href^="/video."]').first();
        const image = $(node).find('.thumb img').first();
        rows.push(row(this, link.attr('href'), link.attr('title'), image.attr('data-src') || image.attr('src'), $(node).find('.duration').first().text()));
      });
      return rows.filter(Boolean);
    }
  },
  xnxx: {
    label: 'XNXX', hosts: ['www.xnxx.com', 'xnxx.com'], base: 'https://www.xnxx.com',
    list(query, page) { return query ? `${this.base}/search/gay/${encodeURIComponent(query)}${page ? `/${page}` : ''}` : `${this.base}/gay/${page || ''}`; },
    parse(html) {
      const $ = cheerio.load(html); const rows = [];
      $('.thumb-block').each((_i, node) => {
        const link = $(node).find('a[title][href^="/video-"]').first();
        const image = $(node).find('.thumb img').first();
        rows.push(row(this, link.attr('href'), link.attr('title'), image.attr('data-src') || image.attr('src'), $(node).find('.duration').first().text()));
      });
      return rows.filter(Boolean);
    }
  },
  homo: {
    label: 'Homo.xxx', hosts: ['homo.xxx', 'www.homo.xxx'], base: 'https://homo.xxx',
    list(query, page) { return query ? `${this.base}/search/${encodeURIComponent(query)}/${page ? `${page}/` : ''}` : `${this.base}/${page ? `new/${page}/` : 'new/'}`; },
    parse(html) {
      const $ = cheerio.load(html); const rows = [];
      $('.items-videos .item').each((_i, node) => {
        const link = $(node).find('a[href*="/videos/"][title]').first();
        const image = $(node).find('img.thumb').first();
        rows.push(row(this, link.attr('href'), link.attr('title'), image.attr('data-src') || image.attr('src'), $(node).find('.duration').first().text()));
      });
      return rows.filter(Boolean);
    }
  },
  xhamster: {
    label: 'xHamster', hosts: ['xhamster.com', 'www.xhamster.com'], base: 'https://xhamster.com',
    list(query, page) { return query ? `${this.base}/gay/search/${encodeURIComponent(query)}${page ? `/${page + 1}` : ''}` : `${this.base}/gay${page ? `/${page + 1}` : ''}`; },
    parse(html) {
      const $ = cheerio.load(html); const rows = [];
      $('.video-thumb[data-video-id]').each((_i, node) => {
        const link = $(node).find('a[data-role="thumb-link"][href*="/videos/"]').first();
        const image = $(node).find('img[data-role="thumb-preview-img"], img.thumb-image-container__image').first();
        rows.push(row(this, link.attr('href'), link.attr('aria-label') || link.attr('title'), image.attr('src'), $(node).find('[data-role="video-duration-container"], .thumb-image-container__duration').first().text()));
      });
      return rows.filter(Boolean);
    }
  }
};

function row(site, href, title, poster, duration) {
  const url = absolute(href, site.base);
  const name = clean(title).slice(0, 300);
  const image = absolute(poster, site.base);
  if (!url || !name || !image || !site.hosts.includes(new URL(url).hostname)) return null;
  try {
    return { id: encodeId(url), type: 'movie', name, poster: image, posterShape: 'landscape',
      description: [site.label, clean(duration)].filter(Boolean).join(' · '),
      behaviorHints: { defaultVideoId: encodeId(url) }, source: site.label, url };
  } catch { return null; }
}

export function getSite(name) { return definitions[name] || null; }
export function parseSite(name, html) {
  const site = getSite(name);
  if (!site) return [];
  const seen = new Set();
  return site.parse(html).filter(item => !seen.has(item.id) && seen.add(item.id));
}
export function listUrl(name, query = '', page = 0) {
  const site = getSite(name);
  if (!site) throw new Error('Unknown source');
  return site.list(clean(query).slice(0, 100), Math.max(0, Math.min(20, Number(page) || 0)));
}
export function siteHosts(name) { return [...(getSite(name)?.hosts || [])]; }
export function siteLabel(name) { return getSite(name)?.label || name; }
