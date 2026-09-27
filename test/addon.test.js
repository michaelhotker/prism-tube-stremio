import test from 'node:test';
import assert from 'node:assert/strict';
import { createAddon } from '../src/addon.js';
import { encodeId } from '../src/ids.js';

const config = { enabledSources: ['homo'], userAgent: 'Test/1', requestTimeoutMs: 1000, extractTimeoutMs: 5000,
  cacheTtlSeconds: 300, maxCacheEntries: 50, maxResults: 20, maxStreams: 2, searchConcurrency: 1 };
const pageUrl = 'https://homo.xxx/videos/1234/';
const html = `<div class="items-videos"><div class="item"><a href="${pageUrl}" title="Example"><img class="thumb" data-src="https://img.example/p.jpg"></a></div></div>`;

test('catalog, metadata and stream handlers form a complete Stremio flow', async () => {
  let fetched = 0; let extracted = 0;
  const addon = createAddon(config, {
    log: () => {}, fetchText: async () => { fetched++; return html; },
    extract: async () => { extracted++; return { title: 'Example', thumbnail: 'https://img.example/p.jpg', formats: [
      { url: 'https://cdn.example/v.mp4', height: 720, ext: 'mp4', vcodec: 'h264', acodec: 'aac' }
    ] }; }
  });
  assert.deepEqual(addon.manifest.types, ['Porn']);
  assert.deepEqual(addon.manifest.catalogs.map(catalog => catalog.id), ['prism-tube-homo']);
  const catalog = await addon.get('catalog', 'Porn', 'prism-tube-homo', { search: 'example' });
  assert.equal(catalog.metas.length, 1);
  const id = catalog.metas[0].id;
  const meta = (await addon.get('meta', 'Porn', id)).meta;
  assert.equal(meta.id, catalog.metas[0].id);
  assert.deepEqual(meta.genres, ['Gay Male']);
  const streams = (await addon.get('stream', 'Porn', id)).streams;
  assert.equal(streams.length, 2);
  assert.equal(streams[0].url, 'https://cdn.example/v.mp4');
  assert.equal(streams[1].externalUrl, pageUrl);
  await addon.get('catalog', 'Porn', 'prism-tube-homo', { search: 'example' });
  await addon.get('stream', 'Porn', id);
  assert.equal(fetched, 1);
  assert.equal(extracted, 1);
});

test('manifest categories filter provider searches and tag catalog results', async () => {
  let requestedUrl;
  const addon = createAddon(config, {
    log: () => {}, fetchText: async url => { requestedUrl = url; return html; }, extract: async () => ({})
  });
  const genreExtra = addon.manifest.catalogs[0].extra.find(extra => extra.name === 'genre');
  assert.ok(genreExtra.options.includes('Romance'));
  const catalog = await addon.get('catalog', 'Porn', 'prism-tube-homo', { genre: 'Romance', search: 'story' });
  assert.match(requestedUrl, /search\/romance%20story\//);
  assert.deepEqual(catalog.metas[0].genres, ['Gay Male', 'Romance']);
  assert.deepEqual(await addon.get('catalog', 'Porn', 'prism-tube-homo', { genre: 'Unknown' }), { metas: [] });
});

test('per-install configuration changes sources, category terms and result tags', async () => {
  let requestedUrl;
  const multiConfig = { ...config, enabledSources: ['homo', 'xnxx'] };
  const addon = createAddon(multiConfig, {
    log: () => {}, fetchText: async url => { requestedUrl = url; return html; }, extract: async () => ({})
  });
  const userConfig = { sources: 'homo', primaryTag: 'My Library', categories: 'Tender=romance\nClassic=mature' };
  const catalog = await addon.get('catalog', 'Porn', 'prism-tube-homo', { genre: 'Tender' }, userConfig);
  assert.match(requestedUrl, /search\/romance\//);
  assert.deepEqual(catalog.metas[0].genres, ['My Library', 'Tender']);
  const disabled = encodeId('https://www.xnxx.com/video-abc123/example');
  assert.deepEqual(await addon.get('catalog', 'Porn', 'prism-tube-xnxx', {}, userConfig), { metas: [] });
  assert.deepEqual(await addon.get('stream', 'Porn', disabled, {}, userConfig), { streams: [] });
});

test('disabled or malformed IDs cannot invoke extraction', async () => {
  let calls = 0;
  const addon = createAddon(config, { log: () => {}, fetchText: async () => '', extract: async () => { calls++; return {}; } });
  assert.deepEqual(await addon.get('stream', 'Porn', 'bad'), { streams: [] });
  const disabled = encodeId('https://www.xvideos.com/video.abc/example');
  assert.deepEqual(await addon.get('stream', 'Porn', disabled), { streams: [] });
  assert.equal(calls, 0);
});
