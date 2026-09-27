# Prism Tube for Stremio

Prism Tube is a small, self-hosted Stremio add-on for browsing and playing videos from public gay sections of free tube sites and configured public X accounts. It supports XVideos, Homo.xxx, xHamster, XNXX, and automatic X media feeds through a bundled RSSHub service.

The add-on registers the custom Stremio content type **Porn**, so it appears under Porn in Discover rather than Movies. Each enabled provider has its own catalog row. Every configured X handle also gets a separate **Prism Tube · X @handle** row.

Each catalog pulls up to 35 current category tags from its provider when Stremio requests the manifest. Those tags are cached for six hours, combined with configured tags, deduplicated, and capped at 55 per catalog to keep the manifest compatible with Stremio. If a provider's category page is temporarily unavailable, the add-on uses its built-in fallback set. Video details can show up to 30 additional tags published on that video's source page. The **Configure** button lets each installation enable or disable provider adapters, change the primary tag, and add custom category labels and search terms. Selecting a result resolves the public source page with `yt-dlp` or the page's published player metadata, returns a short list of direct HTTP/HLS stream choices, and also provides an **Open on source site** fallback. It does not download, store, proxy, or rehost videos.

This is intended for adults, for personal and noncommercial use, where the source sites and content are lawful and available to you. It does not bypass logins, paywalls, age gates, captchas, or other access controls. A VPN may change the network region used by Docker, but it does not replace X account or age-verification requirements.

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

Paste that URL into Stremio's add-on search/install field. The separate provider catalogs include Stremio's catalog search control.

If you installed Prism Tube 1.2 or earlier, remove it from Stremio and install the manifest again. Stremio needs to reload the manifest to move the add-on from Movies to Porn and create the provider-specific catalogs.

Open the add-on's **Configure** button, or visit `http://127.0.0.1:7000/configure`, to create a personalized manifest URL. The settings are encoded in that URL and are not stored by the server.

The configuration page only offers provider adapters installed by the server operator. Supporting a new domain requires a small adapter in the codebase so its public listing paths, page structure, and permitted video URLs can be validated. Arbitrary user-supplied domains are deliberately rejected to prevent the public service from becoming an unrestricted request proxy.

## Run with Docker

```sh
cp .env.example .env
docker compose up --build -d
```

The Compose configuration binds only to `127.0.0.1` by default. Use the same local manifest URL shown above.

## Free automatic X catalogs

The Compose stack includes RSSHub and Redis. RSSHub watches the public media timeline of each configured X account; Prism Tube reads that private internal feed, keeps posts containing video, and returns the published X video URL to Stremio. No paid X API plan is used.

1. Sign in to X in your own browser. In the browser developer tools, open **Application/Storage → Cookies → https://x.com** and copy the value of the `auth_token` cookie. Do not copy the whole cookie header and never paste this value into chat, an issue, or a public repository.
2. In `.env`, set the token and the public accounts to follow:

```dotenv
TWITTER_AUTH_TOKEN=your_auth_token_value
X_ACCOUNTS=account_one,account_two
```

3. Rebuild and restart the stack:

```sh
docker compose up --build -d
```

4. Remove and reinstall the Prism Tube manifest, or use its **Configure** button and install the newly generated manifest. The new X rows should appear under **Porn** in Discover.

Use handles without `@`. Up to 30 accounts are accepted. Prism Tube polls only when a catalogue is requested, caches the result, and automatically picks up new videos after the cache expires. The token stays in the RSSHub container environment; Prism Tube never places it in a manifest, media URL, or log entry. If X invalidates the session, replace `TWITTER_AUTH_TOKEN` with the value from a current login and restart the stack.

Only public timeline media returned by X is included. Posts that require additional login, age confirmation, or other access checks can remain unavailable even when the host uses a VPN.

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
- `X_ACCOUNTS` selects a comma-separated list of public X handles; each becomes a separate catalogue.
- `TWITTER_AUTH_TOKEN` supplies RSSHub with the `auth_token` value from the operator's own X session. It is free but sensitive.
- `RSSHUB_URL` points Prism Tube at RSSHub; Compose sets this to its internal service automatically.
- `MAX_RESULTS` limits catalog results returned per request.
- `MAX_STREAMS` limits direct qualities returned per video.
- `CACHE_TTL_SECONDS` reduces repeated listing and extraction requests.
- `REQUEST_TIMEOUT_MS` and `EXTRACT_TIMEOUT_MS` bound slow source requests.
- `SEARCH_CONCURRENCY` controls how many listing sites are queried at once.

Per-install configuration can select a subset of the server's `ENABLED_SOURCES`; disabled providers are removed from the manifest and Discover. Custom categories use one `Label=search term` entry per line, with up to 20 entries and are combined with the categories fetched from each provider.

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
