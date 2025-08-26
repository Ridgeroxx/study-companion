// Minimal WebDAV push/pull of a single bundle.json
// You provide a UI to collect: endpoint, username, password, remotePath.
// NO background sync. Only on user click.

const CFG = 'sync_webdav_cfg_v1';

export async function saveConfig(cfg){ await localforage.setItem(CFG, cfg); }
export async function loadConfig(){ return await localforage.getItem(CFG) || null; }

function authHeader(user, pass){ return 'Basic ' + btoa(`${user}:${pass}`); }

export async function uploadBundle(bundle) {
  const cfg = await loadConfig(); if (!cfg) throw new Error('No WebDAV config');
  const res = await fetch(cfg.endpoint + cfg.remotePath, {
    method:'PUT',
    headers:{ 'Authorization': authHeader(cfg.username, cfg.password), 'Content-Type':'application/json' },
    body: JSON.stringify(bundle, null, 2)
  });
  if (!res.ok) throw new Error('Upload failed: '+res.status);
  return true;
}

export async function downloadBundle() {
  const cfg = await loadConfig(); if (!cfg) throw new Error('No WebDAV config');
  const res = await fetch(cfg.endpoint + cfg.remotePath, {
    method:'GET',
    headers:{ 'Authorization': authHeader(cfg.username, cfg.password), 'Accept':'application/json' }
  });
  if (!res.ok) throw new Error('Download failed: '+res.status);
  return await res.json();
}

export async function listRemote() {
  const cfg = await loadConfig(); if (!cfg) throw new Error('No WebDAV config');
  // naive: fetch remotePath only (HEAD)
  const res = await fetch(cfg.endpoint + cfg.remotePath, {
    method:'HEAD',
    headers:{ 'Authorization': authHeader(cfg.username, cfg.password) }
  });
  return { exists: res.ok, etag: res.headers.get('etag') || '' };
}
