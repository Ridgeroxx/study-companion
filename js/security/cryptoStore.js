// AES-GCM wrapper for objects going into IndexedDB.
// Backward compatible: if no passphrase set, values are stored as-is.
// Use FEATURE flag to enable: window.FEATURE_ENCRYPTION = true

const ENC_CFG = 'encryption_cfg_v1';
let key = null;
let cfg = { enabled:false, salt:null, rounds: 210000 }; // PBKDF2 default

async function getKey() { return key; }

async function deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations: (cfg.rounds||210000), hash:'SHA-256' },
    baseKey, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']
  );
}

export async function enable(passphrase, remember=false) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  key = await deriveKey(passphrase, salt);
  cfg = { enabled:true, salt: Array.from(salt), rounds: cfg.rounds, remember };
  await localforage.setItem(ENC_CFG, cfg);
}

export async function resume(passphrase) {
  const c = await localforage.getItem(ENC_CFG);
  if (!c?.enabled || !c.salt) return false;
  cfg = c;
  const salt = new Uint8Array(c.salt);
  key = await deriveKey(passphrase, salt);
  return true;
}

export async function disable() {
  key = null; cfg = { enabled:false, salt:null, rounds: cfg.rounds };
  await localforage.setItem(ENC_CFG, cfg);
}

export async function setEncrypted(keyName, value) {
  if (!cfg.enabled || !key) return localforage.setItem(keyName, value);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const data = enc.encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, data);
  const out = { _enc:true, iv: Array.from(iv), ct: Array.from(new Uint8Array(ct)) };
  return localforage.setItem(keyName, out);
}

export async function getDecrypted(keyName) {
  const v = await localforage.getItem(keyName);
  if (!v || !v._enc) return v;
  if (!cfg.enabled || !key) throw new Error('Encryption enabled but key not loaded');
  const iv = new Uint8Array(v.iv);
  const ct = new Uint8Array(v.ct);
  const pt = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, ct);
  const dec = new TextDecoder().decode(pt);
  return JSON.parse(dec);
}
