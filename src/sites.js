import * as cheerio from 'cheerio';
import { encodeId } from './ids.js';

const clean = value => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
const absolute = (value, base) => {
  try { const url = new URL(value, base); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
};

const definitions = {
  xvideos: {
    label: 'XVideos', hosts: ['www.xvideos.com', 'xvideos.com'], base: 'https://www.xvideos.com',
    categories: 'https://www.xvideos.com/tags',
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
    categories: 'https://www.xnxx.com/gay',
    list(query, page) { return `${this.base}/search/gay/${encodeURIComponent(query || 'gay')}${page ? `/${page}` : ''}`; },
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
    categories: 'https://homo.xxx/categories/',
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
    categories: 'https://xhamster.com/gay/categories',
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
    return { id: encodeId(url), type: 'Porn', name, poster: image, posterShape: 'landscape',
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

export function catalogId(name) { return getSite(name) ? `prism-tube-${name}` : null; }
export function sourceForCatalog(id) {
  const name = String(id || '').replace(/^prism-tube-/, '');
  return getSite(name) ? name : null;
}

export function categoryListUrl(name) {
  const site = getSite(name);
  if (!site) throw new Error('Unknown source');
  return site.categories;
}

const disallowedCategory = /(?:^|[\s_-])(?:teen|teens|young|underage|schoolgirl|schoolboy|boy|boys|18yo|18-year-old|18yearsold|girl|girls|woman|women|female|lesbian|milf|pussy|vagina)(?:$|[\s_-])/i;
const xvideosRelevantCategory = /(?:^|[\s_-])gay(?:$|[\s_-])|^(?:amateur|asian|bear|beard|bisexual|black|caucasian|couple|couples|daddy|femboy|hairy|interracial|jock|latin|latino|leather|male|man|massage|mature|men|military|muscular|solo|sports|twink|uniform)$/i;

export function parseSiteCategories(name, html, limit = 35) {
  const site = getSite(name);
  if (!site) return [];
  const $ = cheerio.load(html);
  const found = [];
  const add = (rawLabel, rawQuery, count = 0) => {
    const label = clean(rawLabel).replace(/-/g, ' ').slice(0, 40);
    const query = clean(rawQuery).slice(0, 60);
    if (!label || !query || !/[A-Za-z]/.test(label) || /^(?:and|or|the|videos?|free)$/i.test(label)) return;
    if (disallowedCategory.test(`${label} ${query}`) || (name === 'xvideos' && !xvideosRelevantCategory.test(`${label} ${query}`))) return;
    found.push({ label, query, count: Number(String(count).replace(/[,.]/g, '')) || 0, position: found.length });
  };
  if (name === 'xnxx') {
    const marker = 'thumb_block_list(';
    const start = html.indexOf(marker);
    const end = start < 0 ? -1 : html.indexOf('], "home-cat-list"', start + marker.length);
    if (start >= 0 && end > start && end - start < 1_000_000) {
      try {
        const categories = JSON.parse(html.slice(start + marker.length, end + 1));
        for (const category of categories) {
          const slug = new URL(category.u, site.base).pathname.match(/^\/search\/gay\/([^/]+)\/?$/)?.[1];
          if (!slug) continue;
          const label = $('<span>').html(category.t || category.tf || '').text();
          add(label, decodeURIComponent(slug.replace(/\+/g, ' ')), category.n);
        }
      } catch { /* fall back to ordinary category links */ }
    }
  }
  $('a[href]').each((_index, node) => {
    const rawHref = $(node).attr('href');
    let pathname;
    try { pathname = new URL(rawHref, site.base).pathname; } catch { return; }
    let slug;
    if (name === 'homo') slug = pathname.match(/^\/categories\/([^/]+)\/?$/)?.[1];
    if (name === 'xvideos') slug = pathname.match(/^\/tags\/([^/]+)\/?$/)?.[1];
    if (name === 'xnxx') slug = pathname.match(/^\/search\/gay\/([^/]+)\/?$/)?.[1];
    if (name === 'xhamster') slug = pathname.match(/^\/gay\/categories\/([^/]+)\/?$/)?.[1];
    if (!slug || slug.length < 2 || /^\d+$/.test(slug) || ['09', 'categories', 'videos', 'favorites'].includes(slug)) return;
    let label = clean($(node).text())
      .replace(/\s*\(?[\d,.]+\s+videos?\)?\s*$/i, '')
      .replace(/\s+[\d,.]+\s*$/, '')
      .trim();
    if (!label) label = decodeURIComponent(slug).replace(/[-_]+/g, ' ');
    label = label.slice(0, 40);
    const query = decodeURIComponent(slug).replace(/[-_]+/g, ' ').trim().slice(0, 60);
    const count = Number(clean($(node).text()).match(/([\d,.]+)(?:\s+videos?)?\)?\s*$/i)?.[1].replace(/[,.]/g, '')) || 0;
    add(label, query, count);
  });
  const seen = new Set();
  return found
    .sort(name === 'xvideos' ? (a, b) => b.count - a.count : (a, b) => a.position - b.position)
    .filter(category => {
      const key = category.label.toLocaleLowerCase('en');
      if (seen.has(key)) return false;
      seen.add(key); return true;
    })
    .slice(0, Math.max(1, Math.min(50, Number(limit) || 35)))
    .map(({ label, query }) => ({ label, query }));
}
