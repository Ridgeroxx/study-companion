// /js/home.js
// Fills: Study Planner (Today / Week / Later) + Library Shelves (Short / Medium / Long)

import { storage } from './storage.js';

const $ = s => document.querySelector(s);

// --- Utilities ---------------------------------------------------------

function pad2(n){ return String(n).padStart(2,'0'); }
function ymd(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function sameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function addDays(d, n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }

function parseWeeklyWhen(whenStr){
  // Accepts "Thu 3:50 PM" / "Thursday 19:00" etc → { day:0-6, time:"HH:mm" }
  if (!whenStr) return null;
  const map = { sun:0, mon:1, tue:2, wed:3, thu:4, thur:4, thurs:4, fri:5, sat:6 };
  const s = whenStr.trim().toLowerCase();
  const wk = Object.keys(map).find(k => s.startsWith(k));
  if (!wk) return null;
  // time part (loose): e.g. "3:50 pm" or "19:00"
  const tm = s.replace(wk, '').replace(/\s+/, ' ').trim();
  if (!tm) return null;

  // normalize to 24h HH:mm
  let h=0,m=0;
  const m1 = tm.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/i);
  if (m1){
    h = parseInt(m1[1]||'0',10);
    m = parseInt(m1[2]||'0',10);
    const ampm = (m1[3]||'').toLowerCase();
    if (ampm==='pm' && h<12) h+=12;
    if (ampm==='am' && h===12) h=0;
  } else {
    return null;
  }
  return { day: map[wk], time: `${pad2(h)}:${pad2(m)}` };
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

// read-time from text or file size (coarse fallback)
async function estimateReadMin(doc){
  // If we can read text, estimate by words
  try {
    const body = await storage.getDocumentBody?.(doc.id);
    if (body && body.length > 0){
      const words = (body.match(/\b\w+\b/g)||[]).length;
      return Math.max(1, Math.ceil(words / 200)); // ~200 wpm
    }
  } catch {}
  // else fallback by bytes
  try {
    if (doc.fileKey){
      const ab = await storage.getFile?.(doc.fileKey);
      const kb = ab ? Math.ceil(ab.byteLength/1024) : 0;
      return Math.max(1, Math.ceil(kb / 50)); // ~50KB ≈ 1 min (very rough)
    }
  } catch {}
  return 3; // shrug
}

function chipHTML(doc, min){
  const title = (doc.title||'(Untitled)').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  return `
  <button class="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-2"
          onclick="window.app && window.app.openDoc && window.app.openDoc('${doc.id}')">
    <i class="fa-regular fa-file-lines"></i>
    <span class="text-truncate" style="max-width: 180px">${title}</span>
    <span class="badge text-bg-light">${min}m</span>
  </button>`;
}

function plannerRowHTML(label, at, type){
  const dest = type === 'convention' ? 'convention.html' : 'meetings.html';
  return `
  <div class="d-flex align-items-center justify-content-between border rounded p-2 mb-1">
    <div class="text-truncate"><i class="fa-regular fa-bell me-2"></i>${label}</div>
    <div class="d-flex align-items-center gap-2">
      <div class="text-muted">${at.toLocaleString()}</div>
      <a class="btn btn-sm btn-outline-primary" href="${dest}" title="Open"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
    </div>
  </div>`;
}

// --- Planner data (meetings + convention) ---------------------------------

async function computeUpcoming(){
  const items = [];

  // midweek/weekend schedules: support both {day,time} and legacy {when:'Thu 3:50 PM'}
  const mid = await storage.getSchedule?.('midweek') || [];
  const wk  = await storage.getSchedule?.('weekend') || [];

  const normalize = (x) => {
    if (typeof x?.day === 'number' && x?.time) return { day:x.day, time:x.time };
    if (x?.when) return parseWeeklyWhen(x.when);
    return null;
  };
  const addWeekly = (arr, label, kind) => {
    for (const it of (arr||[])) {
      const n = normalize(it);
      if (!n) continue;
      const at = nextWeeklyOccurrence(n.day, n.time);
      items.push({ type: kind, label, at });
    }
  };

  addWeekly(mid, 'Midweek meeting', 'meeting');
  addWeekly(wk,  'Weekend meeting', 'meeting');

  // Convention one-offs: { sessions:[{date:'YYYY-MM-DD', time:'HH:mm', label?}] }
  try {
    const conv = await (storage.getConvention?.() || null);
    if (conv?.sessions?.length){
      for (const s of conv.sessions) {
        const at = new Date(`${s.date}T${(s.time||'00:00')}:00`);
        if (!isNaN(at)) items.push({ type:'convention', label: (s.label||'Convention'), at });
      }
    }
  } catch {}

  const now = new Date();
  const weekEnd = addDays(now, 7);
  const today = ymd(now);

  const buckets = { today:[], week:[], later:[] };
  for (const it of items.sort((a,b)=>a.at-b.at)){
    if (sameDay(it.at, now)) buckets.today.push(it);
    else if (it.at < weekEnd) buckets.week.push(it);
    else buckets.later.push(it);
  }
  return buckets;
}

// --- Renderers ------------------------------------------------------------

async function renderPlanner(){
  const T = $('#planner-today');
  const W = $('#planner-week');
  const L = $('#planner-later');
  if (!T || !W || !L) return;

  try {
    const buckets = await computeUpcoming();
    T.innerHTML = buckets.today.length
      ? buckets.today.map(i=>plannerRowHTML(i.label, i.at, i.type)).join('')
      : `<div class="text-muted">Nothing today.</div>`;
    W.innerHTML = buckets.week.length
      ? buckets.week.map(i=>plannerRowHTML(i.label, i.at, i.type)).join('')
      : `<div class="text-muted">No items this week.</div>`;
    L.innerHTML = buckets.later.length
      ? buckets.later.map(i=>plannerRowHTML(i.label, i.at, i.type)).join('')
      : `<div class="text-muted">Nothing later yet.</div>`;
  } catch(e){
    console.error(e);
    T.innerHTML = W.innerHTML = L.innerHTML = `<div class="text-danger">Failed to load.</div>`;
  }
}

async function renderShelves(){
  const shortBox  = $('#shelf-short');
  const mediumBox = $('#shelf-medium');
  const longBox   = $('#shelf-long');
  const cShort = $('#shelf-count-short');
  const cMed   = $('#shelf-count-medium');
  const cLong  = $('#shelf-count-long');
  if (!shortBox || !mediumBox || !longBox) return;

  try {
    const docs = (await storage.getActiveDocuments?.()) || (await storage.getDocuments?.()) || [];
    if (!docs.length){
      shortBox.innerHTML  = `<div class="text-muted">Your library is empty.</div>`;
      mediumBox.innerHTML = ``;
      longBox.innerHTML   = ``;
      cShort.textContent = cMed.textContent = cLong.textContent = '0';
      return;
    }

    // Precompute read-time (cache small, fast)
    const withRT = [];
    for (const d of docs) {
      const min = await estimateReadMin(d);
      withRT.push({ doc:d, min });
    }

    const short  = withRT.filter(x=>x.min <= 5).slice(0,20);
    const medium = withRT.filter(x=>x.min >= 6 && x.min <= 20).slice(0,20);
    const long   = withRT.filter(x=>x.min > 20).slice(0,20);

    cShort.textContent = String(short.length);
    cMed.textContent   = String(medium.length);
    cLong.textContent  = String(long.length);

    shortBox.innerHTML  = short.length  ? short.map(x=>chipHTML(x.doc, x.min)).join('')  : `<div class="text-muted">No short reads yet.</div>`;
    mediumBox.innerHTML = medium.length ? medium.map(x=>chipHTML(x.doc, x.min)).join('') : `<div class="text-muted">No medium reads yet.</div>`;
    longBox.innerHTML   = long.length   ? long.map(x=>chipHTML(x.doc, x.min)).join('')   : `<div class="text-muted">No long reads yet.</div>`;
  } catch(e){
    console.error(e);
    shortBox.innerHTML = mediumBox.innerHTML = longBox.innerHTML = `<div class="text-danger">Failed to load.</div>`;
  }
}

// --- Boot -----------------------------------------------------------------
(async function(){
  try { await storage.init?.(); } catch {}
  await renderPlanner();
  await renderShelves();

  // refresh planner when user comes back to the tab
  document.addEventListener('visibilitychange', ()=> {
    if (document.visibilityState === 'visible') renderPlanner();
  }, { passive:true });
})();
