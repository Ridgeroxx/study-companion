// js/dashboard.js
// Dashboard wiring: Quick Actions, Upcoming, Masonry Highlights, Tags, Stats, Quick Capture.

import { storage } from './storage.js';
import * as SS from './search/savedSearches.js';

const $ = s => document.querySelector(s);
const toast = (msg, type='primary')=>{
  const el = document.getElementById('app-toast'); const body = document.getElementById('app-toast-body');
  if (!el || !body) return alert(msg);
  body.textContent = msg;
  el.className = `toast align-items-center text-bg-${type} border-0 shadow`;
  new bootstrap.Toast(el, {autohide:true, delay:1600}).show();
};

function esc(s=''){ return (s+'').replace(/[&<>]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c])); }

async function renderQuickActions(){
  await storage.init?.();
  const docs = await (storage.getActiveDocuments?.() || storage.getDocuments?.() || []);
  const active = (docs||[]).filter(d=>!d.deletedAt);
  const recent = [...active].sort((a,b)=>(new Date(b.lastOpened||b.updatedAt||b.createdAt||0))-(new Date(a.lastOpened||a.updatedAt||a.createdAt||0)));

  $('#qa-continue')?.addEventListener('click', ()=>{
    if (!recent[0]) { toast('Nothing to continue','secondary'); return; }
    location.href = `reader.html?doc=${encodeURIComponent(recent[0].id)}`;
  });
  $('#qa-import')?.addEventListener('click', ()=> window.app?.importMenu ? window.app.importMenu() : toast('Import not ready','secondary'));
  $('#qa-library')?.addEventListener('click', ()=> window.app?.openLibraryDrawer ? window.app.openLibraryDrawer() : (location.href='library.html'));
}

function nextWeekly(day, hhmm){
  const [hh,mm] = (hhmm||'00:00').split(':').map(n=>parseInt(n,10)||0);
  const now = new Date();
  const d = new Date(); d.setSeconds(0,0);
  const add = (day - d.getDay() + 7) % 7;
  d.setDate(d.getDate()+add); d.setHours(hh,mm,0,0);
  if (d <= now) d.setDate(d.getDate()+7);
  return d;
}

async function renderUpcoming(){
  const box = $('#upcoming-list');
  try{
    await storage.init?.();
    const rows = [];

    // Weekly schedules
    const mid = await storage.getSchedule?.('midweek');
    const wk  = await storage.getSchedule?.('weekend');
    const addWeekly = (src, label) => {
      const arr = Array.isArray(src) ? src : (src?.items || (src ? [src] : []));
      for (const it of (arr||[])) {
        if (typeof it.day !== 'number' || !it.time) continue;
        rows.push({ label, at: nextWeekly(it.day, it.time) });
      }
    };
    addWeekly(mid,'Midweek meeting');
    addWeekly(wk, 'Weekend meeting');

    // Convention (one-offs)
    const conv = await storage.getConvention?.();
    if (conv?.sessions?.length){
      for (const s of conv.sessions){
        const dt = new Date(`${s.date}T${(s.time||'00:00')}:00`);
        if (!isNaN(dt)) rows.push({ label: s.label||'Convention', at: dt });
      }
    }

    // Planner items (localforage)
    try {
      const list = await localforage.getItem('planner_items_v1') || [];
      for (const it of list){
        const d = new Date(it.dueAt);
        if (!isNaN(d)) rows.push({ label: it.title, at: d });
      }
    } catch {}

    const up = rows
      .filter(r => r.at.getTime() > Date.now())
      .sort((a,b)=>a.at-b.at)
      .slice(0,8);

    box.innerHTML = up.length ? up.map(r=>`
      <div class="d-flex align-items-center justify-content-between border rounded p-2 mb-1">
        <div><i class="fa-regular fa-bell me-2"></i>${esc(r.label)}</div>
        <div class="text-muted">${r.at.toLocaleString()}</div>
      </div>`).join('') : `<div class="text-muted">No upcoming items.</div>`;

  }catch(e){ console.error(e); box.innerHTML = `<div class="text-danger">Failed to load.</div>`; }
}

async function renderStats(){
  await storage.init?.();
  const docs = await (storage.getDocuments?.() || []);
  const anns = await (storage.getAllAnnotations?.() || []);
  const meet = await (storage.getMeetingNotes?.() || []);
  const favs = await (storage.getFavorites?.() || []);

  // Streak: days with annotations in last 14 days
  const set = new Set(anns.map(a => (a.updatedAt||a.createdAt||'').slice(0,10)).filter(Boolean));
  let streak = 0;
  for (let i=0; i<14; i++){
    const d = new Date(); d.setDate(d.getDate()-i);
    if (set.has(d.toISOString().slice(0,10))) streak++; else break;
  }

  $('#stats-box').innerHTML = `
    <div class="row g-2">
      <div class="col-6"><div class="border rounded p-2"><div class="small text-muted">Documents</div><div class="h5 mb-0">${docs.length}</div></div></div>
      <div class="col-6"><div class="border rounded p-2"><div class="small text-muted">Highlights</div><div class="h5 mb-0">${anns.length}</div></div></div>
      <div class="col-6"><div class="border rounded p-2"><div class="small text-muted">Meeting Notes</div><div class="h5 mb-0">${meet.length}</div></div></div>
      <div class="col-6"><div class="border rounded p-2"><div class="small text-muted">Favorites</div><div class="h5 mb-0">${(favs||[]).length}</div></div></div>
      <div class="col-12"><div class="border rounded p-2"><div class="small text-muted">Reading Streak</div><div class="h5 mb-0">${streak} day${streak===1?'':'s'}</div></div></div>
    </div>`;
}

async function renderSmartFolders(){
  try{
    const list = await SS.list();
    $('#smart-folders').innerHTML = list.length ? list.map(i=>`
      <div class="d-flex align-items-center justify-content-between border rounded p-2 mb-2">
        <div class="text-truncate" title="${esc(i.title)}"><i class="fa-regular fa-folder-open me-2"></i>${esc(i.title)}</div>
        <a class="btn btn-sm btn-outline-primary" href="notes.html?smart=${encodeURIComponent(i.id)}"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
      </div>
    `).join('') : `<div class="text-muted">No smart folders yet.</div>`;
  }catch{ $('#smart-folders').innerHTML = `<div class="text-muted">No smart folders yet.</div>`; }
}

async function renderTags(){
  await storage.init?.();
  const anns = await (storage.getAllAnnotations?.() || []);
  const tags = {};
  for (const a of anns){
    const t = Array.isArray(a.tags) ? a.tags : [];
    for (const tag of t){
      const k = (tag||'').trim();
      if (!k) continue;
      tags[k] = (tags[k]||0) + 1;
    }
  }
  const entries = Object.entries(tags).sort((a,b)=>b[1]-a[1]).slice(0,24);
  $('#tag-cloud').innerHTML = entries.length ? entries.map(([k,v])=>`
    <span class="tag-chip">${esc(k)} <span class="text-muted">×${v}</span></span>
  `).join('') : `<div class="text-muted">No tags yet.</div>`;
}

async function renderMasonry(){
  await storage.init?.();
  const anns = await (storage.getAllAnnotations?.() || []);
  if (!anns.length){ $('#masonry').innerHTML = `<div class="text-muted">No highlights yet. Add some while reading.</div>`; return; }
  const docs = await storage.getDocuments?.() || [];
  const byId = Object.fromEntries(docs.map(d=>[d.id, d]));
  const cards = anns
    .filter(a => (a.quote||a.text||a.note))
    .slice(-80)
    .reverse()
    .map(a=>{
      const title = esc(byId[a.documentId]?.title || 'Untitled');
      const body  = esc(a.quote || a.text || a.note || '');
      return `
        <div class="h-card">
          <div class="h-body">
            <div class="h-quote">“${body}”</div>
            <div class="d-flex align-items-center justify-content-between mt-2">
              <div class="h-doc"><i class="fa-regular fa-bookmark me-1"></i>${title}</div>
              ${a.documentId ? `<button class="btn btn-sm btn-outline-primary" onclick="location.href='reader.html?doc=${encodeURIComponent(a.documentId)}'"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>`:''}
            </div>
          </div>
        </div>`;
    }).join('');
  $('#masonry').innerHTML = cards;
}

function bindGeneral(){
  // Theme
  document.getElementById('theme-toggle')?.addEventListener('click', ()=>{
    const curr = document.documentElement.getAttribute('data-bs-theme') || 'light';
    const next = curr === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-bs-theme', next);
    try { localStorage.setItem('app_theme', next); } catch {}
  });
  (function initTheme(){
    const saved = localStorage.getItem('app_theme') || 'light';
    document.documentElement.setAttribute('data-bs-theme', saved);
  })();

  // Quick Capture
  $('#qc-clear')?.addEventListener('click', ()=> { const t=$('#qc-text'); if(t) t.value=''; });
  $('#qc-save')?.addEventListener('click', async ()=>{
    const ta = $('#qc-text'); const text = (ta?.value||'').trim();
    if (!text) return toast('Nothing to save','secondary');
    await storage.init?.();
    const all = await (storage.getActiveDocuments?.() || storage.getDocuments?.() || []);
    const visible = (all||[]).filter(d=>!d.deletedAt);
    let doc = visible.sort((a,b)=> (new Date(b.updatedAt||b.createdAt||0) - new Date(a.updatedAt||a.createdAt||0)))[0];
    if (!doc){
      doc = { id: storage.generateId ? storage.generateId('doc') : `doc_${Date.now()}`, title: 'Scratchpad', type: 'txt', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await storage.saveDocument(doc);
    }
    const list = await storage.getAnnotations(doc.id) || [];
    list.push({ id: storage.generateId ? storage.generateId('ann') : `ann_${Date.now()}`, documentId: doc.id, kind:'note', text, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await storage.saveAnnotations(doc.id, list);
    ta.value=''; toast('Saved to notes','success');
  });

  // Notifications permission helper (for reminders)
  $('#btn-enable-notifs')?.addEventListener('click', async ()=>{
    try {
      if (!('Notification' in window)) return alert('Notifications not supported.');
      if (Notification.permission !== 'granted'){
        const p = await Notification.requestPermission();
        if (p !== 'granted') return toast('Permission denied','secondary');
      }
      // Ask reminders to re-plan if it exists
      try { if (window.reminders?.refresh) await window.reminders.refresh(storage); } catch {}
      toast('Alerts enabled','success');
    } catch { toast('Could not enable','danger'); }
  });
     // Quick Actions (editor & library)
$('#qa-import')?.addEventListener('click', ()=> window.app?.importMenu ? window.app.importMenu() : (location.href='library.html'));
$('#qa-library')?.addEventListener('click', ()=> window.app?.openLibraryDrawer ? window.app.openLibraryDrawer() : (location.href='library.html'));

// Point Editor to a dedicated editor page
document.querySelectorAll('a[href="meetings.html"].btn, a[href="meetings.html"]').forEach(a=>{
  if (a.textContent.match(/editor/i)) a.setAttribute('href','editor.html');
});


  // Fade-in on view
  const io = new IntersectionObserver((entries)=>entries.forEach(e=>{ if (e.isIntersecting) e.target.classList.add('show'); }),{threshold:.1});
  document.querySelectorAll('.fade-in').forEach(el=> io.observe(el));
}

(async function init(){
  try { await storage.init?.(); } catch {}
  bindGeneral();
  await renderQuickActions();
  await renderUpcoming();
  await renderStats();
  await renderSmartFolders();
  await renderTags();
  await renderMasonry();

  // SW for offline + notification delivery
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try { await navigator.serviceWorker.register('sw.js', { scope: './' }); }
      catch (e) { console.warn('SW registration failed', e); }
    });
  }
})();
