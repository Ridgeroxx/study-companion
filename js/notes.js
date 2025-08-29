// /js/notes.js — shared Notes helpers (ES module)
import { storage } from './storage.js';

function getToast(){
  const el = document.getElementById('app-toast');
  const body = document.getElementById('app-toast-body');
  return (msg, type='primary')=>{
    if (!el || !body || !window.bootstrap) { alert(msg); return; }
    body.textContent = msg;
    el.className = `toast align-items-center text-bg-${type} border-0 shadow`;
    new bootstrap.Toast(el, {autohide:true, delay:1600}).show();
  };
}

/**
 * A very small API used by meetings.html toolbar buttons.
 * You can call these directly from inline handlers.
 */
export const notes = {
  /**
   * Reads #meeting-* fields from the DOM and saves as a meeting note.
   * Required inputs:
   *  - #meeting-id (hidden, optional if new)
   *  - #meeting-title
   *  - #meeting-date (YYYY-MM-DD)
   *  - #meeting-type (midweek|weekend)
   *  - #meeting-content
   */
  async saveMeetingNote(){
    try { await storage.init?.(); } catch {}
    const toast = getToast();

    const idEl    = document.getElementById('meeting-id');
    const titleEl = document.getElementById('meeting-title');
    const dateEl  = document.getElementById('meeting-date');
    const typeEl  = document.getElementById('meeting-type');
    const contEl  = document.getElementById('meeting-content');

    const title = (titleEl?.value || '').trim();
    const date  = (dateEl?.value || '').trim();
    const type  = (typeEl?.value || 'midweek').trim();
    const content = contEl?.value || '';

    if (!title) { toast('Please enter a title', 'danger'); return; }
    if (!date)  { toast('Please choose a date', 'danger'); return; }

    const note = {
      id: (idEl?.value || '').trim(),
      title, date, type, content
    };
    const saved = await storage.saveMeetingNote(note);
    if (idEl) idEl.value = saved.id;
    toast('Saved','success');

    // Refresh “My Meeting Notes” list when present
    try { window.loadMeetingNotes?.(); } catch {}
  },

  /**
   * Deletes the currently loaded meeting note by #meeting-id.
   */
  async deleteMeetingNote(){
    try { await storage.init?.(); } catch {}
    const toast = getToast();

    const id = (document.getElementById('meeting-id')?.value || '').trim();
    if (!id) { toast('Nothing to delete','secondary'); return; }
    if (!confirm('Delete this note?')) return;

    await storage.deleteMeetingNote(id);

    // Reset editor fields
    const titleEl = document.getElementById('meeting-title');
    const dateEl  = document.getElementById('meeting-date');
    const typeEl  = document.getElementById('meeting-type');
    const contEl  = document.getElementById('meeting-content');

    if (titleEl) titleEl.value = '';
    if (dateEl)  dateEl.value  = '';
    if (typeEl)  typeEl.value  = 'midweek';
    if (contEl)  contEl.value  = '';

    // Re-render preview if present
    try { window.renderPrev?.(); } catch {}

    // Refresh list when present
    try { window.loadMeetingNotes?.(); } catch {}

    toast('Deleted','danger');
  },

  /**
   * Simple Markdown insertion helper for any focused textarea.
   * You can also call window.app?.insertMarkdown — but this is handy if needed here.
   */
  insertAtCursor(prefix='', suffix=''){
    const el = document.activeElement;
    if (!el || el.tagName !== 'TEXTAREA') return;

    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd   ?? el.value.length;
    const before= el.value.slice(0, start);
    const middle= el.value.slice(start, end);
    const after = el.value.slice(end);

    el.value = before + (prefix||'') + middle + (suffix||'') + after;
    const caret = start + (prefix||'').length + middle.length;
    el.selectionStart = el.selectionEnd = caret;
    el.dispatchEvent(new Event('input', {bubbles:true}));
  }
};

// Optional: a very small initializer for the /notes.html page
export async function initNotesIndex(){
  try { await storage.init?.(); } catch {}
  const $ = s => document.querySelector(s);

  const docs = await storage.getDocuments?.() || [];
  const byId = Object.fromEntries(docs.map(d=>[d.id, d]));
  const anns = await (storage.getAllAnnotations?.() || []);
  const mtgs = await (storage.getMeetingNotes?.() || []);

  const esc = s => (s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

  function render(items){
    const listEl = $('#list');
    if (!listEl) return;
    listEl.innerHTML = items.length ? items.map(h=>{
      const doc = byId[h.documentId];
      const title = doc?.title || h.title || '(Untitled)';
      const text  = h.quote || h.text || h.note || h.content || '';
      return `<div class="border rounded p-2 mb-2">
        <div class="fw-semibold">${esc(title)}</div>
        <div class="text-muted small">${new Date(h.updatedAt||h.createdAt||Date.now()).toLocaleString()}</div>
        <div class="mt-1">${esc(text)}</div>
      </div>`;
    }).join('') : `<div class="text-muted">No notes yet.</div>`;
  }

  let all = [
    ...anns.map(a=>({ ...a, _type:'ann' })),
    ...mtgs.map(m=>({ ...m, _type:'mtg' }))
  ].sort((a,b)=> new Date(b.updatedAt||b.createdAt||0) - new Date(a.updatedAt||a.createdAt||0));

  const qEl = $('#q'); const runBtn = $('#run');
  const run = ()=>{
    const term = (qEl?.value||'').toLowerCase().trim();
    const items = term ? all.filter(x=>
      (x.title||'').toLowerCase().includes(term) ||
      (x.text||x.note||x.content||x.quote||'').toLowerCase().includes(term)
    ) : all;
    render(items);
  };
  qEl && (qEl.value = new URLSearchParams(location.search).get('q') || '');
  runBtn?.addEventListener('click', run);
  run();
}
