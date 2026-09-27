const integer = (env, key, fallback, min, max) => {
  const value = env[key] === undefined || env[key] === '' ? fallback : Number(env[key]);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${key} must be an integer from ${min} to ${max}`);
  return value;
};

export const SOURCE_NAMES = ['xvideos', 'homo', 'xhamster', 'xnxx'];

const xAccounts = value => [...new Set(String(value || '')
  .split(',').map(account => account.trim().replace(/^@/, '').toLowerCase()).filter(Boolean))];

export function loadConfig(env = process.env) {
  const enabledSources = [...new Set(String(env.ENABLED_SOURCES || SOURCE_NAMES.join(','))
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean))];
  if (!enabledSources.length || enabledSources.some(value => !SOURCE_NAMES.includes(value))) {
    throw new Error(`ENABLED_SOURCES must contain: ${SOURCE_NAMES.join(', ')}`);
  }
  const addonToken = env.ADDON_TOKEN || '';
  if (addonToken && !/^[A-Za-z0-9_-]{24,128}$/.test(addonToken)) throw new Error('ADDON_TOKEN must be 24-128 URL-safe characters');
  const userAgent = env.USER_AGENT || 'Mozilla/5.0 (compatible; PrismTube/1.0; personal self-hosted use)';
  if (/[\u0000-\u001f\u007f]/.test(userAgent) || userAgent.length > 300) throw new Error('Invalid USER_AGENT');
  const accounts = xAccounts(env.X_ACCOUNTS);
  if (accounts.some(account => !/^[a-z0-9_]{1,15}$/.test(account)) || accounts.length > 30) {
    throw new Error('X_ACCOUNTS must contain at most 30 valid X handles');
  }
  const rssHubUrl = env.RSSHUB_URL || 'http://127.0.0.1:1200';
  let rssHubBaseUrl;
  try {
    const parsed = new URL(rssHubUrl);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
    rssHubBaseUrl = parsed.href.replace(/\/$/, '');
  } catch { throw new Error('RSSHUB_URL must be an HTTP or HTTPS URL without credentials'); }
  const availableSources = [...enabledSources, ...accounts.map(account => `x:${account}`)];
  return {
    host: env.HOST || '127.0.0.1',
    port: integer(env, 'PORT', 7000, 1, 65535),
    addonToken,
    enabledSources,
    xAccounts: accounts,
    availableSources,
    rssHubBaseUrl,
    userAgent,
    requestTimeoutMs: integer(env, 'REQUEST_TIMEOUT_MS', 12000, 1000, 60000),
    extractTimeoutMs: integer(env, 'EXTRACT_TIMEOUT_MS', 25000, 3000, 120000),
    cacheTtlSeconds: integer(env, 'CACHE_TTL_SECONDS', 300, 0, 3600),
    maxCacheEntries: integer(env, 'MAX_CACHE_ENTRIES', 500, 10, 5000),
    maxResults: integer(env, 'MAX_RESULTS', 60, 4, 200),
    maxStreams: integer(env, 'MAX_STREAMS', 4, 1, 10),
    searchConcurrency: integer(env, 'SEARCH_CONCURRENCY', 2, 1, 4)
  };
}
