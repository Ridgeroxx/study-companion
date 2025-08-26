// /js/security/encryptStore.js
// AES-GCM wrapper. Works with patch-localforage to encrypt transparently.
let _key = null;

export async function deriveKey(pass, salt){
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  _key = await crypto.subtle.deriveKey(
    {name:'PBKDF2', salt, iterations:210000, hash:'SHA-256'},
    material, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']
  );
  return _key;
}

export function hasKey(){ return !!_key; }

export async function setItemRaw(base, key, val){
  // base is the original localforage (window.__lf)
  if (!_key) return base.setItem(key, val);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(val));
  const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv}, _key, data);
  return base.setItem(key, { __enc:true, iv: buf2b64(iv), ct: buf2b64(ct) });
}

export async function getItemRaw(base, key){
  const pack = await base.getItem(key);
  if (!pack || !pack.__enc || !_key) return pack;
  const iv = b642buf(pack.iv);
  const ct = b642buf(pack.ct);
  const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv}, _key, ct);
  return JSON.parse(new TextDecoder().decode(pt));
}

function buf2b64(buf){ return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function b642buf(b64){ return Uint8Array.from(atob(b64), c=>c.charCodeAt(0)); }
