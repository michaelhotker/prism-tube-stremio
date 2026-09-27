# Prism Tube for Stremio

Prism Tube is a small, self-hosted Stremio add-on for browsing and playing videos from public gay sections of free tube sites. It currently supports XVideos, Homo.xxx, xHamster, and XNXX.

The add-on creates a searchable Stremio catalog with category filters for Romance, Amateur, Couples, Bear, Twink, Mature, Fitness, Black, Asian, and Latino. Results carry the configured primary/category tags, and their detail metadata is enriched with tags published on the original source page. Provider tags are deduplicated and capped to keep the Stremio interface readable. Its **Configure** button lets each installation enable or disable the provider adapters, change the primary tag, and replace the category labels and search terms. Selecting a result resolves the public source page with `yt-dlp` or the page's published player metadata, returns a short list of direct HTTP/HLS stream choices, and also provides an **Open on source site** fallback. It does not download, store, proxy, or rehost videos.

This is intended for adults, for personal and noncommercial use, where the source sites and content are lawful and available to you. It does not bypass logins, paywalls, age gates, captchas, geo-blocking, or other access controls.

## Requirements

- Node.js 22.16 or newer and Python 3.9 or newer; or
- Docker with Compose.

`youtube-dl-exec` installs and invokes a maintained `yt-dlp` binary. Python is needed by that binary.

## Run with Node.js

```sh
cp .env.example .env
npm ci
npm test
npm start
```

The default local manifest is:

```text
http://127.0.0.1:7000/manifest.json
```

Paste that URL into Stremio's add-on search/install field. The catalog is named **Prism Tube** and includes Stremio's catalog search control.

Open the add-on's **Configure** button, or visit `http://127.0.0.1:7000/configure`, to create a personalized manifest URL. The settings are encoded in that URL and are not stored by the server.

The configuration page only offers provider adapters installed by the server operator. Supporting a new domain requires a small adapter in the codebase so its public listing paths, page structure, and permitted video URLs can be validated. Arbitrary user-supplied domains are deliberately rejected to prevent the public service from becoming an unrestricted request proxy.

## Run with Docker

```sh
cp .env.example .env
docker compose up --build -d
```

The Compose configuration binds only to `127.0.0.1` by default. Use the same local manifest URL shown above.

## Private or remote installation

Set a random `ADDON_TOKEN` in `.env`:

```sh
openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
```

Then install:

```text
https://your-host.example/<ADDON_TOKEN>/manifest.json
```

Stremio accepts plain HTTP for local development. A remote add-on should be behind HTTPS. Keep the token private; it hides the route but is not an account system. Put the service behind your own authenticated reverse proxy if you need stronger access control.

## Configuration

The settings are documented in `.env.example`.

- `ENABLED_SOURCES` selects a comma-separated subset of `xvideos,homo,xhamster,xnxx`.
- `MAX_RESULTS` limits catalog results returned per request.
- `MAX_STREAMS` limits direct qualities returned per video.
- `CACHE_TTL_SECONDS` reduces repeated listing and extraction requests.
- `REQUEST_TIMEOUT_MS` and `EXTRACT_TIMEOUT_MS` bound slow source requests.
- `SEARCH_CONCURRENCY` controls how many listing sites are queried at once.

Per-install configuration can select a subset of the server's `ENABLED_SOURCES`. Custom categories use one `Label=search term` entry per line, with up to 20 entries.

The service uses a fixed source allowlist and accepts only recognized public video-page paths. Stream request headers are limited to User-Agent, Referer, and Origin. Extraction output is cached briefly because direct media URLs often expire.

## Checks

Run the deterministic test suite:

```sh
npm test
```

Optionally make one live listing request, resolve one result, and request the first byte of its media per enabled source:

```sh
npm run smoke:live
```

The live check depends on the sites being reachable from your network. Sites can change markup, block a region, require browser verification, or change playback delivery without notice. A result always includes its original source-page fallback, but that page can still impose its normal access requirements. Desktop Stremio is the most compatible target; browser playback can be limited by the media host's CORS or Referer policy.

## Source boundaries

GayMaleTube is not included. Its current site protection blocks ordinary automated access, and its published terms prohibit automated monitoring/scraping. This project does not attempt to evade those controls.

The MIT license covers this add-on's code only. Source pages, thumbnails, media, trademarks, and site terms remain the responsibility of their respective owners.
