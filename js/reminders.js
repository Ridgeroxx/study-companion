// /js/reminders.js
// Local reminders for meeting schedules & convention sessions.

const KEY_LAST_PLAN = 'reminders_last_plan_v1';
const MAX_TIMEOUT_MS = 24 * 60 * 60 * 1000;

let _timers = [];
let _storage = null;

function clearTimers(){
  _timers.forEach(id => clearTimeout(id));
  _timers = [];
}

function esc(s=''){ return (s+'').replace(/[&<>]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c])); }

async function ensurePermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try { return (await Notification.requestPermission()) === 'granted'; }
  catch { return false; }
}

function supportsTriggers(){
  return 'TimestampTrigger' in window && 'showNotification' in (navigator.serviceWorker?.registration || {});
}

function nextWeeklyOccurrence(day, hhmm){
  const [hh, mm] = (hhmm||'00:00').split(':').map(n=>parseInt(n,10)||0);
  const now = new Date();
  const d = new Date();
  d.setSeconds(0,0);
  const add = (day - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + add);
  d.setHours(hh, mm, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 7);
  return d;
}

async function computeUpcoming(storage){
  const items = [];

  // WEEKLY: midweek/weekend
  try {
    const mid = await storage.getSchedule?.('midweek');
    const wk  = await storage.getSchedule?.('weekend');
    const addWeekly = (src, label) => {
      const arr = Array.isArray(src) ? src : (src?.items || (src ? [src] : []));
      for (const it of (arr||[])) {
        if (typeof it.day !== 'number' || !it.time) continue;
        const at = nextWeeklyOccurrence(it.day, it.time);
        items.push({ id:`${label}-${it.day}-${it.time}`, title: label, at });
      }
    };
    addWeekly(mid, 'Midweek meeting');
    addWeekly(wk,  'Weekend meeting');
  } catch {}

  // CONVENTION: one-off sessions
  try {
    const conv = await storage.getConvention?.();
    for (const s of (conv?.sessions||[])) {
      const at = new Date(`${s.date}T${(s.time||'00:00')}:00`);
      if (!isNaN(at.getTime()))
        items.push({ id:`Convention-${s.date}-${s.time||'00:00'}`, title: (s.label||'Convention'), at });
    }
  } catch {}

  // Trim to next 8 weeks
  const now = Date.now();
  const soon = now + (56 * 24 * 60 * 60 * 1000);
  return items.filter(i => i.at.getTime() > now && i.at.getTime() < soon)
              .sort((a,b)=>a.at - b.at);
}

function preTime(atDate){
  const d = new Date(atDate);
  d.setDate(d.getDate() - 1);
  return d;
}

async function showNow(title, body){
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      return reg.showNotification(title, {
        body, icon: 'icons/logo.png', badge: 'icons/logo.png',
        tag: `reminder:${title}:${body}`, renotify: true
      });
    }
  } catch {}
  try { new Notification(title, { body, icon: 'icons/logo.png' }); } catch {}
}

function setOneTimer(ts, cb){
  const ms = ts - Date.now();
  if (ms <= 0) return;
  const delay = Math.min(ms, MAX_TIMEOUT_MS);
  const id = setTimeout(cb, delay);
  _timers.push(id);
}

async function planWithTriggers(items){
  const reg = await navigator.serviceWorker?.getRegistration();
  if (!reg) return false;

  for (const it of items) {
    const when = it.at.getTime();
    const pre  = preTime(it.at).getTime();

    if ('TimestampTrigger' in window) {
      try {
        await reg.showNotification(it.title, {
          body: 'Starts now.',
          showTrigger: new TimestampTrigger(when),
          tag: `at:${it.id}`,
          icon:'icons/logo.png', badge:'icons/logo.png'
        });
      } catch {}
      try {
        await reg.showNotification(it.title, {
          body: 'Tomorrow at this time.',
          showTrigger: new TimestampTrigger(pre),
          tag: `pre:${it.id}`,
          icon:'icons/logo.png', badge:'icons/logo.png'
        });
      } catch {}
    }
  }
  return true;
}

async function planWithTimeouts(items){
  for (const it of items) {
    const at = it.at.getTime();
    const pre= preTime(it.at).getTime();
    setOneTimer(pre, ()=> showNow(it.title, 'Tomorrow at this time.'));
    setOneTimer(at,  ()=> showNow(it.title, 'Starts now.'));
  }
}

export async function refresh(storage = _storage){
  if (!storage) return;
  clearTimers();

  const havePerm = await ensurePermission();
  if (!havePerm) return;

  const items = await computeUpcoming(storage);

  let plannedWithTriggers = false;
  if (supportsTriggers()) {
    plannedWithTriggers = await planWithTriggers(items);
  }
  if (!plannedWithTriggers) {
    await planWithTimeouts(items);
  }

  try { await window.localforage?.setItem(KEY_LAST_PLAN, { at: Date.now(), count: items.length }); } catch {}
}

export async function init(storage){
  _storage = storage;
  await refresh(_storage);

  document.addEventListener('visibilitychange', ()=> {
    if (document.visibilityState === 'visible') refresh(_storage);
  }, { passive:true });

  setInterval(()=> refresh(_storage), 15 * 60 * 1000);
}

export async function listUpcoming(limit = 5, s = _storage){
  const store = s || _storage || window.storage;
  const items = await computeUpcoming(store);
  return items
    .filter(i => i.at.getTime() > Date.now())
    .sort((a,b)=> a.at - b.at)
    .slice(0, limit)
    .map(i => ({ title: i.label, whenISO: i.at.toISOString() }));
}

export async function testNow(){
  const ok = await ensurePermission();
  if (!ok) return alert('Please allow notifications.');
  showNow('Test notification', 'This is how reminders will look.');
}
