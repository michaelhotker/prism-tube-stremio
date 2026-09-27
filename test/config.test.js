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
