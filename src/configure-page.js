import { DEFAULT_CATEGORY_TEXT, resolvePreferences } from './preferences.js';
import { siteLabel } from './sites.js';

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

export function configuredManifest(baseManifest, rawPreferences, allowedSources) {
  const preferences = resolvePreferences(rawPreferences, allowedSources);
  const manifest = structuredClone(baseManifest);
  const genre = manifest.catalogs[0].extra.find(extra => extra.name === 'genre');
  genre.options = preferences.categories.map(category => category.label);
  delete manifest.behaviorHints.configurationRequired;
  delete manifest.behaviorHints.configurable;
  return manifest;
}

export function renderConfigurePage(manifest, serverConfig, rawPreferences = {}, basePath = '') {
  const preferences = resolvePreferences(rawPreferences, serverConfig.enabledSources);
  const selected = new Set(preferences.enabledSources);
  const categoryText = preferences.categories.map(({ label, query }) => `${label}=${query}`).join('\n') || DEFAULT_CATEGORY_TEXT;
  const sourceInputs = serverConfig.enabledSources.map(source => `
    <label class="source-card">
      <input type="checkbox" name="source" value="${escapeHtml(source)}"${selected.has(source) ? ' checked' : ''}>
      <span><strong>${escapeHtml(siteLabel(source))}</strong><small>Built-in provider adapter</small></span>
    </label>`).join('');
  const safeBasePath = escapeHtml(basePath);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Configure ${escapeHtml(manifest.name)}</title>
  <link rel="icon" href="data:,">
  <style>
    :root{color-scheme:dark;--bg:#0c0b12;--panel:#171522;--line:#302c42;--text:#f6f3ff;--muted:#aaa4ba;--accent:#c36cff;--accent2:#7657ff}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 15% 0,#28173a 0,transparent 38%),var(--bg);color:var(--text);font:16px/1.45 system-ui,sans-serif}main{width:min(760px,calc(100% - 32px));margin:48px auto 72px}.eyebrow{color:var(--accent);font-weight:800;letter-spacing:.14em;text-transform:uppercase;font-size:12px}h1{font-size:clamp(34px,7vw,62px);line-height:1;margin:12px 0 18px}p{color:var(--muted)}section{background:color-mix(in srgb,var(--panel) 94%,transparent);border:1px solid var(--line);border-radius:18px;padding:24px;margin:18px 0;box-shadow:0 18px 50px #0005}h2{font-size:18px;margin:0 0 16px}.sources{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}.source-card{display:flex;gap:12px;align-items:center;border:1px solid var(--line);border-radius:12px;padding:14px;cursor:pointer}.source-card:has(input:checked){border-color:var(--accent);background:#c36cff12}.source-card input{accent-color:var(--accent);width:18px;height:18px}.source-card span{display:flex;flex-direction:column}.source-card small{color:var(--muted)}label.field{display:block;margin-top:14px}label.field span{display:block;font-weight:700;margin-bottom:7px}input[type=text],textarea{width:100%;border:1px solid var(--line);border-radius:10px;background:#0f0e16;color:var(--text);padding:12px;font:inherit}textarea{min-height:220px;resize:vertical;font-family:ui-monospace,monospace;font-size:14px}.hint{font-size:13px;margin:8px 0 0}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}button,a.button{border:0;border-radius:11px;padding:13px 18px;font-weight:800;font:inherit;cursor:pointer;text-decoration:none}.primary{background:linear-gradient(135deg,var(--accent),var(--accent2));color:white}.secondary{background:#242031;color:var(--text);border:1px solid var(--line)!important}.status{min-height:24px;color:#ff9eb3;font-weight:700}.manifest{word-break:break-all;font:12px ui-monospace,monospace;color:var(--muted);margin-top:14px}a{color:#db9fff}
  </style>
</head>
<body><main>
  <div class="eyebrow">Stremio add-on settings</div>
  <h1>${escapeHtml(manifest.name)}</h1>
  <p>Choose providers and edit the category tags Stremio shows in Discover. Settings stay inside your configured manifest URL.</p>
  <form id="settings">
    <section><h2>Providers</h2><div class="sources">${sourceInputs}</div>
      <p class="hint">This server accepts only installed provider adapters. To support another site, <a href="https://github.com/michaelhotker/prism-tube-stremio/issues" target="_blank" rel="noreferrer">request or add an adapter</a>; arbitrary domains are blocked.</p>
    </section>
    <section><h2>Tags and categories</h2>
      <label class="field"><span>Primary tag</span><input id="primaryTag" type="text" maxlength="32" value="${escapeHtml(preferences.primaryTag)}"></label>
      <label class="field"><span>Categories</span><textarea id="categories" maxlength="2000">${escapeHtml(categoryText)}</textarea></label>
      <p class="hint">Use one <strong>Label=search term</strong> per line. Up to 20 categories are included.</p>
    </section>
    <div class="status" id="status" role="alert"></div>
    <div class="actions"><a class="button primary" id="install">Install configured add-on</a><button class="secondary" type="button" id="copy">Copy manifest URL</button></div>
    <div class="manifest" id="manifestUrl"></div>
  </form>
  <script>
    const basePath = ${JSON.stringify(safeBasePath)};
    const form = document.querySelector('#settings');
    const status = document.querySelector('#status');
    const install = document.querySelector('#install');
    const manifestUrl = document.querySelector('#manifestUrl');
    const build = () => {
      const sources = [...document.querySelectorAll('input[name=source]:checked')].map(input => input.value);
      const categories = document.querySelector('#categories').value.trim();
      if (!sources.length) throw new Error('Select at least one provider.');
      if (!categories) throw new Error('Add at least one category.');
      const preferences = { sources: sources.join(','), primaryTag: document.querySelector('#primaryTag').value.trim(), categories };
      return new URL(basePath + '/' + encodeURIComponent(JSON.stringify(preferences)) + '/manifest.json', location.origin).href;
    };
    const update = () => { try { const url=build(); const target=new URL(url); status.textContent=''; manifestUrl.textContent=url; install.href='stremio://' + target.host + target.pathname + target.search; } catch(error) { status.textContent=error.message; install.removeAttribute('href'); manifestUrl.textContent=''; } };
    form.addEventListener('input', update);
    install.addEventListener('click', event => { update(); if (!install.href) event.preventDefault(); });
    document.querySelector('#copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(build()); status.textContent='Manifest URL copied.'; } catch(error) { status.textContent=error.message; } });
    update();
  </script>
</main></body></html>`;
}
