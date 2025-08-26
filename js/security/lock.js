// /js/security/lock.js
// Minimal "App Lock" with PIN + optional WebAuthn.
// Call lock.init({ enabled:true, idleMinutes: 15 }) from app.js.

const PIN_KEY = 'app_pin_hash_v1';
const SALT_KEY= 'app_pin_salt_v1';
const LOCK_CFG= 'app_lock_cfg_v1';
const BAD_KEY = 'app_pin_bad_v1';

let cfg = { enabled:false, idleMinutes: 10, webauthn:false };
let idleTimer = null;
let overlay = null;

function hasLocalforage() {
  return typeof localforage !== 'undefined' && localforage?.setItem;
}
async function storeJSON(k, v){ return hasLocalforage() ? localforage.setItem(k, v) : (localStorage.setItem(k, JSON.stringify(v)), v); }
async function loadJSON(k){ return hasLocalforage() ? (await localforage.getItem(k) || null) : (JSON.parse(localStorage.getItem(k)||'null')); }

async function sha256(buf) {
  const data = typeof buf === 'string' ? new TextEncoder().encode(buf) : buf;
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

function removeOverlay(){ if (overlay?.parentNode) overlay.parentNode.removeChild(overlay); overlay=null; }
function showOverlay(onSubmitPin, onWebAuthn) {
  removeOverlay();
  overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:20000;
    display:flex; align-items:center; justify-content:center; backdrop-filter: blur(6px)`;
  overlay.innerHTML = `
    <div style="background:var(--bs-body-bg); padding:16px; border-radius:12px; width:min(420px, 92vw);">
      <h5 class="mb-2">App Locked</h5>
      <div class="mb-2 small text-muted">Enter PIN to unlock.</div>
      <div class="input-group mb-2">
        <input id="lock-pin" type="password" inputmode="numeric" class="form-control" placeholder="PIN">
        <button id="lock-submit" class="btn btn-primary">Unlock</button>
      </div>
      <div class="d-flex gap-2">
        <button id="lock-webauthn" class="btn btn-outline-secondary btn-sm" style="display:none;">Use biometric</button>
        <button id="lock-logout" class="btn btn-outline-danger btn-sm">Clear PIN</button>
      </div>
      <div id="lock-msg" class="small text-danger mt-2"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#lock-submit').onclick = () => {
    const pin = overlay.querySelector('#lock-pin').value || '';
    onSubmitPin(pin);
  };
  overlay.querySelector('#lock-logout').onclick = async () => {
    await storeJSON(PIN_KEY, null); await storeJSON(SALT_KEY, null);
    removeOverlay();
    alert('PIN cleared. Set it again in Settings > Security.');
  };
  const webBtn = overlay.querySelector('#lock-webauthn');
  if (cfg.webauthn && window.PublicKeyCredential) {
    webBtn.style.display = 'inline-block';
    webBtn.onclick = onWebAuthn;
  }
}

async function verifyPin(pin) {
  const salt = await loadJSON(SALT_KEY);
  const saved = await loadJSON(PIN_KEY);
  if (!salt || !saved) return false;
  const hash = await sha256(pin + ':' + salt);
  return hash === saved;
}

async function promptUnlock() {
  const bad = (await loadJSON(BAD_KEY)) || { count:0, until:0 };
  if (Date.now() < bad.until) {
    const secs = Math.ceil((bad.until - Date.now())/1000);
    alert(`Too many attempts. Try again in ${secs}s`);
    return;
  }
  return new Promise((resolve) => {
    showOverlay(async (pin) => {
      if (!await verifyPin(pin)) {
        bad.count += 1;
        if (bad.count >= 5) { bad.count = 0; bad.until = Date.now() + 30_000; }
        await storeJSON(BAD_KEY, bad);
        overlay.querySelector('#lock-msg').textContent = 'Incorrect PIN';
        return;
      }
      await storeJSON(BAD_KEY, { count:0, until:0 });
      removeOverlay();
      resolve(true);
    }, async () => {
      try {
        await navigator.credentials.get({ publicKey: { challenge: new Uint8Array(16), userVerification:'preferred' } });
        removeOverlay(); resolve(true);
      } catch(e) {
        overlay.querySelector('#lock-msg').textContent = 'Biometric failed';
      }
    });
  });
}

function armIdle() {
  if (!cfg.enabled) return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(()=> promptUnlock(), (cfg.idleMinutes||10)*60*1000);
}

export const lock = {
  async init(options={}) {
    cfg = { ...(await loadJSON(LOCK_CFG) || cfg), ...options };
    if (!cfg.enabled) return;
    const hasPin = !!(await loadJSON(PIN_KEY));
    if (hasPin) await promptUnlock();
    ['click','keydown','pointermove','visibilitychange'].forEach(ev => {
      window.addEventListener(ev, armIdle, { passive:true });
    });
    armIdle();
  },
  async setupPin(pin, webauthn=false, idleMinutes=10){
    const salt = crypto.getRandomValues(new Uint8Array(16)).join('.');
    const hash = await sha256(pin + ':' + salt);
    await storeJSON(PIN_KEY, hash);
    await storeJSON(SALT_KEY, salt);
    cfg = { enabled:true, webauthn, idleMinutes };
    await storeJSON(LOCK_CFG, cfg);
    return true;
  },
  async disable(){
    cfg.enabled=false;
    await storeJSON(LOCK_CFG, cfg);
  },
  // helpers to match old imports (no-ops if unused)
  async isEnabled(){ const c = await loadJSON(LOCK_CFG); return !!c?.enabled; },
  showLockScreen(){ return promptUnlock(); },
  armIdle
};
