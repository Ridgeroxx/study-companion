// /js/app.js
// App shell + home page actions (global & safe for inline bridges)

import { storage } from './storage.js';
import { reader } from './reader.js';
import { notes } from './notes.js';
import { schedule } from './schedule.js';

// Minimal i18n map for visible texts on Home
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
    no_favorites: 'No favorites yet.',
    nav_meetings: 'Meetings',
    continue: 'Continue',
    favorites: 'Favorites',
    pages: 'Pages',
    menu: 'Menu',
    meeting_hero_title: 'Congregation Meetings',
    meeting_hero_sub: 'Plan midweek & weekend, and take fast notes during talks.',
    btn_new_note: 'New Note',
    btn_add: 'Add',
    meeting_notes_title: 'Meeting Notes',
    meeting_notes_sub: 'Use / menu, toolbar, and live preview',
    label_title: 'Title',
    label_date: 'Date',
    label_type: 'Type',
    btn_scripture: 'Scripture',
    preview: 'Preview',
    btn_save: 'Save',
    my_meeting_notes: 'My Meeting Notes',
    my_meeting_notes_sub: 'Click any note to edit',
    right_notes_title: 'Notes (quick view)',
    midweek: 'Midweek',
    weekend: 'Weekend',
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
    no_favorites: 'Aún no hay favoritos.',
    nav_meetings: 'Reuniones',
continue: 'Continuar',
favorites: 'Favoritos',
pages: 'Páginas',
menu: 'Menú',
meeting_hero_title: 'Reuniones de la congregación',
meeting_hero_sub: 'Planifica entre semana y fin de semana, y toma notas rápidas durante los discursos.',
btn_new_note: 'Nueva nota',
btn_add: 'Añadir',
meeting_notes_title: 'Notas de la reunión',
meeting_notes_sub: 'Usa el menú /, la barra de herramientas y la vista previa en vivo',
label_title: 'Título',
label_date: 'Fecha',
label_type: 'Tipo',
btn_scripture: 'Escritura',
preview: 'Vista previa',
btn_save: 'Guardar',
my_meeting_notes: 'Mis notas de reunión',
my_meeting_notes_sub: 'Haz clic en cualquier nota para editarla',
right_notes_title: 'Notas (vista rápida)',
midweek: 'Entre semana',
weekend: 'Fin de semana',
  }
};

class App {
  constructor() {
    this.langKey = 'app_lang';
    this.themeKey = 'app_theme';
    this.currentLanguage = localStorage.getItem(this.langKey) || 'en';

    // One routing hook used by storage/import helpers
    window.onDocumentImported = (doc) => {
      if (!doc?.id) return;
      location.href = `reader.html?doc=${encodeURIComponent(doc.id)}`;
    };
  }

  async init() {
    try { await storage.init?.(); } catch {}

    // Expose globals so inline onclicks never fail
    window.storage = storage;
    window.reader = reader;
    window.notes = notes;
    window.schedule = schedule;

    // Theme + language setup
    this._initThemeToggle();
    this._initLanguageButtons();

    // Wire homepage buttons (defensive: only if they exist)
    this._wireHomeButtons();

    // Fill home lists if we are on a page that has them
    try { await this.loadHomeLists(); } catch (e) { console.warn(e); }

    // After lists render, update visible texts for chosen language
    this.updateLanguageUI();
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
      // refresh visible copy
      this.updateLanguageUI();
    };
    document.getElementById('lang-en')?.addEventListener('click', () => set('en'));
    document.getElementById('lang-es')?.addEventListener('click', () => set('es'));
    set(this.currentLanguage);
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
    // Update all pages that are open
    this.updateLanguageUI?.();
    // Meetings page hook
    try { window.updateMeetingLanguageUI?.(); } catch {}
  }


  // Updates only visible texts already present in app.html (no structural changes)
  updateLanguageUI() {
    // Hero title + subtitle
    const heroTitle = document.querySelector('.hero .h5.fw-bold');
    const heroSub = document.querySelector('.hero .small.text-muted');
    if (heroTitle) heroTitle.textContent = this.translate('welcome');
    if (heroSub)   heroSub.textContent   = this.translate('welcome_sub');

    // Primary buttons (keep icons intact)
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

    // Section headings (in order as present in app.html)
    const sections = document.querySelectorAll('.section-title');
    if (sections[0]) sections[0].textContent = this.translate('quick_capture');
    if (sections[1]) sections[1].textContent = this.translate('continue_reading');
    if (sections[2]) sections[2].textContent = this.translate('recent');
    if (sections[3]) sections[3].textContent = this.translate('your_library');

    // Secondary subtitles
    const quickSub = document.querySelector('.glass-card .small.text-muted');
    if (quickSub) quickSub.textContent = this.translate('quick_capture_sub');

    // Empty state texts if visible
    const contBox = document.getElementById('continue-box');
    if (contBox && contBox.textContent.includes('Nothing yet')) {
      contBox.innerHTML = `<div class="text-muted">${this.translate('nothing_yet')}</div>`;
    }
    const mini = document.getElementById('library-mini');
    if (mini && mini.textContent.includes('Your library is empty')) {
      mini.innerHTML = `<div class="col-12"><div class="text-muted">${this.translate('empty_library')}</div></div>`;
    }
    const sRecent = document.getElementById('side-recent');
    if (sRecent && sRecent.textContent.includes('No recent items')) {
      sRecent.innerHTML = `<div class="small text-muted">${this.translate('no_recent')}</div>`;
    }
    const favBox = document.getElementById('side-favorites');
    if (favBox && favBox.textContent.includes('No favorites yet')) {
      favBox.innerHTML = `<div class="small text-muted">${this.translate('no_favorites')}</div>`;
    }
  }

  /* ---------------- NAV HELPERS (used by inline bridges) ---------------- */
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
      // Minimal export (docs, favorites, bookmarks, annotations, meeting notes, schedules)
      const docs = await storage.getDocuments();
      const favs = await storage.getFavorites();
      const notesAll = [];
      const bms = {};
      for (const d of docs) {
        const ann = await storage.getAnnotations(d.id);
        notesAll.push(...ann);
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

    // Sidebar: Recent (list)
    const sRecent = document.getElementById('side-recent');
    if (sRecent) {
      sRecent.innerHTML = recent.slice(0,10).map(d => `
        <div class="d-flex align-items-center justify-content-between p-1">
          <div class="text-truncate"><i class="fa-solid fa-book-open text-muted me-1"></i>${d.title||'(Untitled)'}</div>
          <button class="btn btn-sm btn-outline-primary" onclick="window.app.openDoc('${d.id}')"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
        </div>`).join('') || `<div class="small text-muted">${this.translate('no_recent')}</div>`;
    }

    // Sidebar: Pages (we’ll reuse active docs as simple pages)
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
    document.getElementById('view-all')?.addEventListener('click', (e) => { e.preventDefault(); this.openLibraryDrawer(); });
    document.getElementById('btn-export')?.addEventListener('click', () => this.exportStudy());

    // rudimentary search:
    const sb = document.getElementById('search-btn');
    const si = document.getElementById('search-input');
    const runSearch = async () => {
      const q = (si?.value || '').trim();
      if (!q) return;
      this.toast(`Search not fully wired yet. You searched: "${q}"`, 'secondary');
    };
    sb?.addEventListener('click', runSearch);
    si?.addEventListener('keypress', (e)=>{ if(e.key==='Enter') runSearch(); });
  }
}

const app = new App();
window.app = app;
app.init();

export { app };
