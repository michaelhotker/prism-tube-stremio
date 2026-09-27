import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

test('configuration deduplicates and validates enabled sources', () => {
  const config = loadConfig({ ENABLED_SOURCES: 'homo,xnxx,homo' });
  assert.deepEqual(config.enabledSources, ['homo', 'xnxx']);
  assert.throws(() => loadConfig({ ENABLED_SOURCES: 'unknown' }), /ENABLED_SOURCES/);
});

test('private route token must be URL-safe and sufficiently long', () => {
  assert.throws(() => loadConfig({ ADDON_TOKEN: 'short' }), /ADDON_TOKEN/);
  assert.equal(loadConfig({ ADDON_TOKEN: 'abcdefghijklmnopqrstuvwx' }).addonToken.length, 24);
});

test('X accounts are normalized, bounded and added as configurable sources', () => {
  const config = loadConfig({ ENABLED_SOURCES: 'homo', X_ACCOUNTS: '@Example,second,example', RSSHUB_URL: 'http://rsshub:1200' });
  assert.deepEqual(config.xAccounts, ['example', 'second']);
  assert.deepEqual(config.availableSources, ['homo', 'x:example', 'x:second']);
  assert.equal(config.rssHubBaseUrl, 'http://rsshub:1200');
  assert.throws(() => loadConfig({ X_ACCOUNTS: 'not-valid!' }), /X_ACCOUNTS/);
});
