export function createTextFetcher(config, fetchImpl = fetch) {
  return async function fetchText(input, allowedHosts) {
    let url = new URL(input);
    const hosts = new Set(allowedHosts);
    const signal = AbortSignal.timeout(config.requestTimeoutMs);
    try {
      for (let hop = 0; hop <= 3; hop++) {
        if (url.protocol !== 'https:' || !hosts.has(url.hostname)) throw new Error();
        const response = await fetchImpl(url, {
          signal, redirect: 'manual', headers: { 'user-agent': config.userAgent, accept: 'text/html,application/xhtml+xml' }
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          await response.body?.cancel();
          const location = response.headers.get('location');
          if (!location || hop === 3) throw new Error();
          url = new URL(location, url);
          continue;
        }
        if (!response.ok || Number(response.headers.get('content-length')) > 4_000_000) throw new Error();
        const chunks = []; let size = 0;
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > 4_000_000) throw new Error();
          chunks.push(chunk);
        }
        return Buffer.concat(chunks).toString('utf8');
      }
    } catch { throw new Error('Source request failed'); }
  };
}
