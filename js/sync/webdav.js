// js/sync/webdav.js
// Minimal WebDAV helper using fetch. Works with most DAV servers for PUT/GET/HEAD.
// Stores config in localforage under 'webdav_config_v1'.

const CFG_KEY = 'webdav_config_v1';

async function saveConfig(cfg) {
  const safe = {
    endpoint: (cfg.endpoint || '').replace(/\/+$/,'') + '/',
    username: cfg.username || '',
    password: cfg.password || '',
    remotePath: (cfg.remotePath || '/StudyCompanion/bundle.json').replace(/^\/+/, '')
  };
  await localforage.setItem(CFG_KEY, safe);
  return safe;
}

async function loadConfig() {
  const cfg = await localforage.getItem(CFG_KEY);
  if (!cfg) return null;
  // normalize
  cfg.endpoint  = (cfg.endpoint || '').replace(/\/+$/,'') + '/';
  cfg.remotePath= (cfg.remotePath || 'StudyCompanion/bundle.json').replace(/^\/+/, '');
  return cfg;
}

function connect({ url, username, password, remotePath } = {}) {
  // Return a plain config object used by helpers
  const endpoint = (url || '').replace(/\/+$/,'') + '/';
  const path = (remotePath || '/StudyCompanion/bundle.json').replace(/^\/+/, '');
  return { endpoint, username: username||'', password: password||'', remotePath: path };
}

function authHeader({ username, password }) {
  if (!username && !password) return {};
  const b64 = btoa(`${username}:${password}`);
  return { 'Authorization': `Basic ${b64}` };
}

function urlJoin(endpoint, remotePath) {
  return endpoint + remotePath;
}

async function listRemote(cfgIn) {
  const cfg = cfgIn || await loadConfig();
  if (!cfg) throw new Error('No WebDAV config saved');
  const url = urlJoin(cfg.endpoint, cfg.remotePath);
  const res = await fetch(url, { method: 'HEAD', headers: { ...authHeader(cfg) } });
  if (res.status === 200) {
    const etag = res.headers.get('ETag') || '';
    return { exists: true, etag };
  }
  if (res.status === 404) return { exists: false };
  // Some servers may not allow HEAD. Try OPTIONS as a soft check.
  if (res.status === 405 || res.status === 501) {
    try {
      const opt = await fetch(url, { method: 'OPTIONS', headers: { ...authHeader(cfg) } });
      return { exists: opt.ok, etag: '' };
    } catch {}
  }
  return { exists: false };
}

async function uploadBundle(cfgIn, bundleObj) {
  const cfg = cfgIn || await loadConfig();
  if (!cfg) throw new Error('No WebDAV config saved');
  const url = urlJoin(cfg.endpoint, cfg.remotePath);
  const body = JSON.stringify(bundleObj || {});
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(cfg)
    },
    body
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return true;
}

async function downloadBundle(cfgIn) {
  const cfg = cfgIn || await loadConfig();
  if (!cfg) throw new Error('No WebDAV config saved');
  const url = urlJoin(cfg.endpoint, cfg.remotePath);
  const res = await fetch(url, { headers: { ...authHeader(cfg) } });
  if (res.status === 404) throw new Error('Remote bundle not found');
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const json = await res.json();
  return json;
}

export { saveConfig, loadConfig, connect, listRemote, uploadBundle, downloadBundle };
export default { saveConfig, loadConfig, connect, listRemote, uploadBundle, downloadBundle };
