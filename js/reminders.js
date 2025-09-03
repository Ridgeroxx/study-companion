// js/reminders.js
// Exports: init(storage), refresh(storage), requestPermission(), isSupported(), listUpcoming(limit)

const KEY_LAST_PLAN = 'reminders_last_plan_v1';
const MAX_TIMEOUT_MS = 24 * 60 * 60 * 1000;

let _timers = [];
let _storage = null;

function clearTimers(){ _timers.forEach(clearTimeout); _timers = []; }
const isSecure = () => location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';

export function isSupported(){
  return 'Notification' in window && isSecure();
}

export async function requestPermission(){
  if (!isSupported()) return { ok:false, reason:'Not secure or unsupported' };
  if (Notification.permission === 'granted') return { ok:true };
  if (Notification.permission === 'denied') return { ok:false, reason:'blocked' };
  try {
    const r = await Notification.requestPermission();
    return { ok: r === 'granted', reason: r };
  } catch {
    return { ok:false, reason:'error' };
  }
}

function supportsTriggers(){
  return 'TimestampTrigger' in window && 'showNotification' in (navigator.serviceWorker?.registration || {});
}

function preTime(at){
  const d = new Date(at);
  d.setDate(d.getDate() - 1);
  return d;
}

// ---- Build upcoming items from storage (Meetings, Convention, Planner)
function nextWeekly(dow, hhmm){
  const [h,m] = (hhmm||'00:00').split(':').map(v=>parseInt(v||'0',10));
  const now = new Date();
  const d = new Date(); d.setSeconds(0,0);
  const add = (dow - d.getDay() + 7) % 7;
  d.setDate(d.getDate()+add);
  d.setHours(h,m,0,0);
  if (d <= now) d.setDate(d.getDate()+7);
  return d;
}

async function computeUpcoming(storage){
  const out = [];
  // weekly meetings
  try {
    const mid = await storage.getSchedule?.('midweek') || [];
    const wk  = await storage.getSchedule?.('weekend') || [];
    for (const it of mid){ if (typeof it.day==='number' && it.time) out.push({title:'Midweek meeting', at: nextWeekly(it.day,it.time)}); }
    for (const it of wk){  if (typeof it.day==='number' && it.time) out.push({title:'Weekend meeting', at: nextWeekly(it.day,it.time)}); }
  } catch {}

  // convention sessions
  try {
    const conv = await storage.getConvention?.();
    for (const s of (conv?.sessions||[])){
      const at = new Date(`${s.date}T${(s.time||'00:00')}:00`);
      if (!isNaN(at)) out.push({title: s.label || 'Convention', at});
    }
  } catch {}

  // planner items with a date/time in the future
  try {
    const list = (await window.localforage.getItem('planner_items_v1')) || [];
    for (const it of list){
      if (!it.date) continue;
      const at = new Date(it.date + 'T' + (it.time||'00:00') + ':00');
      if (!isNaN(at) && at > new Date()) out.push({ title: it.title || 'Planner', at, _planner:true, remind: !!it.remind });
    }
  } catch {}

  const now = Date.now();
  const soon = now + 56*24*60*60*1000;
  return out.filter(x => x.at.getTime()>now && x.at.getTime()<soon).sort((a,b)=>a.at-b.at);
}

async function showNow(title, body){
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return reg.showNotification(title, {
      body, icon:'icons/logo.png', badge:'icons/logo.png', tag:`rem:${title}:${body}`, renotify:true
    });
  } catch {}
  try { new Notification(title, { body, icon:'icons/logo.png' }); } catch {}
}

function setTimer(ts, cb){
  const ms = ts - Date.now();
  if (ms <= 0) return;
  const delay = Math.min(ms, MAX_TIMEOUT_MS);
  _timers.push(setTimeout(cb, delay));
}

async function planWithTriggers(items){
  const reg = await navigator.serviceWorker?.getRegistration();
  if (!reg) return false;
  for (const it of items){
    const when = it.at.getTime();
    const pre  = preTime(it.at).getTime();
    if ('TimestampTrigger' in window){
      try{ await reg.showNotification(it.title, { body:'Starts now.',      showTrigger:new TimestampTrigger(when), tag:`at:${when}`,  icon:'icons/logo.png', badge:'icons/logo.png' }); }catch{}
      try{ await reg.showNotification(it.title, { body:'Tomorrow at this time.', showTrigger:new TimestampTrigger(pre),  tag:`pre:${pre}`, icon:'icons/logo.png', badge:'icons/logo.png' }); }catch{}
    }
  }
  return true;
}

async function planWithTimeouts(items){
  for (const it of items){
    const when = it.at.getTime();
    const pre  = preTime(it.at).getTime();
    setTimer(pre,  ()=> showNow(it.title, 'Tomorrow at this time.'));
    setTimer(when, ()=> showNow(it.title, 'Starts now.'));
  }
}

export async function refresh(storage = _storage){
  if (!storage) return;
  clearTimers();
  if (!isSupported()) return;

  if (Notification.permission !== 'granted'){
    // don’t nag; user can click the button to request
    return;
  }

  const items = await computeUpcoming(storage);

  let planned = false;
  if (supportsTriggers()) planned = await planWithTriggers(items);
  if (!planned) await planWithTimeouts(items);

  try { await window.localforage.setItem(KEY_LAST_PLAN, { at: Date.now(), n: items.length }); } catch {}
}

export async function listUpcoming(limit=8){
  const items = await computeUpcoming(_storage || window.storage || {});
  return items.slice(0, limit).map(i => ({ title:i.title, whenISO: i.at.toISOString() }));
}

export async function init(storage){
  _storage = storage || window.storage || null;
  // do not auto-request on mobile — must be user gesture
  await refresh(_storage);

  document.addEventListener('visibilitychange', ()=> {
    if (document.visibilityState === 'visible') refresh(_storage);
  }, { passive:true });

  setInterval(()=> refresh(_storage), 15*60*1000);
}
