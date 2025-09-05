// js/reminders.js — local reminders (foreground timers + SW notifications + catch-up)
let _storage = null;
let _timers = [];
let _wired = false;

export async function init(storage){
  _storage = storage;
  await ensureServiceWorker();

  // Wire the "Enable alerts" button
  if (!_wired) {
    document.getElementById('btn-enable-notifs')?.addEventListener('click', requestPermission);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') catchUp();
    });
    _wired = true;
  }

  // Preload a schedule so "Upcoming" has data even before permission
  await refresh(storage);
}

export async function requestPermission(){
  if (!('Notification' in window)) {
    try { window.app?.toast?.('Notifications not supported on this browser', 'secondary'); } catch {}
    return false;
  }
  let perm = Notification.permission;
  if (perm !== 'granted') perm = await Notification.requestPermission();
  if (perm === 'granted') {
    try { window.app?.toast?.('Alerts enabled', 'success'); } catch {}
    await refresh(_storage);
    return true;
  } else {
    try { window.app?.toast?.('Alerts blocked', 'secondary'); } catch {}
    return false;
  }
}

// Returns [{ title, whenISO }]
export async function listUpcoming(limit=5){
  const evs = await collectEvents();
  evs.sort((a,b)=> +new Date(a.whenISO) - +new Date(b.whenISO));
  return evs.slice(0, limit);
}

// Rebuild timers (foreground); show via SW if possible at fire time
export async function refresh(storage){
  _storage = storage || _storage;
  clearTimers();

  const soon = await listUpcoming(25);
  const now = Date.now();
  const DAY = 24*3600*1000;

  for (const ev of soon) {
    const t  = +new Date(ev.whenISO);
    const dt = t - now;
    if (dt > 0 && dt <= DAY) {
      const id = setTimeout(()=> fireReminder(ev), dt);
      _timers.push(id);
    }
  }
}

function clearTimers(){ _timers.forEach(id => clearTimeout(id)); _timers.length = 0; }

async function collectEvents(){
  const out = [];
  const add = (when, title)=> out.push({ whenISO: when.toISOString(), title });

  try{
    await _storage?.init?.();
    const now = new Date();
    const todayDow = now.getDay();

    const mid = await _storage.getSchedule?.('midweek') || [];   // [{day:0-6, time:'HH:mm'}]
    const wkd = await _storage.getSchedule?.('weekend') || [];

    const nextOf = (dayIdx, timeHHmm, label) => {
      const [hh,mm] = (timeHHmm||'00:00').split(':').map(n=>parseInt(n,10)||0);
      const d = new Date();
      const diff = (dayIdx - todayDow + 7) % 7;
      d.setDate(d.getDate() + diff);
      d.setHours(hh, mm, 0, 0);
      if (diff === 0 && d.getTime() <= now.getTime()) d.setDate(d.getDate() + 7);
      return { when: d, label };
    };

    mid.forEach(s => { const n = nextOf(+s.day||0, s.time||'19:00', 'Midweek Meeting');  add(n.when, n.label); });
    wkd.forEach(s => { const n = nextOf(+s.day||0, s.time||'10:00', 'Weekend Meeting'); add(n.when, n.label); });

    const conv = await _storage.getConvention?.() || { sessions: [] };
    (conv.sessions||[]).forEach(s => {
      if (!s?.date) return;
      const when = new Date(`${s.date}T${s.time||'00:00'}:00`);
      if (!isNaN(+when)) add(when, s.title || s.theme || 'Convention Session');
    });
  } catch(e) {
    console.warn('[reminders] collectEvents failed', e);
  }

  return out;
}

async function fireReminder(ev){
  const title = ev.title || 'Reminder';
  const body  = new Date(ev.whenISO).toLocaleString();

  // Prefer service worker for better delivery when app is in the background
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg && Notification.permission === 'granted') {
      await reg.showNotification(title, {
        body,
        tag: 'reminder-' + ev.whenISO,
        badge: 'icons/logo.png',
        icon:  'icons/logo.png',
        vibrate: [120, 40, 120],
        data: { url: 'app.html' }
      });
      try { window.app?.toast?.(`${title} — now`, 'primary'); } catch {}
      return;
    }
  } catch(e){ console.warn('[reminders] showNotification failed', e); }

  // Fallback: page-level notification
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
  try { window.app?.toast?.(`${title} — now`, 'primary'); } catch {}
}

// If user re-opens the app around the scheduled time, still show it
async function catchUp(){
  const windowMs = 60 * 1000; // 1 minute grace
  const now = Date.now();
  const evs = await listUpcoming(50);
  for (const ev of evs) {
    const t = +new Date(ev.whenISO);
    if (t <= now && t >= (now - windowMs)) {
      fireReminder(ev);
    }
  }
}

async function ensureServiceWorker(){
  if (!('serviceWorker' in navigator)) return;
  try {
    // guesses that work for root or subfolder deploys
    const base = location.pathname.replace(/[^/]+$/, ''); // current dir ending with /
    const guesses = [
      `${base}sw.js`,    // ./sw.js (next to app.html)
      `/sw.js`           // site root (if you deploy SW there)
    ];

    for (const url of guesses) {
      try {
        // Avoid registering a 404/HTML page
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) continue;
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (!ct.includes('javascript')) {
          // Some hosts serve 404 HTML with 200 OK; skip non-JS
          continue;
        }
        // Scope must be within the SW directory; leave default
        await navigator.serviceWorker.register(url);
        return;
      } catch {}
    }
    console.warn('[SW] service-worker.js not found. Place it next to app.html (or at site root).');
  } catch (e) {
    console.warn('[SW] register failed', e);
  }
}

