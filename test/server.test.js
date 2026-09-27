import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/server.js';

const config = { host: '127.0.0.1', port: 0, addonToken: '', enabledSources: ['homo', 'xnxx'], userAgent: 'Test/1',
  requestTimeoutMs: 1000, extractTimeoutMs: 5000, cacheTtlSeconds: 300, maxCacheEntries: 50,
  maxResults: 20, maxStreams: 2, searchConcurrency: 1 };

test('configure page creates a customized manifest route', async t => {
  const app = createApp(config, { log: () => {}, fetchText: async () => '', extract: async () => ({}) });
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(`${base}/configure`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Install configured add-on/);
  const preferences = encodeURIComponent(JSON.stringify({ sources: 'homo', primaryTag: 'My Tag', categories: 'Tender=romance' }));
  const manifest = await (await fetch(`${base}/${preferences}/manifest.json`)).json();
  assert.equal(manifest.version, '1.2.0');
  assert.equal(manifest.behaviorHints.configurable, undefined);
  assert.deepEqual(manifest.catalogs[0].extra.find(extra => extra.name === 'genre').options, ['Tender']);
});
