// js/dashboard.js
import * as reminders from './reminders.js';

const $ = s => document.querySelector(s);

function toast(msg, type='primary'){
  const el = $('#app-toast'); const body = $('#app-toast-body');
  if (!el || !body) return alert(msg);
  body.textContent = msg;
  el.className = `toast align-items-center text-bg-${type} border-0 shadow`;
  new bootstrap.Toast(el, { autohide:true, delay:1500 }).show();
}

/* ---------- Quick Actions ---------- */
(function quickActions(){
  // Continue: open most recent active doc
  $('#qa-continue')?.addEventListener('click', async ()=>{
    try {
      await window.storage?.init?.();
      const list = await window.storage.getRecentDocuments?.(1) || [];
      const d = list[0];
      if (!d) return toast('No recent items','secondary');
      location.href = `reader.html?doc=${encodeURIComponent(d.id)}`;
    } catch { toast('Failed','danger'); }
  });

  $('#qa-import')?.addEventListener('click', ()=>{
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.epub,.pdf,.docx,.txt,.md';
    input.onchange = async ()=>{
      const f = input.files?.[0]; if (!f) return;
      try {
        const doc = await window.storage.importFile(f);
        location.href = `reader.html?doc=${encodeURIComponent(doc.id)}`;
      } catch { toast('Import failed','danger'); }
    };
    input.click();
  });
})();

/* ---------- Upcoming (Meetings + Convention + Planner) ---------- */
async function renderUpcoming(){
  const box = $('#upcoming-list'); if (!box) return;
  try {
    await reminders.init(window.storage); // safe re-entry
    const rows = await reminders.listUpcoming(8);
    box.innerHTML = rows.length ? rows.map(r=>`
      <div class="d-flex align-items-center justify-content-between border rounded p-2 mb-1">
        <div><i class="fa-regular fa-bell me-2"></i>${r.title}</div>
        <div class="text-muted">${new Date(r.whenISO).toLocaleString()}</div>
      </div>`).join('') : `<div class="text-muted">Nothing upcoming.</div>`;
  } catch (e) {
    console.warn(e);
    box.innerHTML = `<div class="text-danger">Failed to load.</div>`;
  }
}
renderUpcoming();

// Enable alerts
document.getElementById('btn-enable-notifs')?.addEventListener('click', async ()=>{
  if (!reminders.isSupported()){
    toast('Notifications need HTTPS or PWA install','danger'); return;
  }
  const r = await reminders.requestPermission();
  if (!r.ok){
    toast('Permission denied or blocked','danger'); return;
  }
  await reminders.refresh(window.storage);
  toast('Alerts enabled','success');
});

/* ---------- Tag cloud from annotations ---------- */
async function renderTagCloud(){
  const box = $('#tag-cloud'); if (!box) return;
  try {
    await window.storage?.init?.();
    const anns = await (window.storage.getAllAnnotations?.() || []);
    const rx = /(^|\s)#([a-z0-9_]+)/ig;
    const map = new Map();
    for (const a of anns){
      const txt = (a.quote||a.text||a.note||'')+'';
      let m; while ((m = rx.exec(txt))){
        const tag = m[2].toLowerCase();
        map.set(tag, (map.get(tag)||0)+1);
      }
    }
    const items = [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,18);
    box.innerHTML = items.length
      ? items.map(([t,n])=>`<span class="tag-chip">#${t} · ${n}</span>`).join(' ')
      : `<span class="text-muted">No tags yet. Add #tags in your notes.</span>`;
  } catch {
    box.innerHTML = `<span class="text-danger">Failed to load tags</span>`;
  }
}
renderTagCloud();

/* ---------- Masonry highlights ---------- */
async function renderMasonry(){
  const box = $('#masonry'); if (!box) return;
  try {
    await window.storage?.init?.();
    const docs = await window.storage.getDocuments?.() || [];
    const byId = Object.fromEntries(docs.map(d=>[d.id,d]));
    const anns = await (window.storage.getAllAnnotations?.() || []);
    const recent = anns.filter(a=>(a.quote||a.text||a.note)).sort((a,b)=> new Date(b.updatedAt||b.createdAt||0) - new Date(a.updatedAt||a.createdAt||0)).slice(0,18);
    const esc = s => (s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    box.innerHTML = recent.length ? recent.map(a=>{
      const doc = byId[a.documentId];
      return `<div class="h-card">
        <div class="h-body">
          <div class="h-quote">“${esc(a.quote||a.text||a.note)}”</div>
          <div class="h-doc mt-1">${esc(doc?.title||'(Untitled)')}</div>
          ${doc?.id ? `<button class="btn btn-sm btn-outline-primary mt-2" onclick="location.href='reader.html?doc=${encodeURIComponent(doc.id)}'"><i class="fa-solid fa-forward"></i> Open book</button>`:''}
        </div>
      </div>`;
    }).join('') : `<div class="text-muted">No highlights yet.</div>`;
  } catch {
    box.innerHTML = `<div class="text-danger">Failed to load highlights</div>`;
  }
}
renderMasonry();

/* ---------- Stats & Streak from focus sessions ---------- */
async function renderStats(){
  const box = $('#stats-box'); if (!box) return;
  try {
    const list = (await localforage.getItem('focus_sessions_v1')) || [];
    if (!list.length){ box.textContent = 'No focus sessions yet.'; return; }
    const now = new Date();
    const dayKey = d => new Date(new Date(d).toDateString()).getTime();
    const map = new Map();
    for (const s of list){
      const k = dayKey(s.at);
      map.set(k, (map.get(k)||0) + (s.minutes||0));
    }
    // streak: consecutive days with >0 minutes, ending today
    let streak = 0;
    for (let i=0;;i++){
      const d = new Date(); d.setDate(now.getDate()-i); d.setHours(0,0,0,0);
      const k = d.getTime();
      if ((map.get(k)||0) > 0) streak++;
      else break;
    }
    // last 7 days mins
    let wk = 0;
    for (let i=0;i<7;i++){
      const d = new Date(); d.setDate(now.getDate()-i); d.setHours(0,0,0,0);
      wk += (map.get(d.getTime())||0);
    }
    box.innerHTML = `
      <div>7-day minutes: <b>${wk}</b></div>
      <div>Streak: <b>${streak}</b> day(s)</div>
      <div class="text-muted small mt-1">Finish focus timers to grow these.</div>
    `;
  } catch { box.textContent = 'Failed to load stats.'; }
}
renderStats();
document.addEventListener('focus:updated', renderStats);

/* ---------- Quick Capture ---------- */
document.getElementById('qc-clear')?.addEventListener('click', ()=> { const t=$('#qc-text'); if(t) t.value=''; });
document.getElementById('qc-save')?.addEventListener('click', async ()=>{
  const ta = $('#qc-text'); const text = (ta?.value||'').trim();
  if (!text) return toast('Nothing to save','secondary');
  await window.storage?.init?.();
  // Save into (or create) "Scratchpad"
  const docs = await window.storage.getDocuments?.() || [];
  let doc = docs.find(d=>d.title==='Scratchpad' && !d.deletedAt);
  if (!doc){
    doc = await window.storage.saveDocument({ id: window.storage.generateId('doc'), title:'Scratchpad', type:'txt', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() });
  }
  const anns = await window.storage.getAnnotations(doc.id) || [];
  anns.push({ id: window.storage.generateId('ann'), documentId: doc.id, kind:'note', text, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() });
  await window.storage.saveAnnotations(doc.id, anns);
  ta.value = ''; toast('Saved','success');
});
