const PREFIX = 'prism-tube:';
const HOSTS = new Map([
  ['www.xvideos.com', 'xvideos'], ['xvideos.com', 'xvideos'],
  ['homo.xxx', 'homo'], ['www.homo.xxx', 'homo'],
  ['xhamster.com', 'xhamster'], ['www.xhamster.com', 'xhamster'],
  ['www.xnxx.com', 'xnxx'], ['xnxx.com', 'xnxx'],
  ['x.com', 'x'], ['www.x.com', 'x'], ['twitter.com', 'x'], ['www.twitter.com', 'x']
]);

export function sourceForUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
    const source = HOSTS.get(url.hostname.toLowerCase());
    if (!source) return null;
    if (source === 'x') {
      const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)\/?$/);
      return match ? `x:${match[1].toLowerCase()}` : null;
    }
    const validPath = source === 'homo' ? /^\/videos\/\d+\/?$/.test(url.pathname)
      : source === 'xhamster' ? /^\/videos\/[A-Za-z0-9._~-]+\/?$/.test(url.pathname)
        : /^\/video[.-][A-Za-z0-9._~-]+\/.+/.test(url.pathname);
    return validPath ? source : null;
  } catch { return null; }
}

export function encodeId(url) {
  if (!sourceForUrl(url)) throw new Error('Unsupported video URL');
  return PREFIX + Buffer.from(url).toString('base64url');
}

export function decodeId(id) {
  if (typeof id !== 'string' || !id.startsWith(PREFIX) || id.length > 2048) return null;
  try {
    const url = Buffer.from(id.slice(PREFIX.length), 'base64url').toString('utf8');
    return sourceForUrl(url) ? url : null;
  } catch { return null; }
}
