// /js/security/patch-localforage.js
// Monkey-patch localforage when encryption is enabled.
import { deriveKey, hasKey, setItemRaw, getItemRaw } from './encryptStore.js';

export function isPatched(){ return !!window.__lf; }

export async function enableEncryption(passphrase, saltHex){
  if (!window.localforage) throw new Error('localforage not loaded');
  if (!window.__lf) window.__lf = window.localforage; // keep original
  const salt = saltHex ? hex2buf(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  await deriveKey(passphrase, salt);
  // patch only getItem/setItem; others fall through
  const base = window.__lf;
  const patched = new Proxy(base, {
    get(t, prop){
      if (prop === 'setItem') return (k,v)=> setItemRaw(base, k, v);
      if (prop === 'getItem') return (k)=> getItemRaw(base, k);
      return t[prop];
    }
  });
  window.localforage = patched;
  return buf2hex(salt);
}

export function disableEncryption(){
  if (window.__lf) window.localforage = window.__lf;
}

function buf2hex(b){ return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); }
function hex2buf(h){ const a=h.match(/../g).map(x=>parseInt(x,16)); return new Uint8Array(a); }
