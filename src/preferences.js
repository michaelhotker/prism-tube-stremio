export const DEFAULT_CATEGORIES = Object.freeze([
  ['Romance', 'romance'],
  ['Amateur', 'amateur'],
  ['Couples', 'couple'],
  ['Bear', 'bear'],
  ['Twink', 'twink'],
  ['Mature', 'mature'],
  ['Fitness', 'muscle'],
  ['Black', 'black'],
  ['Asian', 'asian'],
  ['Latino', 'latino']
].map(([label, query]) => Object.freeze({ label, query })));

export const DEFAULT_CATEGORY_TEXT = DEFAULT_CATEGORIES.map(({ label, query }) => `${label}=${query}`).join('\n');

const clean = (value, limit) => String(value || '')
  .replace(/[\u0000-\u001f\u007f/\\]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);

export function parseCategories(input) {
  const text = typeof input === 'string' ? input : DEFAULT_CATEGORY_TEXT;
  const seen = new Set();
  const output = [];
  for (const entry of text.split(/[\n,]+/)) {
    const separator = entry.indexOf('=');
    const label = clean(separator < 0 ? entry : entry.slice(0, separator), 28);
    const query = clean(separator < 0 ? entry : entry.slice(separator + 1), 60);
    const key = label.toLocaleLowerCase('en');
    if (!label || !query || seen.has(key)) continue;
    seen.add(key);
    output.push({ label, query });
    if (output.length === 20) break;
  }
  return output.length ? output : DEFAULT_CATEGORIES.map(category => ({ ...category }));
}

export function resolvePreferences(raw, allowedSources) {
  const allowed = [...new Set(allowedSources)];
  const requested = typeof raw?.sources === 'string'
    ? raw.sources.split(',').map(value => value.trim().toLowerCase()).filter(Boolean)
    : allowed;
  const enabledSources = [...new Set(requested.filter(source => allowed.includes(source)))];
  return {
    enabledSources: enabledSources.length ? enabledSources : allowed,
    primaryTag: clean(raw?.primaryTag, 32) || 'Gay Male',
    categories: parseCategories(raw?.categories)
  };
}

export function categoryTerm(categories, label) {
  return categories.find(category => category.label === String(label || ''))?.query || null;
}

export function parseEncodedPreferences(value) {
  if (typeof value !== 'string' || !value || value.length > 3500) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

