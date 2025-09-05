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
 */
export const notes = {
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

    try { window.loadMeetingNotes?.(); } catch {}
  },

  async deleteMeetingNote(){
    try { await storage.init?.(); } catch {}
    const toast = getToast();

    const id = (document.getElementById('meeting-id')?.value || '').trim();
    if (!id) { toast('Nothing to delete','secondary'); return; }
    if (!confirm('Delete this note?')) return;

    await storage.deleteMeetingNote(id);

    const titleEl = document.getElementById('meeting-title');
    const dateEl  = document.getElementById('meeting-date');
    const typeEl  = document.getElementById('meeting-type');
    const contEl  = document.getElementById('meeting-content');

    if (titleEl) titleEl.value = '';
    if (dateEl)  dateEl.value  = '';
    if (typeEl)  typeEl.value  = 'midweek';
    if (contEl)  contEl.value  = '';

    try { window.renderPrev?.(); } catch {}
    try { window.loadMeetingNotes?.(); } catch {}

    toast('Deleted','danger');
  },

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

/**
 * Utility for All Notes page to delete a single annotation by doc+id.
 */
async function deleteAnnotationById(docId, annId){
  const list = await storage.getAnnotations(docId) || [];
  const next = list.filter(a => (a.id !== annId));
  await storage.saveAnnotations(docId, next);
}

/**
 * All Notes page init: shows highlights (annotations) + meeting notes together
 * and provides Edit / Delete / Open actions.
 */
export async function initNotesIndex(){
  try { await storage.init?.(); } catch {}
  const $ = s => document.querySelector(s);
  const toast = getToast();
  const esc = s => (s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

  let docs = await storage.getDocuments?.() || [];
  let byId = Object.fromEntries(docs.map(d=>[d.id, d]));
  let anns = await (storage.getAllAnnotations?.() || []);   // array of {id, documentId, text/quote/note, ...}
  let mtgs = await (storage.getMeetingNotes?.() || []);     // array of meeting notes

  // Normalize into a single list with type tags
  function buildAll(){
    return [
      ...anns.map(a=>({ ...a, _type:'ann' })), // keep documentId
      ...mtgs.map(m=>({ ...m, _type:'mtg' }))
    ].sort((a,b)=> new Date(b.updatedAt||b.createdAt||0) - new Date(a.updatedAt||a.createdAt||0));
  }
  let all = buildAll();

  function render(items){
    const listEl = $('#list');
    if (!listEl) return;

    listEl.innerHTML = items.length ? items.map(h=>{
      const isAnn = h._type === 'ann';
      const isMtg = h._type === 'mtg';
      const doc   = isAnn ? byId[h.documentId] : null;

      const title = isMtg
        ? (h.title || 'Meeting Note')
        : (doc?.title || h.title || 'Untitled');

      const when  = new Date(h.updatedAt||h.createdAt||Date.now()).toLocaleString();
      const text  = h.quote || h.text || h.note || h.content || '';

      // Action buttons per type
      const actions = isMtg
        ? `
          <div class="btn-group btn-group-sm">
            <a class="btn btn-outline-primary"
               href="meetings.html#note=${encodeURIComponent(h.id)}"
               title="Edit in Meetings"><i class="fa-regular fa-pen-to-square"></i> Edit</a>
            <button class="btn btn-outline-danger"
                    data-action="del-mtg" data-id="${h.id}"
                    title="Delete"><i class="fa-regular fa-trash-can"></i></button>
          </div>`
        : `
          <div class="btn-group btn-group-sm">
            ${h.documentId ? `<a class="btn btn-outline-primary"
                 href="reader.html?doc=${encodeURIComponent(h.documentId)}"
                 title="Open document"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open</a>` : ''}
            ${(h.documentId && h.id) ? `<button class="btn btn-outline-danger"
                 data-action="del-ann" data-id="${h.id}" data-doc="${h.documentId}"
                 title="Delete highlight"><i class="fa-regular fa-trash-can"></i></button>` : ''}
          </div>`;

      const badge = isMtg
        ? `<span class="badge text-bg-light ms-1">Meeting</span>`
        : `<span class="badge text-bg-light ms-1">${(doc?.type||'TXT').toUpperCase()}</span>`;

      return `<div class="border rounded p-2 mb-2">
        <div class="d-flex align-items-start justify-content-between gap-2">
          <div class="me-2">
            <div class="fw-semibold text-truncate">${esc(title)} ${badge}</div>
            <div class="text-muted small">${when}</div>
            <div class="mt-1">${esc(text)}</div>
          </div>
          ${actions}
        </div>
      </div>`;
    }).join('') : `<div class="text-muted">No notes yet.</div>`;
  }

  // Filtering
  const qEl = $('#q'); const runBtn = $('#run');
  function run(){
    const term = (qEl?.value||'').toLowerCase().trim();
    const items = term ? all.filter(x=>
      (x.title||'').toLowerCase().includes(term) ||
      (x.text||x.note||x.content||x.quote||'').toLowerCase().includes(term)
    ) : all;
    render(items);
  }

  // Delegated actions (delete)
  $('#list')?.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const action = btn.getAttribute('data-action');
    if (action === 'del-mtg'){
      const id = btn.getAttribute('data-id');
      if (!id) return;
      if (!confirm('Delete this meeting note?')) return;
      await storage.deleteMeetingNote?.(id);
      // reload data
      mtgs = await (storage.getMeetingNotes?.() || []);
      all = buildAll();
      run();
      toast('Deleted','danger');
    } else if (action === 'del-ann'){
      const id  = btn.getAttribute('data-id');
      const doc = btn.getAttribute('data-doc');
      if (!id || !doc) return;
      if (!confirm('Delete this highlight/note?')) return;
      await deleteAnnotationById(doc, id);
      // reload data
      anns = await (storage.getAllAnnotations?.() || []);
      all = buildAll();
      run();
      toast('Deleted','danger');
    }
  });

  // Boot
  qEl && (qEl.value = new URLSearchParams(location.search).get('q') || '');
  runBtn?.addEventListener('click', run);
  run();
}
