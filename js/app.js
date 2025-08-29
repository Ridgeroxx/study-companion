// js/app.js — App shell + home page actions (global & safe for inline bridges)

import { storage } from './storage.js';
import { reader } from './reader.js';
import { notes } from './notes.js';
import { schedule } from './schedule.js';
import { FLAGS } from './flags.js';
import { bindSlashMenu } from './notes/templates.js';
import { lock } from './security/lock.js';
import * as reminders from './reminders.js';


const I18N = {
  en: {
    welcome: 'Welcome back 👋',
    welcome_sub: 'Capture notes, import materials, and jump into reading.',
    quick_capture: 'Quick capture',
    quick_capture_sub: 'Save thoughts fast',
    new_page: 'New page',
    import: 'Import',
    clear: 'Clear',
    save: 'Save',
    continue_reading: 'Continue reading',
    recent: 'Recent',
    your_library: 'Your library',
    library: 'Library',
    open: 'Open',
    nothing_yet: 'Nothing yet. Import a document or create a page to begin.',
    empty_library: 'Your library is empty.',
    no_recent: 'No recent items.',
    no_favorites: 'No favorites yet.'
  },
  es: {
    welcome: 'Bienvenido de nuevo 👋',
    welcome_sub: 'Captura notas, importa materiales y ponte a leer.',
    quick_capture: 'Captura rápida',
    quick_capture_sub: 'Guarda ideas rápidamente',
    new_page: 'Nueva página',
    import: 'Importar',
    clear: 'Borrar',
    save: 'Guardar',
    continue_reading: 'Seguir leyendo',
    recent: 'Reciente',
    your_library: 'Tu biblioteca',
    library: 'Biblioteca',
    open: 'Abrir',
    nothing_yet: 'Aún no hay nada. Importa un documento o crea una página para empezar.',
    empty_library: 'Tu biblioteca está vacía.',
    no_recent: 'No hay elementos recientes.',
    no_favorites: 'Aún no hay favoritos.'
  }
};

const TEMPLATES = {
  outline: { title:'Outline', type:'midweek', body:
`# Title

## Main Points
- Point 1
- Point 2
- Point 3

## Scripture
- [ ] Add scripture references here

## Actions
- [ ] Task 1
- [ ] Task 2
`},
  study: { title:'Study Note', type:'midweek', body:
`# Study Note

**Topic:**  
**Key Text:**  

## Notes
- 

## Questions
- 

## Takeaways
- 
`},
  sermon: { title:'Sermon Outline', type:'weekend', body:
`# Sermon Outline

**Theme:**  
**Key Scripture:**  

## Introduction
- 

## Body
- 

## Conclusion
- 

## Application
- 
`},
  meeting: { title:'Meeting Notes', type:'midweek', body:
`# Meeting Notes

**Date:** ${new Date().toISOString().slice(0,10)}

## Highlights
- 

## Scriptures
- 

## To remember
- 
`}
};

class App {
  constructor() {
    this.langKey = 'app_lang';
    this.themeKey = 'app_theme';
    this.currentLanguage = localStorage.getItem(this.langKey) || 'en';

    // When a file import finishes, open it
    window.onDocumentImported = (doc) => {
      if (!doc?.id) return;
      location.href = `reader.html?doc=${encodeURIComponent(doc.id)}`;
    };

    // Expose globals early
    window.storage = storage;
    window.reader  = reader;
    window.notes   = notes;
    window.schedule= schedule;
    window.app     = this;
  }

  async init() {
    try { await storage.init?.(); } catch {}
    

    // Initialize Security Lock (once)
    try {
      if (FLAGS?.lock) await lock.init({ enabled:true, idleMinutes: 15 });
      else await lock.init({ idleMinutes: 15 }); // safe no-op if disabled
    } catch {}

    // Initialize Reminders (once)
    await reminders.init(storage);

    // Global hooks to refresh reminders when background asks
    navigator.serviceWorker?.addEventListener('message', (evt)=>{
    if (evt.data?.type === 'REMINDERS_REFRESH') reminders.refresh(storage);
    });

    // Optional events schedule.js can dispatch after saving
    window.addEventListener('schedule:updated', ()=> reminders.refresh());
    window.addEventListener('convention:updated', ()=> reminders.refresh());

    // Slash menu only if the meetings editor exists on this page
    const meetingEditor = document.getElementById('meeting-content');
    if (meetingEditor) { try { bindSlashMenu(meetingEditor); } catch {} }

    this._initThemeToggle();
    this._initLanguageButtons();
    this._wireHomeButtons();

    try { await this.loadHomeLists(); } catch (e) { console.warn(e); }
    this.updateLanguageUI();

    // Home dynamic cards
    this.renderUpcoming().catch(()=>{});
    this.renderRandomHighlight().catch(()=>{});
  }

  /* ---------------- THEME / LANGUAGE ---------------- */
  _initThemeToggle() {
    const saved = localStorage.getItem(this.themeKey) || 'light';
    document.documentElement.setAttribute('data-bs-theme', saved);
    const btn = document.getElementById('theme-toggle');
    btn?.addEventListener('click', () => {
      const curr = document.documentElement.getAttribute('data-bs-theme') || 'light';
      const next = curr === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-bs-theme', next);
      try { localStorage.setItem(this.themeKey, next); } catch {}
    });
  }

  _initLanguageButtons() {
    const set = (lang) => {
      this.currentLanguage = (lang === 'es') ? 'es' : 'en';
      try { localStorage.setItem(this.langKey, this.currentLanguage); } catch {}
      const badge = document.getElementById('current-language');
      if (badge) badge.textContent = this.currentLanguage.toUpperCase();
      this.updateLanguageUI();
      // Page-level language refreshers can hook this:
      try { window.meetingsLang?.applyI18N?.(); } catch {}
    };
    document.getElementById('lang-en')?.addEventListener('click', () => set('en'));
    document.getElementById('lang-es')?.addEventListener('click', () => set('es'));
    set(this.currentLanguage);
  }

  insertMarkdown(prefix='', suffix=''){
  const ta = document.getElementById('meeting-content') || document.querySelector('textarea:focus');
  if (!ta) return;
  const start = ta.selectionStart ?? ta.value.length;
  const end   = ta.selectionEnd   ?? ta.value.length;
  const before= ta.value.slice(0, start);
  const middle= ta.value.slice(start, end);
  const after = ta.value.slice(end);
  ta.value = before + (prefix||'') + middle + (suffix||'') + after;
  const caret = start + (prefix||'').length + middle.length;
  ta.selectionStart = ta.selectionEnd = caret;
  ta.dispatchEvent(new Event('input', {bubbles:true}));
}


  translate(key) {
    const lang = this.currentLanguage || 'en';
    return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
  }

  setLanguage(lang) {
    this.currentLanguage = (lang === 'es') ? 'es' : 'en';
    try { localStorage.setItem(this.langKey, this.currentLanguage); } catch {}
    const badge = document.getElementById('current-language');
    if (badge) badge.textContent = this.currentLanguage.toUpperCase();
    this.updateLanguageUI?.();
    try { window.meetingsLang?.applyI18N?.(); } catch {}
  }

  updateLanguageUI() {
    const heroTitle = document.querySelector('.hero .h5.fw-bold');
    const heroSub   = document.querySelector('.hero .small.text-muted');
    if (heroTitle) heroTitle.textContent = this.translate('welcome');
    if (heroSub)   heroSub.textContent   = this.translate('welcome_sub');

    const newPageBtn = document.getElementById('btn-new-page');
    if (newPageBtn) newPageBtn.innerHTML = `<i class="fa-solid fa-file-circle-plus me-1"></i>${this.translate('new_page')}`;

    const importBtn = document.getElementById('btn-import');
    if (importBtn) importBtn.innerHTML = `<i class="fa-solid fa-upload me-1"></i>${this.translate('import')}`;

    const saveBtn = document.getElementById('btn-save-note');
    if (saveBtn) saveBtn.innerHTML = `<i class="fa-solid fa-save me-1"></i>${this.translate('save')}`;

    const clearBtn = document.getElementById('btn-clear-note');
    if (clearBtn) clearBtn.textContent = this.translate('clear');

    const openLibBtn = document.getElementById('btn-open-library');
    if (openLibBtn) openLibBtn.innerHTML = `<i class="fa-solid fa-books"></i> ${this.translate('library')}`;

    const openMini = document.getElementById('open-lib-mini');
    if (openMini) openMini.textContent = this.translate('open');

    const sections = document.querySelectorAll('.section-title');
    if (sections[0]) sections[0].textContent = this.translate('quick_capture');
    if (sections[1]) sections[1].textContent = this.translate('continue_reading');
    if (sections[2]) sections[2].textContent = this.translate('recent');
    if (sections[3]) sections[3].textContent = this.translate('your_library');

    const qc = document.querySelector('.glass-card .small.text-muted');
    if (qc) qc.textContent = this.translate('quick_capture_sub');
  }

  /* ---------------- NAV HELPERS ---------------- */
  openDoc(id) {
    if (!id) return;
    location.href = `reader.html?doc=${encodeURIComponent(id)}`;
  }

  async importMenu() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.epub,.pdf,.docx,.txt,.md';
    input.multiple = false;
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const doc = await storage.importFile(f);
        window.onDocumentImported?.(doc);
      } catch (e) {
        console.error(e);
        this.toast('Import failed', 'danger');
      }
    };
    input.click();
  }

  async exportStudy() {
    try {
      const docs = await storage.getDocuments();
      const favs = await storage.getFavorites();
      const notesAll = [];
      const bms = {};
      for (const d of docs) {
        const ann = await storage.getAnnotations(d.id);
        notesAll.push(...(ann||[]));
        bms[d.id] = await storage.getBookmarks(d.id);
      }
      const meeting = await storage.getMeetingNotes?.() || [];
      const midweek = await storage.getSchedule?.('midweek') || {};
      const weekend = await storage.getSchedule?.('weekend') || {};

      const bundle = {
        version: 1,
        exportedAt: new Date().toISOString(),
        docs,
        favorites: favs,
        annotations: notesAll,
        bookmarks: bms,
        meeting,
        schedules: { midweek, weekend }
      };

      const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `study-bundle-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      this.toast('Export complete', 'success');
    } catch (e) {
      console.error(e);
      this.toast('Export failed', 'danger');
    }
  }

  async createNewTextPage() {
    const title = prompt('Title for the new page:', 'New Page');
    if (title == null) return;
    const doc = {
      id: storage.generateId ? storage.generateId('doc') : `doc_${Date.now()}`,
      title: title.trim() || 'Untitled',
      type: 'txt',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await storage.saveDocument(doc);
    this.openDoc(doc.id);
  }

  async saveQuickNote() {
    const ta = document.getElementById('quick-note');
    const text = (ta?.value || '').trim();
    if (!text) return this.toast('Nothing to save', 'secondary');

    const all = await (storage.getActiveDocuments?.() || storage.getDocuments?.() || []);
    const visible = (all || []).filter(d => !d.deletedAt);
    let doc = visible.sort((a,b)=> (new Date(b.updatedAt||b.createdAt||0) - new Date(a.updatedAt||a.createdAt||0)))[0];

    if (!doc) {
      doc = {
        id: storage.generateId ? storage.generateId('doc') : `doc_${Date.now()}`,
        title: 'Scratchpad',
        type: 'txt',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await storage.saveDocument(doc);
    }

    const list = await storage.getAnnotations(doc.id) || [];
    list.push({
      id: storage.generateId ? storage.generateId('ann') : `ann_${Date.now()}`,
      documentId: doc.id,
      kind: 'note',
      text,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await storage.saveAnnotations(doc.id, list);
    ta.value = '';
    this.toast('Saved to notes', 'success');
  }

  async openLibraryDrawer() {
    try {
      const list = await storage.getDocuments() || [];
      const active = list.filter(d => !d.deletedAt);
      const box = document.getElementById('library-list');
      if (!box) return;
      if (!active.length) box.innerHTML = `<div class="text-muted">${this.translate('empty_library')}</div>`;
      else {
        box.innerHTML = active
          .sort((a,b)=>(new Date(b.updatedAt||b.createdAt||0))-(new Date(a.updatedAt||a.createdAt||0)))
          .map(d => `
            <div class="d-flex align-items-center justify-content-between border rounded p-2 mb-2 shadow-sm">
              <div>
                <div class="fw-semibold">${d.title || '(Untitled)'}</div>
                <div class="text-muted small">${(d.type||'').toUpperCase()} · ${new Date(d.updatedAt||d.createdAt||Date.now()).toLocaleString()}</div>
              </div>
              <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-primary" onclick="window.app.openDoc('${d.id}')"><i class="fa-solid fa-folder-open"></i></button>
              </div>
            </div>`).join('');
      }
      const el = document.getElementById('libraryDrawer');
      if (window.bootstrap && el) new bootstrap.Offcanvas(el).show();
    } catch (e) {
      console.error(e);
      this.toast('Failed to open library', 'danger');
    }
  }

  /* ---------------- Templates: create a real note, then open editor ---------------- */
  async createFromTemplate(templateId) {
    const t = TEMPLATES[templateId];
    if (!t) return this.toast('Unknown template', 'danger');

    const id = storage.generateId ? storage.generateId('mtg') : `mtg_${Date.now()}`;
    const now = new Date().toISOString();
    const note = {
      id,
      title: t.title,
      date: now.slice(0,10),
      type: t.type || 'midweek',
      content: t.body,
      createdAt: now,
      updatedAt: now
    };

    try {
      await storage.saveMeetingNote?.(note);
      location.href = `meetings.html#note=${encodeURIComponent(id)}`;
    } catch (e) {
      console.error(e);
      this.toast('Could not create from template', 'danger');
    }
  }

  /* ---------------- Upcoming (Home) ---------------- */
  async renderUpcoming() {
    const box = document.getElementById('home-upcoming');
    if (!box) return;
    try {
      const rows = [];

      // Pull from reminders so it's consistent with notifications
      const list = await reminders.listUpcoming(5);
      for (const r of list) {
        rows.push({
          label: r.title,
          when: new Date(r.whenISO)
        });
      }

      box.innerHTML = rows.length ? rows.map(r=>`
        <div class="d-flex align-items-center justify-content-between border rounded p-2 mb-1">
          <div><i class="fa-regular fa-bell me-2"></i>${r.label}</div>
          <div class="text-muted">${r.when.toLocaleString()}</div>
        </div>`).join('') : `<div class="text-muted">No upcoming items.</div>`;
    } catch(e) {
      console.error(e);
      box.innerHTML = `<div class="text-danger">Failed to load.</div>`;
    }
  }

  async renderRandomHighlight() {
    const box = document.getElementById('home-highlight');
    if (!box) return;
    try {
      const anns = await (storage.getAllAnnotations?.() || []);
      const only = (anns||[]).filter(a => (a.quote||a.text||a.note));
      if (!only.length) { box.innerHTML = `<div class="text-muted">No highlights yet.</div>`; return; }
      const pick = only[Math.floor(Math.random()*only.length)];
      const esc = s => (s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
      box.innerHTML = `
        <blockquote class="mb-2">“${esc(pick.quote||pick.text||pick.note||'') }”</blockquote>
        ${pick.documentId ? `<button class="btn btn-sm btn-outline-primary" onclick="window.app.openDoc('${pick.documentId}')"><i class="fa-solid fa-forward"></i> Open book</button>`:''}
      `;
    } catch {
      box.innerHTML = `<div class="text-danger">Failed to load.</div>`;
    }
  }

  /* ---------------- HOME LISTS ---------------- */
  async loadHomeLists() {
    const all = await (storage.getActiveDocuments?.() || storage.getDocuments?.() || []);
    const active = (all || []).filter(d=>!d.deletedAt);
    const recent = [...active].sort((a,b)=>(new Date(b.lastOpened||b.updatedAt||b.createdAt||0))-(new Date(a.lastOpened||a.updatedAt||a.createdAt||0)));

    // Continue
    const cont = recent[0];
    const contBox = document.getElementById('continue-box');
    if (contBox) {
      contBox.innerHTML = cont ? `
        <div class="d-flex align-items-center justify-content-between border rounded p-2 shadow-sm">
          <div class="d-flex align-items-center gap-3">
            <div class="fs-3"><i class="fa-solid fa-book-open"></i></div>
            <div>
              <div class="fw-semibold">${cont.title || '(Untitled)'}</div>
              <div class="small text-muted">${(cont.type||'').toUpperCase()} · ${new Date(cont.updatedAt||cont.createdAt||Date.now()).toLocaleString()}</div>
            </div>
          </div>
          <div><button class="btn btn-sm btn-primary" onclick="window.app.openDoc('${cont.id}')"><i class="fa-solid fa-forward me-1"></i>Continue</button></div>
        </div>` : `<div class="text-muted">${this.translate('nothing_yet')}</div>`;
    }

    // Recent grid
    const rbox = document.getElementById('recent-grid');
    if (rbox) {
      rbox.innerHTML = (recent.slice(0,8).map(d => `
        <div class="col-12 col-sm-6">
          <div class="border rounded p-2 h-100 shadow-sm d-flex align-items-center justify-content-between">
            <div>
              <div class="fw-semibold">${d.title || '(Untitled)'}</div>
              <div class="small text-muted">${(d.type||'').toUpperCase()} · ${new Date(d.updatedAt||d.createdAt||Date.now()).toLocaleString()}</div>
            </div>
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-primary" onclick="window.app.openDoc('${d.id}')"><i class="fa-solid fa-folder-open"></i></button>
            </div>
          </div>
        </div>`).join('')) || `<div class="col-12"><div class="text-muted">${this.translate('no_recent')}</div></div>`;
    }

    // Library mini
    const mini = document.getElementById('library-mini');
    if (mini) {
      mini.innerHTML = (active.slice(0,6).map(d=>`
        <div class="col-12 col-sm-6 col-lg-4">
          <div class="border rounded p-2 h-100 shadow-sm">
            <div class="d-flex align-items-center gap-2">
              <i class="fa-regular fa-file-lines text-muted"></i>
              <div class="fw-semibold text-truncate">${d.title || '(Untitled)'}</div>
            </div>
            <div class="small text-muted mt-1">${(d.type||'').toUpperCase()}</div>
            <div class="d-flex justify-content-end mt-2">
              <button class="btn btn-sm btn-outline-primary" onclick="window.app.openDoc('${d.id}')"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
            </div>
          </div>
        </div>`).join('')) || `<div class="col-12"><div class="text-muted">${this.translate('empty_library')}</div></div>`;
    }

    // Sidebar: Favorites
    const favIds = await storage.getFavorites?.() || [];
    const favDocs = active.filter(d => (favIds||[]).includes(d.id));
    const favBox = document.getElementById('side-favorites');
    if (favBox) {
      favBox.innerHTML = favDocs.length ? favDocs.map(d => `
        <div class="d-flex align-items-center justify-content-between p-1">
          <div class="text-truncate" title="${d.title||'(Untitled)'}">
            <i class="fa-solid fa-star text-warning me-1"></i>${d.title||'(Untitled)'}
          </div>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" onclick="window.app.openDoc('${d.id}')"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
            <button class="btn btn-outline-warning" onclick="window.app.toggleFav('${d.id}')"><i class="fa-solid fa-star"></i></button>
          </div>
        </div>`).join('') : `<div class="small text-muted">${this.translate('no_favorites')}</div>`;
    }

    // Sidebar: Recent
    const sRecent = document.getElementById('side-recent');
    if (sRecent) {
      sRecent.innerHTML = recent.slice(0,10).map(d => `
        <div class="d-flex align-items-center justify-content-between p-1">
          <div class="text-truncate"><i class="fa-solid fa-book-open text-muted me-1"></i>${d.title||'(Untitled)'}</div>
          <button class="btn btn-sm btn-outline-primary" onclick="window.app.openDoc('${d.id}')"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
        </div>`).join('') || `<div class="small text-muted">${this.translate('no_recent')}</div>`;
    }

    // Sidebar: Pages
    const sPages = document.getElementById('side-pages');
    if (sPages) {
      sPages.innerHTML = active
        .sort((a,b)=>(a.title||'').localeCompare(b.title||''))
        .map(d => `
          <div class="d-flex align-items-center justify-content-between p-1">
            <div class="text-truncate" title="${d.title||'(Untitled)'}"><i class="fa-regular fa-file-lines text-muted me-1"></i>${d.title||'(Untitled)'}</div>
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-warning" title="Favorite" onclick="window.app.toggleFav('${d.id}')"><i class="fa-regular fa-star"></i></button>
              <button class="btn btn-outline-primary" title="Open" onclick="window.app.openDoc('${d.id}')"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
              <button class="btn btn-outline-danger" title="Trash" onclick="window.app.softDeleteDoc('${d.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>`).join('') || `<div class="small text-muted">No pages yet.</div>`;
    }
  }

  /* ---------------- FAVORITES / TRASH ---------------- */
  async toggleFav(id) {
    await storage.toggleFavorite?.(id);
    await this.loadHomeLists();
    this.updateLanguageUI();
  }
  async softDeleteDoc(id) {
    if (!confirm('Move this item to Trash?')) return;
    await storage.softDeleteDocument?.(id);
    await this.loadHomeLists();
    this.updateLanguageUI();
    this.toast('Moved to Trash','secondary');
  }

  /* ---------------- UI HELPERS ---------------- */
  toast(message, type='primary') {
    const el = document.getElementById('app-toast');
    const body = document.getElementById('app-toast-body');
    if (!el || !body || !window.bootstrap) { alert(message); return; }
    body.textContent = message;
    el.className = `toast align-items-center text-bg-${type} border-0 shadow`;
    new bootstrap.Toast(el, { autohide: true, delay: 1800 }).show();
  }

  _wireHomeButtons() {
    document.getElementById('btn-import')?.addEventListener('click', () => this.importMenu());
    document.getElementById('btn-new-page')?.addEventListener('click', () => this.createNewTextPage());
    document.getElementById('btn-save-note')?.addEventListener('click', () => this.saveQuickNote());
    document.getElementById('btn-clear-note')?.addEventListener('click', () => { const t = document.getElementById('quick-note'); if (t) t.value=''; });
    document.getElementById('btn-open-library')?.addEventListener('click', () => this.openLibraryDrawer());
    document.getElementById('open-lib-mini')?.addEventListener('click', (e) => { e.preventDefault(); this.openLibraryDrawer(); });
    document.getElementById('view-all')?.addEventListener('click', (e) => { e.preventDefault(); location.href='notes.html'; });

    // Home cards:
    document.getElementById('home-import')?.addEventListener('click', ()=> this.importMenu());
    document.getElementById('btn-next-highlight')?.addEventListener('click', ()=> this.renderRandomHighlight());
  }
}

const app = new App();
window.app = app;
app.init();

export { app };
