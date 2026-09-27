import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCategories, parseEncodedPreferences, resolvePreferences } from '../src/preferences.js';

test('preferences accept bounded custom categories and installed sources only', () => {
  const preferences = resolvePreferences({
    sources: 'homo,unknown,xnxx', primaryTag: ' Personal Picks ', categories: 'Tender=soft romance\nClassic=mature\nTender=duplicate'
  }, ['homo', 'xnxx', 'xvideos']);
  assert.deepEqual(preferences.enabledSources, ['homo', 'xnxx']);
  assert.equal(preferences.primaryTag, 'Personal Picks');
  assert.deepEqual(preferences.categories, [
    { label: 'Tender', query: 'soft romance' }, { label: 'Classic', query: 'mature' }
  ]);
});

test('encoded preferences reject malformed and oversized input', () => {
  assert.deepEqual(parseEncodedPreferences('{"sources":"homo"}'), { sources: 'homo' });
  assert.equal(parseEncodedPreferences('not-json'), null);
  assert.equal(parseEncodedPreferences('x'.repeat(3501)), null);
  assert.ok(parseCategories('').length > 0);
});
