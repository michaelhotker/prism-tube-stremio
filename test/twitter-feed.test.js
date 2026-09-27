import test from 'node:test';
import assert from 'node:assert/strict';
import { createTwitterFeedFetcher, parseTwitterFeed, streamFromTwitterItem, twitterCatalogId } from '../src/twitter-feed.js';

const xml = `<?xml version="1.0"?><rss><channel><item>
  <title>New clip #Fitness</title><link>https://x.com/example/status/123456789</link>
  <description><![CDATA[New clip #Fitness<br><video src="https://video.twimg.com/ext_tw_video/123/vid/720x1280/a.mp4" poster="https://pbs.twimg.com/ext_tw_video_thumb/123/pu/img/a.jpg" controls="controls"></video>]]></description>
  <pubDate>Sun, 27 Sep 2026 10:00:00 GMT</pubDate>
</item><item><title>Photo only</title><link>https://x.com/example/status/2</link><description><![CDATA[<img src="https://pbs.twimg.com/media/a.jpg">]]></description></item></channel></rss>`;

test('RSSHub X media feed becomes bounded Stremio metadata with direct media', () => {
  const items = parseTwitterFeed(xml, 'example');
  assert.equal(items.length, 1);
  assert.equal(items[0].name, 'New clip #Fitness');
  assert.equal(items[0].poster, 'https://pbs.twimg.com/ext_tw_video_thumb/123/pu/img/a.jpg');
  assert.deepEqual(items[0].genres, ['Fitness']);
  assert.equal(twitterCatalogId('example'), 'prism-tube-x-example');
  const stream = streamFromTwitterItem(items[0], { userAgent: 'Test/1' });
  assert.match(stream.url, /^https:\/\/video\.twimg\.com\//);
  assert.equal(stream.behaviorHints.proxyHeaders.request.Referer, items[0].url);
});

test('feed fetcher uses only a configured account and the fixed RSSHub route', async () => {
  let request;
  const fetchFeed = createTwitterFeedFetcher({ xAccounts: ['example'], rssHubBaseUrl: 'http://rsshub:1200', requestTimeoutMs: 1000, userAgent: 'Test/1' }, async url => {
    request = String(url); return new Response(xml, { status: 200, headers: { 'content-type': 'application/rss+xml' } });
  });
  assert.equal((await fetchFeed('example')).length, 1);
  assert.equal(request, 'http://rsshub:1200/twitter/media/example/count=40');
  await assert.rejects(() => fetchFeed('unknown'), /Unknown X account/);
});
