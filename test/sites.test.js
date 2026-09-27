import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogId, categoryListUrl, parseSite, parseSiteCategories, listUrl, sourceForCatalog } from '../src/sites.js';
import { DEFAULT_CATEGORIES, categoryTerm } from '../src/preferences.js';
import { decodeId, encodeId, sourceForUrl } from '../src/ids.js';

const fixtures = {
  xvideos: `<div class="frame-block thumb-block"><div class="thumb"><a href="/video.abc123/example"><img data-src="https://img.example/x.jpg"></a></div><a href="/video.abc123/example" title="Example Video"></a><span class="duration">12 min</span></div>`,
  xnxx: `<div class="thumb-block"><div class="thumb"><a href="/video-abc123/example"><img data-src="https://img.example/x.jpg"></a></div><a href="/video-abc123/example" title="Example Video"></a><span class="duration">8 min</span></div>`,
  homo: `<div class="items-videos"><div class="item"><a href="https://homo.xxx/videos/1234/" title="Example Video"><img class="thumb" data-src="https://img.example/h.jpg"></a><span class="duration">6 min</span></div></div>`,
  xhamster: `<div class="video-thumb" data-video-id="42"><a data-role="thumb-link" href="https://xhamster.com/videos/example-xhABC" aria-label="Example Video"><img data-role="thumb-preview-img" src="https://img.example/a.jpg"></a><div data-role="video-duration-container">9:12</div></div>`
};

for (const [source, html] of Object.entries(fixtures)) test(`parses ${source} listings into Stremio metadata`, () => {
  const rows = parseSite(source, html);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Example Video');
  assert.equal(rows[0].type, 'Porn');
  assert.equal(rows[0].posterShape, 'landscape');
  assert.ok(decodeId(rows[0].id));
});

test('IDs only round-trip supported HTTPS video pages', () => {
  const url = 'https://www.xvideos.com/video.abc123/example';
  assert.equal(decodeId(encodeId(url)), url);
  assert.equal(sourceForUrl('http://www.xvideos.com/video.abc123/example'), null);
  assert.equal(sourceForUrl('https://evil.example/video.abc123/example'), null);
  assert.equal(sourceForUrl('https://www.xvideos.com/account/private'), null);
  assert.equal(decodeId('prism-tube:aW52YWxpZA'), null);
});

test('search URLs remain fixed to gay-scoped public listing paths', () => {
  assert.match(listUrl('xvideos', 'soft romance', 0), /^https:\/\/www\.xvideos\.com\/gay\/\?k=soft%20romance$/);
  assert.equal(listUrl('xnxx', 'soft romance', 0), 'https://www.xnxx.com/search/gay/soft%20romance');
  assert.equal(listUrl('xnxx', '', 0), 'https://www.xnxx.com/search/gay/gay');
  assert.equal(listUrl('homo', 'soft romance', 2), 'https://homo.xxx/search/soft%20romance/2/');
  assert.equal(listUrl('xhamster', 'soft romance', 1), 'https://xhamster.com/gay/search/soft%20romance/2');
});

test('catalog categories map to bounded neutral search terms', () => {
  assert.ok(DEFAULT_CATEGORIES.some(category => category.label === 'Romance'));
  assert.equal(categoryTerm(DEFAULT_CATEGORIES, 'Fitness'), 'muscle');
  assert.equal(categoryTerm(DEFAULT_CATEGORIES, 'Unknown'), null);
});

test('provider category pages become clean, bounded Discover tags', () => {
  const html = '<a href="/categories/bear/">Bear (1200 videos)</a><a href="/categories/massage/">Massage (450 videos)</a><a href="/categories/teen/">Teen (9999 videos)</a><a href="/categories/2/">Next</a>';
  assert.deepEqual(parseSiteCategories('homo', html), [
    { label: 'Bear', query: 'bear' }, { label: 'Massage', query: 'massage' }
  ]);
  assert.equal(categoryListUrl('homo'), 'https://homo.xxx/categories/');
  assert.equal(catalogId('homo'), 'prism-tube-homo');
  assert.equal(sourceForCatalog('prism-tube-homo'), 'homo');
  assert.equal(sourceForCatalog('prism-tube-unknown'), null);
});

test('XNXX gay category data is read from its published page payload', () => {
  const data = [
    { u: '/search/gay/massage?top&id=1', t: 'Massage', n: '12,000' },
    { u: '/search/gay/bear?top&id=2', t: 'Bear', n: '4,500' }
  ];
  const html = `<script>thumb_block_list(${JSON.stringify(data)}, "home-cat-list");</script>`;
  assert.deepEqual(parseSiteCategories('xnxx', html), [
    { label: 'Massage', query: 'massage' }, { label: 'Bear', query: 'bear' }
  ]);
});
