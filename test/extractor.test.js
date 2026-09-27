import test from 'node:test';
import assert from 'node:assert/strict';
import { createExtractor, streamsFromExtraction, metaFromExtraction, parsePublicPlayerPage } from '../src/extractor.js';
import { encodeId } from '../src/ids.js';

const pageUrl = 'https://homo.xxx/videos/1234/';
const config = { extractTimeoutMs: 5000, userAgent: 'Test/1.0', maxStreams: 3 };

test('extractor invokes yt-dlp without downloading media and with a deadline', async () => {
  let call;
  const runner = async (...args) => { call = args; return { title: 'Example', url: 'https://cdn.example/v.mp4' }; };
  const result = await createExtractor(config, runner)(pageUrl);
  assert.equal(result.title, 'Example');
  assert.equal(call[0], pageUrl);
  assert.equal(call[1].skipDownload, true);
  assert.equal(call[1].noPlaylist, true);
  assert.equal(call[2].timeout, 5000);
});

test('stream conversion selects bounded audio-video qualities and safe proxy headers', () => {
  const data = { title: 'Example: Video', http_headers: { Cookie: 'secret', Referer: pageUrl, 'User-Agent': 'Extractor/1' }, formats: [
    { url: 'https://cdn.example/1080.m3u8', height: 1080, ext: 'mp4', protocol: 'm3u8_native', vcodec: 'h264', acodec: 'aac' },
    { url: 'https://cdn.example/1080-alt.m3u8', height: 1080, ext: 'mp4', protocol: 'm3u8_native', vcodec: 'h264', acodec: 'aac' },
    { url: 'https://cdn.example/720.mp4', height: 720, ext: 'mp4', vcodec: 'h264', acodec: 'aac' },
    { url: 'https://cdn.example/video-only.mp4', height: 2160, vcodec: 'h264', acodec: 'none' }
  ] };
  const streams = streamsFromExtraction(data, pageUrl, config);
  assert.equal(streams.length, 2);
  assert.match(streams[0].name, /1080p/);
  assert.equal(streams[0].behaviorHints.notWebReady, true);
  assert.equal(streams[0].behaviorHints.proxyHeaders.request.Cookie, undefined);
  assert.equal(streams[0].behaviorHints.proxyHeaders.request.Referer, pageUrl);
});

test('metadata uses extracted title and poster', () => {
  const id = encodeId(pageUrl);
  const meta = metaFromExtraction({ title: 'Example', thumbnail: 'https://img.example/poster.jpg', duration_string: '12:34' }, id, pageUrl);
  assert.equal(meta.id, id);
  assert.equal(meta.name, 'Example');
  assert.equal(meta.posterShape, 'landscape');
});

test('public JSON-LD player metadata provides a fallback direct stream', async () => {
  const html = `<script type="application/ld+json">${JSON.stringify({ name: 'Example', thumbnailUrl: ['https://img.example/poster.jpg'],
    duration: 'PT00H05M03S', contentUrl: 'https://cdn.example/video_720p.mp4' })}</script>`;
  const parsed = parsePublicPlayerPage('xvideos', html);
  assert.equal(parsed.formats[0].height, 720);
  assert.equal(parsed.duration_string, '0:05:03');
  const extracted = await createExtractor(config, async () => { throw new Error('unsupported'); }, async () => html)(
    'https://www.xvideos.com/video.abc123/example'
  );
  assert.equal(extracted.formats[0].url, 'https://cdn.example/video_720p.mp4');
});

test('public xHamster player metadata provides its advertised qualities', () => {
  const player = { videoTitle: 'Example', sources: { mp4: { '240p': 'https://cdn.example/240.mp4', '720p': 'https://cdn.example/720.mp4' } } };
  const html = `<meta property="og:image" content="https://img.example/poster.jpg"><script>window.initials=${JSON.stringify({ player })};</script>`;
  const parsed = parsePublicPlayerPage('xhamster', html);
  assert.deepEqual(parsed.formats.map(format => format.height), [240, 720]);
});
