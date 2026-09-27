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
  const catalog = await addon.get('catalog', 'movie', 'prism-tube', { search: 'example' });
  assert.equal(catalog.metas.length, 1);
  const id = catalog.metas[0].id;
  assert.deepEqual((await addon.get('meta', 'movie', id)).meta, catalog.metas[0]);
  const streams = (await addon.get('stream', 'movie', id)).streams;
  assert.equal(streams.length, 2);
  assert.equal(streams[0].url, 'https://cdn.example/v.mp4');
  assert.equal(streams[1].externalUrl, pageUrl);
  await addon.get('catalog', 'movie', 'prism-tube', { search: 'example' });
  await addon.get('stream', 'movie', id);
  assert.equal(fetched, 1);
  assert.equal(extracted, 1);
});

test('disabled or malformed IDs cannot invoke extraction', async () => {
  let calls = 0;
  const addon = createAddon(config, { log: () => {}, fetchText: async () => '', extract: async () => { calls++; return {}; } });
  assert.deepEqual(await addon.get('stream', 'movie', 'bad'), { streams: [] });
  const disabled = encodeId('https://www.xvideos.com/video.abc/example');
  assert.deepEqual(await addon.get('stream', 'movie', disabled), { streams: [] });
  assert.equal(calls, 0);
});
