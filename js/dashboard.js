// js/dashboard.js
import { storage } from './storage.js';

const dashToast = (msg, type='primary') =>
  (window.app?.toast?.(msg, type)) ?? alert(msg);

export const dashboard = (()=>{
  const esc = (s='') => String(s).replace(/[&<>]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]));

  async function refresh(){
    try { await storage.init?.(); } catch {}
    await Promise.all([
      renderSmartFolders(),
      renderTags(),
      renderMasonry(),
      renderStats()
    ]).catch(e => console.error(e));
  }

  async function renderSmartFolders(){
    const box = document.getElementById('smart-folders'); if (!box) return;
    try{
      const sfs = (await storage.getSmartFolders?.()) || [];
      box.innerHTML = sfs.length
        ? sfs.map(sf=>`
            <div class="d-flex justify-content-between align-items-center border rounded p-2 mb-2">
              <div class="text-truncate">${esc(sf.title||'Untitled')}</div>
              <a class="btn btn-sm btn-outline-primary" href="notes.html">Open</a>
            </div>
          `).join('')
        : `<div class="text-muted">No smart folders yet.</div>`;
    }catch{
      box.innerHTML = `<div class="text-muted">No smart folders yet.</div>`;
    }
  }

  async function renderTags(){
    const box = document.getElementById('tag-cloud'); if (!box) return;
    try{
      let tags = [];
      if (storage.getRecentTags) {
        tags = await storage.getRecentTags(30); // [{name,count}]
      } else {
        const anns = (await storage.getAllAnnotations?.()) || [];
        const freq = {};
        anns.forEach(a => (a.tags||[]).forEach(t => freq[t]=(freq[t]||0)+1));
        tags = Object.entries(freq).map(([name,count])=>({name,count}))
               .sort((a,b)=>b.count-a.count).slice(0,20);
      }
      box.innerHTML = tags.length
        ? tags.map(t=>`<span class="tag-chip">${esc(t.name)}${t.count?` <span class="small text-muted">(${t.count})</span>`:''}</span>`).join('')
        : `<span class="text-muted">No tags yet.</span>`;
    }catch{
      box.innerHTML = `<span class="text-muted">No tags yet.</span>`;
    }
  }

  async function renderMasonry(){
    const box = document.getElementById('masonry'); if (!box) return;
    try{
      let items = [];
      if (storage.getRecentHighlights) {
        items = await storage.getRecentHighlights(30); // [{text, docTitle}]
      } else if (storage.getAllAnnotations) {
        const anns = await storage.getAllAnnotations();
        items = (anns||[]).map(a => ({
          text: a.text || a.quote || a.note || '',
          docTitle: a.docTitle || a.title || ''
        })).filter(i=>i.text.trim());
      }
      box.innerHTML = items?.length
        ? items.map(h=>`
            <div class="h-card">
              <div class="h-body">
                <div class="h-quote">"${esc(h.text||'')}"</div>
                <div class="h-doc">${esc(h.docTitle||'')}</div>
              </div>
            </div>`).join('')
        : `<div class="text-muted small">No highlights yet.</div>`;
    }catch{
      box.innerHTML = `<div class="text-muted small">No highlights yet.</div>`;
    }
  }

  // NEW: Stats & Streak
  async function renderStats(){
    const box = document.getElementById('stats-box'); if (!box) return;
    try{
      const [docs,favs,notes,anns] = await Promise.all([
        storage.getDocuments?.()   || [],
        storage.getFavorites?.()   || [],
        storage.getMeetingNotes?.()|| [],
        storage.getAllAnnotations?.() || []
      ]);

      const totals = {
        docs: (docs||[]).length,
        favorites: (favs||[]).length,
        notes: (notes||[]).length,
        highlights: (anns||[]).length
      };

      // Build activity counts per day (last 14 days)
      const counts = {};
      const add = (iso)=>{
        if (!iso) return;
        const d = new Date(iso);
        if (isNaN(d)) return;
        const key = d.toISOString().slice(0,10);
        counts[key] = (counts[key]||0) + 1;
      };

      (docs||[]).forEach(d=> add(d.updatedAt || d.createdAt));
      (notes||[]).forEach(n=> add(n.updatedAt || n.createdAt));
      (anns||[]).forEach(a=> add(a.updatedAt || a.createdAt));

      const days = [];
      const today = new Date(); today.setHours(0,0,0,0);
      for (let i=13; i>=0; i--){
        const dd = new Date(today); dd.setDate(today.getDate()-i);
        const key = dd.toISOString().slice(0,10);
        days.push({ key, count: counts[key]||0 });
      }

      // Streak (consecutive days from today with any activity)
      let streak = 0;
      for (let i=days.length-1; i>=0; i--){
        if (days[i].count > 0) streak++;
        else break;
      }

      const max = Math.max(...days.map(d=>d.count), 1);
      const bars = days.map(d=>{
        const h = Math.round((d.count / max) * 36) + 2; // min height 2px
        return `<div title="${d.key}: ${d.count}"
                    style="width:8px;height:${h}px;border-radius:4px;background:currentColor;opacity:${d.count?0.9:0.25}"></div>`;
      }).join('');

      box.innerHTML = `
        <div class="d-flex align-items-center justify-content-between">
          <div class="d-flex align-items-baseline gap-2">
            <div class="display-6 fw-bold" aria-label="Current streak">${streak}</div>
            <div class="small text-muted">day streak</div>
          </div>
          <div class="ms-auto d-flex align-items-end gap-1" aria-hidden="true">${bars}</div>
        </div>
        <div class="d-flex flex-wrap gap-2 mt-2">
          <span class="badge text-bg-light">Docs: ${totals.docs}</span>
          <span class="badge text-bg-light">Notes: ${totals.notes}</span>
          <span class="badge text-bg-light">Highlights: ${totals.highlights}</span>
          <span class="badge text-bg-light">Favorites: ${totals.favorites}</span>
        </div>
      `;
    }catch(e){
      console.error(e);
      box.innerHTML = `<div class="text-danger">Failed to load stats.</div>`;
    }
  }

  return { refresh };
})();

// Expose & boot
window.dashboard = dashboard;
document.addEventListener('DOMContentLoaded', ()=> dashboard.refresh());

/* ---------- Quick Capture (fixed: no `$`) ---------- */
const qcText = document.getElementById('qc-text');

document.getElementById('qc-clear')?.addEventListener('click', ()=>{
  if (qcText) qcText.value = '';
});

document.getElementById('qc-save')?.addEventListener('click', async ()=>{
  const text = (qcText?.value || '').trim();
  if (!text) return dashToast('Nothing to save','secondary');

  try {
    await storage.init?.();

    // Save into (or create) "Scratchpad"
    const docs = await storage.getDocuments?.() || [];
    let doc = docs.find(d=> d.title==='Scratchpad' && !d.deletedAt);
    if (!doc){
      doc = await storage.saveDocument({
        id: storage.generateId('doc'),
        title: 'Scratchpad',
        type: 'txt',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    const anns = await storage.getAnnotations(doc.id) || [];
    anns.push({
      id: storage.generateId('ann'),
      documentId: doc.id,
      kind: 'note',
      text,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await storage.saveAnnotations(doc.id, anns);

    if (qcText) qcText.value = '';
    dashToast('Saved','success');

    // Update dashboard panels (tags, masonry, stats)
    window.dashboard?.refresh?.();
  } catch (e) {
    console.error(e);
    dashToast('Save failed','danger');
  }
});
