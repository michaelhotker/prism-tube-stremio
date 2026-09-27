import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/server.js';

const config = { host: '127.0.0.1', port: 0, addonToken: '', enabledSources: ['homo', 'xnxx'], userAgent: 'Test/1',
  requestTimeoutMs: 1000, extractTimeoutMs: 5000, cacheTtlSeconds: 300, maxCacheEntries: 50,
  maxResults: 20, maxStreams: 2, searchConcurrency: 1 };

test('configure page creates separate Porn catalogs with provider tags', async t => {
  const categories = '<a href="/categories/massage/">Massage (900 videos)</a><a href="/categories/bear/">Bear (800 videos)</a>';
  const app = createApp(config, { log: () => {}, fetchText: async () => categories, extract: async () => ({}) });
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(`${base}/configure`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Install configured add-on/);
  const preferences = encodeURIComponent(JSON.stringify({ sources: 'homo', primaryTag: 'My Tag', categories: 'Tender=romance' }));
  const manifest = await (await fetch(`${base}/${preferences}/manifest.json`)).json();
  assert.equal(manifest.version, '1.4.0');
  assert.deepEqual(manifest.types, ['Porn']);
  assert.equal(manifest.behaviorHints.configurable, undefined);
  assert.deepEqual(manifest.catalogs.map(catalog => catalog.id), ['prism-tube-homo']);
  assert.deepEqual(manifest.catalogs[0].extra.find(extra => extra.name === 'genre').options, ['Massage', 'Bear', 'Tender']);
});

test('configure page exposes each server-configured X account as a provider', async t => {
  const xConfig = { ...config, xAccounts: ['example'], availableSources: ['homo', 'xnxx', 'x:example'], rssHubBaseUrl: 'http://rsshub:1200' };
  const app = createApp(xConfig, { log: () => {}, fetchText: async () => '', fetchTwitterFeed: async () => [], extract: async () => ({}) });
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());
  await once(server, 'listening');
  const page = await fetch(`http://127.0.0.1:${server.address().port}/configure`);
  assert.match(await page.text(), /X @example/);
});
