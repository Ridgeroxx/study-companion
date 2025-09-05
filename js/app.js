// js/app.js — wired, clean, resilient
console.log('Study Companion build', '2025-09-05-15');

import { storage } from './storage.js';
import { reader } from './reader.js';
import { notes } from './notes.js';
import { schedule } from './schedule.js';
import { FLAGS } from './flags.js';
import { bindSlashMenu } from './notes/templates.js';
import { lock } from './security/lock.js';
import * as reminders from './reminders.js';
import { sync } from './sync-local.js';

// expose globals (once)
window.storage   = storage;
window.reader    = reader;
window.notes     = notes;
window.schedule  = schedule;
window.reminders = reminders;
window.app       = null;

const I18N = {
  en: { quick_actions:'Quick Actions', import:'Import', continue:'Continue', study_planner:'Study Planner',
        today:'Today', this_week:'This Week', later:'Later', upcoming:'Upcoming', enable_alerts:'Enable alerts',
        focus_timer:'Focus Timer', stats_streak:'Stats & Streak', smart_folders:'Smart Folders', tags:'Tags',
        masonry:'Masonry Highlights', quick_capture:'Quick Capture', clear:'Clear', save:'Save',
        schedule:'Schedule', meetings:'Meetings', convention:'Convention', home:'Home', library:'Library', notes:'Notes', reader:'Reader', settings:'Settings' },
  es: { quick_actions:'Acciones rápidas', import:'Importar', continue:'Continuar', study_planner:'Plan de estudio',
        today:'Hoy', this_week:'Esta semana', later:'Más tarde', upcoming:'Próximos', enable_alerts:'Activar avisos',
        focus_timer:'Temporizador', stats_streak:'Estadísticas y racha', smart_folders:'Carpetas inteligentes', tags:'Etiquetas',
        masonry:'Destacados', quick_capture:'Captura rápida', clear:'Borrar', save:'Guardar',
        schedule:'Agenda', meetings:'Reuniones', convention:'Asamblea', home:'Inicio', library:'Biblioteca', notes:'Notas', reader:'Lector', settings:'Ajustes' }
};
function i18nApply(lang='en', root=document){
  root.querySelectorAll('[data-i18n]').forEach(el=>{
    const key = el.getAttribute('data-i18n');
    const txt = I18N[lang]?.[key] ?? I18N.en[key] ?? '';
    if (txt) el.textContent = txt;
  });
  const badge = document.getElementById('current-language');
  if (badge) badge.textContent = lang.toUpperCase();
}

class App {
  constructor() {
    this.langKey  = 'app_lang';
    this.themeKey = 'app_theme';
    this.currentLanguage = localStorage.getItem(this.langKey) || 'en';

    // open imported doc immediately
    window.onDocumentImported = async (doc) => {
      try { await window.dashboard?.refresh?.(); } catch {}
      if (doc?.id) location.href = `reader.html?doc=${encodeURIComponent(doc.id)}`;
    };

    // polyfill getAllAnnotations if missing
    if (!storage.getAllAnnotations) {
      storage.getAllAnnotations = async () => {
        try {
          await storage.init?.();
          const docs = await (storage.getDocuments?.() || []);
          const out = [];
          for (const d of (docs||[])) {
            const anns = await (storage.getAnnotations?.(d.id) || []);
            (anns||[]).forEach(a => out.push({
              ...a,
              documentId: a.documentId || d.id,
              docTitle: d.title || '',
              title: d.title || ''
            }));
          }
          return out;
        } catch { return []; }
      };
    }
  }

  async init() {
    try { await storage.init?.(); } catch {}

    // Theme
    this._initThemeToggle();

    // i18n
    i18nApply(this.currentLanguage);
    this._initLanguageButtons();

    // App lock (optional)
    try {
      if (FLAGS?.lock) await lock.init({ enabled:true, idleMinutes: 15 });
      else await lock.init({ idleMinutes: 15 });
    } catch {}

    // Reminders
    try {
      await reminders.init(storage);
      navigator.serviceWorker?.addEventListener('message', (evt)=>{
        if (evt.data?.type === 'REMINDERS_REFRESH') reminders.refresh(storage);
      });
    } catch {}

    window.addEventListener('schedule:updated', () => {
      try { reminders.refresh(storage); } catch {}
      this.renderUpcoming().catch(()=>{});
    });
    window.addEventListener('convention:updated', () => {
      try { reminders.refresh(storage); } catch {}
      this.renderUpcoming().catch(()=>{});
    });

    // Slash menu (if meetings editor exists on page)
    try {
      const meetingEditor = document.getElementById('meeting-content');
      if (meetingEditor) bindSlashMenu(meetingEditor);
    } catch {}

    // Wire UI
    this._wireHomeButtons();
    this._wirePlanner();
    await this.renderPlanner();

    // Auth (no console noise on 401)
    await this._initAuth();

    // Dynamic sections
    try { await this.loadHomeLists(); } catch {}
    await Promise.all([
      this.renderUpcoming().catch(()=>{}),
      this.renderMasonry().catch(()=>{}),
      this.renderStats().catch(()=>{}),
      this.renderRandomHighlight().catch(()=>{})
    ]);
  }

  /* THEME */
  _initThemeToggle() {
    const saved = localStorage.getItem(this.themeKey) || 'light';
    const setTheme = (mode) => {
      document.documentElement.setAttribute('data-bs-theme', mode);
      try { localStorage.setItem(this.themeKey, mode); } catch {}
      const icon = document.querySelector('#theme-toggle i');
      if (icon) {
        icon.classList.remove('fa-moon','fa-sun');
        icon.classList.add(mode === 'light' ? 'fa-moon' : 'fa-sun');
      }
    };
    setTheme(saved);
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      const curr = document.documentElement.getAttribute('data-bs-theme') || 'light';
      setTheme(curr === 'light' ? 'dark' : 'light');
    });
  }

  /* LANGUAGE */
  _initLanguageButtons() {
    const set = (lang) => {
      this.currentLanguage = (lang === 'es') ? 'es' : 'en';
      try { localStorage.setItem(this.langKey, this.currentLanguage); } catch {}
      i18nApply(this.currentLanguage);
    };
    document.getElementById('lang-en')?.addEventListener('click', () => set('en'));
    document.getElementById('lang-es')?.addEventListener('click', () => set('es'));
  }

  /* NAV */
  openDoc(id){ if (id) location.href = `reader.html?doc=${encodeURIComponent(id)}`; }

  async importMenu() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.epub,.pdf,.docx,.txt,.md'; input.multiple = false;
    input.onchange = async () => {
      const f = input.files?.[0]; if (!f) return;
      try { const doc = await storage.importFile(f); window.onDocumentImported?.(doc); }
      catch { this.toast('Import failed', 'danger'); }
    };
    input.click();
  }

  /* QUICK CAPTURE */
  async saveQuickNote() {
    const ta = document.getElementById('qc-text');
    const text = (ta?.value || '').trim();
    if (!text) return this.toast('Nothing to save', 'secondary');

    const all = await (storage.getActiveDocuments?.() || storage.getDocuments?.() || []);
    const visible = (all || []).filter(d => !d.deletedAt);
    let doc = visible.sort((a,b)=> (new Date(b.updatedAt||b.createdAt||0) - new Date(a.updatedAt||a.createdAt||0)))[0];

    if (!doc) {
      doc = { id: storage.generateId ? storage.generateId('doc') : `doc_${Date.now()}`, title: 'Scratchpad', type: 'txt',
              createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await storage.saveDocument(doc);
    }

    const list = await storage.getAnnotations(doc.id) || [];
    list.push({ id: storage.generateId ? storage.generateId('ann') : `ann_${Date.now()}`, documentId: doc.id, kind: 'note',
                text, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await storage.saveAnnotations(doc.id, list);
    ta.value = '';
    this.toast('Saved to notes', 'success');
  }

  /* UPCOMING */
  async renderUpcoming() {
    const box = document.getElementById('upcoming-list') || document.getElementById('home-upcoming');
    if (!box) return;

    const rows = [];
    try {
      const items = await reminders.listUpcoming(5);
      if (items?.length) items.forEach(r => rows.push({ label: r.title, when: new Date(r.whenISO) }));
    } catch {}

    try {
      if (!rows.length) {
        const withinDays = 14;
        const mid = await storage.getSchedule?.('midweek')  || [];
        const wkd = await storage.getSchedule?.('weekend')  || [];
        const wk  = [...mid.map(x=>({...x, label:'Midweek'})), ...wkd.map(x=>({...x, label:'Weekend'}))];
        const now = new Date();
        const nextOf = (dayIdx, timeHHmm, label) => {
          const [hh, mm] = (timeHHmm||'00:00').split(':').map(n=>parseInt(n,10)||0);
          const d = new Date(now);
          const diff = (dayIdx - d.getDay() + 7) % 7;
          d.setDate(d.getDate() + (diff || (d.getHours()*60 + d.getMinutes() >= hh*60+mm ? 7 : 0)));
          d.setHours(hh, mm, 0, 0);
          return { label, when: d };
        };
        wk.forEach(s => rows.push(nextOf(Number(s.day||0), s.time||'00:00', s.label)));

        const conv = await storage.getConvention?.() || { sessions: [] };
        (conv.sessions||[]).forEach(s => {
          if (!s?.date) return;
          const when = new Date(`${s.date}T${s.time||'00:00'}:00`);
          if (!isNaN(+when) && (+when - Date.now()) <= (withinDays*86400000)) {
            rows.push({ label: s.title || s.theme || 'Convention Session', when });
          }
        });

        rows.sort((a,b)=> +a.when - +b.when);
        rows.splice(5);
      }
    } catch {}

    box.innerHTML = rows.length
      ? rows.map(r => `
        <div class="d-flex align-items-center justify-content-between border rounded p-2 mb-1">
          <div><i class="fa-regular fa-bell me-2"></i>${r.label}</div>
          <div class="text-muted">${r.when.toLocaleString()}</div>
        </div>`).join('')
      : `<div class="text-muted">No upcoming items.</div>`;
  }

  /* MASONRY */
  async renderMasonry(){
    const host = document.getElementById('masonry');
    if (!host) return;
    try {
      const items = await storage.getRecentHighlights?.(24) || [];
      if (!items.length) { host.innerHTML = `<div class="text-muted">No highlights yet.</div>`; return; }
      const esc = s => (s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
      host.innerHTML = items.map(h => `
        <article class="h-card">
          <div class="h-body">
            <div class="h-quote">“${esc(h.text)}”</div>
            ${h.docTitle ? `<div class="h-doc mt-1">${esc(h.docTitle)}</div>` : ''}
          </div>
        </article>
      `).join('');
    } catch {
      host.innerHTML = `<div class="text-danger">Failed to load highlights.</div>`;
    }
  }

  /* STATS */
  async renderStats(){
    const box = document.getElementById('stats-box');
    if (!box) return;
    try {
      const [docs, anns, tasks] = await Promise.all([
        storage.getDocuments?.() || [],
        storage.getAllAnnotations?.() || [],
        storage.getPlannerTasks?.() || []
      ]);
      const cut = Date.now() - 14*86400000;
      const days = new Set();
      anns.forEach(a => { const t=+new Date(a.updatedAt||a.createdAt||0); if (t>cut) days.add(new Date(t).toDateString()); });
      tasks.forEach(t => { const u=+new Date(t.createdAt||0); if (u>cut) days.add(new Date(u).toDateString()); });
      const streak = days.size;
      box.innerHTML = `
        <div class="d-flex flex-wrap gap-3">
          <div><i class="fa-solid fa-book me-1"></i><strong>${docs.length}</strong> docs</div>
          <div><i class="fa-solid fa-highlighter me-1"></i><strong>${anns.length}</strong> highlights</div>
          <div><i class="fa-solid fa-fire me-1"></i><strong>${streak}</strong> day streak</div>
        </div>`;
    } catch {
      box.innerHTML = `<div class="text-danger">Failed to load stats.</div>`;
    }
  }

  /* RANDOM HIGHLIGHT */
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

  /* HOME LISTS (Continue) */
  async loadHomeLists() {
    const all = await (storage.getActiveDocuments?.() || storage.getDocuments?.() || []);
    const active = (all || []).filter(d=>!d.deletedAt);
    const recent = [...active].sort((a,b)=>(new Date(b.lastOpened||b.updatedAt||b.createdAt||0))-(new Date(a.lastOpened||a.updatedAt||a.createdAt||0)));
    document.getElementById('qa-continue')?.addEventListener('click', ()=>{
      const cont = recent[0];
      if (cont?.id) this.openDoc(cont.id);
      else this.toast('Nothing to continue yet', 'secondary');
    });
  }

  /* AUTH + SYNC */
  async _initAuth(){
    const $ = s=>document.querySelector(s);
    const lbl = $('#auth-label');
    const boxOut = $('#auth-box-logged-out');
    const boxIn  = $('#auth-box-logged-in');
    const emailLabel = $('#auth-email-label');

    function setAuthUI(user){
      if (user) {
        if (lbl) lbl.textContent = user.name || user.email || 'Account';
        if (emailLabel) emailLabel.textContent = user.email || '';
        boxOut?.classList.add('d-none'); boxIn?.classList.remove('d-none');
      } else {
        if (lbl) lbl.textContent = 'Sign in';
        boxIn?.classList.add('d-none'); boxOut?.classList.remove('d-none');
      }
    }

    let me = null;
    try { me = await sync.me(); } catch { me = null; } // 401/404 => null silently
    setAuthUI(me);

    $('#btn-login')?.addEventListener('click', async ()=>{
      const email = $('#auth-email')?.value?.trim();
      const pass  = $('#auth-pass')?.value||'';
      try {
        const u = await sync.login({ email, password: pass });
        setAuthUI(u);
        await this._doFullSync();
        this.toast('Signed in','success');
      } catch {
        this.toast('Login failed','danger');
      }
    });

    $('#btn-register')?.addEventListener('click', async ()=>{
      const email = $('#auth-email')?.value?.trim();
      const pass  = $('#auth-pass')?.value||'';
      const name  = email?.split('@')[0]||'';
      try {
        const u = await sync.register({ email, password: pass, name });
        setAuthUI(u);
        await this._doFullSync();
        this.toast('Welcome!','success');
      } catch {
        this.toast('Register failed','danger');
      }
    });

    $('#btn-logout')?.addEventListener('click', ()=>{
      sync.logout();
      setAuthUI(null);
      this.toast('Signed out','secondary');
    });

    $('#btn-sync-now')?.addEventListener('click', async ()=>{
      try { await this._doFullSync(); this.toast('Synced','success'); }
      catch { this.toast('Sync failed','danger'); }
    });

    if (sync.isAuthed()) { try { await this._doFullSync(); } catch {} }
  }

  async _doFullSync(){
    // push docs
    const docs = await (storage.getDocuments?.() || []);
    for (const d of docs) {
      await sync.upsertDoc({
        id:d.id, title:d.title, type:d.type,
        meta:d.meta||null, lastOpened:d.lastOpened||null, updatedAt:d.updatedAt||d.createdAt
      });
    }
    // merge docs (pull)
    const remoteDocs = await sync.pullDocs();
    for (const rd of (remoteDocs||[])) {
      const exists = docs.find(x=>x.id===rd.id);
      if (!exists) {
        await storage.saveDocument?.({
          id: rd.id, title: rd.title, type: rd.type, meta: rd.meta,
          createdAt: rd.updatedAt || new Date().toISOString(),
          updatedAt: rd.updatedAt || new Date().toISOString()
        });
      }
    }

    // push annotations
    for (const d of docs) {
      const anns = await (storage.getAnnotations?.(d.id) || []);
      for (const a of anns) {
        await sync.upsertAnn({
          id:a.id, docId:a.documentId, kind:a.kind,
          quote:a.quote||a.text||'', note:a.note||a.text||'', tags:a.tags||[], cfi:a.cfi||null,
          createdAt:a.createdAt, updatedAt:a.updatedAt
        });
      }
    }

    // merge annotations (pull)
    const remoteAnns = await sync.pullAnnotations();
    const byDoc = new Map();
    (remoteAnns||[]).forEach(a => {
      if (!byDoc.has(a.docId)) byDoc.set(a.docId, []);
      byDoc.get(a.docId).push(a);
    });
    for (const [docId, list] of byDoc) {
      const localList = await (storage.getAnnotations?.(docId) || []);
      for (const ra of list) {
        if (!localList.find(x=>x.id===ra.id)) {
          localList.push({
            id: ra.id, documentId: ra.docId, kind: ra.kind,
            quote: ra.quote, note: ra.note, tags: ra.tags, cfi: ra.cfi,
            createdAt: ra.createdAt, updatedAt: ra.updatedAt
          });
        }
      }
      await storage.saveAnnotations?.(docId, localList);
    }
  }

  /* TOAST */
  toast(message, type='primary') {
    const el = document.getElementById('app-toast');
    const body = document.getElementById('app-toast-body');
    if (!el || !body || !window.bootstrap) { alert(message); return; }
    body.textContent = message;
    el.className = `toast align-items-center text-bg-${type} border-0 shadow`;
    new bootstrap.Toast(el, { autohide: true, delay: 1800 }).show();
  }

  /* WIRING */
  _wireHomeButtons() {
    // Import
    document.getElementById('qa-import')?.addEventListener('click', () => this.importMenu());

    // Quick Capture
    document.getElementById('qc-save')?.addEventListener('click', () => this.saveQuickNote());
    document.getElementById('qc-clear')?.addEventListener('click', () => {
      const t = document.getElementById('qc-text'); if (t) t.value='';
    });

    // Alerts
    document.getElementById('btn-enable-notifs')?.addEventListener('click', async ()=>{
      if (!('Notification' in window)) { this.toast('Notifications not supported', 'secondary'); return; }
      let perm = Notification.permission;
      if (perm !== 'granted') { try { perm = await Notification.requestPermission(); } catch {} }
      this.toast(perm === 'granted' ? 'Alerts enabled' : 'Alerts blocked', perm === 'granted' ? 'success' : 'secondary');
    });
  }

  _wirePlanner() {
    // Save task (fix focus warning before hide)
    document.getElementById('planner-save')?.addEventListener('click', async ()=>{
      const title = (document.getElementById('task-title')?.value || '').trim();
      const lane  = document.getElementById('task-when')?.value || 'today';
      if (!title) return;
      const tasks = await (storage.getPlannerTasks?.() || []);
      tasks.push({
        id: storage.generateId ? storage.generateId('task') : `task_${Date.now()}`,
        title, lane, done: false, createdAt: new Date().toISOString()
      });
      await storage.savePlannerTasks(tasks);
      document.getElementById('task-title').value = '';
      try { document.activeElement?.blur?.(); bootstrap.Modal.getOrCreateInstance(document.getElementById('plannerModal'))?.hide(); } catch {}
      await this.renderPlanner();
    });

    // Filters
    document.getElementById('planner-filter-today')?.addEventListener('click', ()=> this.renderPlanner('today'));
    document.getElementById('planner-filter-week') ?.addEventListener('click', ()=> this.renderPlanner('week'));
    document.getElementById('planner-filter-all')  ?.addEventListener('click', ()=> this.renderPlanner('all'));

    // Toggle / delete (delegate)
    const board = document.getElementById('planner-kanban');
    board?.addEventListener('click', async (e)=>{
      const btn = e.target.closest('[data-action]'); if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const tasks = await (storage.getPlannerTasks?.() || []);
      const idx = tasks.findIndex(t=>t.id===id); if (idx<0) return;
      if (action === 'toggle') tasks[idx].done = !tasks[idx].done;
      if (action === 'delete') tasks.splice(idx,1);
      await storage.savePlannerTasks(tasks);
      await this.renderPlanner();
    });
  }

  async renderPlanner(filter='all') {
    const tasks = await (storage.getPlannerTasks?.() || []);
    const byLane = { today:[], week:[], later:[] };
    tasks.forEach(t => {
      const lane = ['today','week','later'].includes(t.lane) ? t.lane : 'today';
      if (filter==='all' || filter===lane) byLane[lane].push(t);
    });

    const paint = (laneId, list) => {
      const host = document.getElementById(`kanban-${laneId}`);
      if (!host) return;
      if (!list.length) { host.innerHTML = `<div class="text-muted small">No tasks</div>`; return; }
      host.innerHTML = list.map(t => `
        <div class="task-card ${t.done?'opacity-75':''}">
          <div class="d-flex align-items-center justify-content-between">
            <div class="task-title ${t.done?'done':''}">${t.title.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</div>
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-secondary" data-action="toggle" data-id="${t.id}" title="Mark done/undone">
                <i class="fa-regular ${t.done?'fa-circle-check':'fa-circle'}"></i>
              </button>
              <button class="btn btn-outline-danger" data-action="delete" data-id="${t.id}" title="Delete">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
      `).join('');
    };

    paint('today', byLane.today);
    paint('week',  byLane.week);
    paint('later', byLane.later);
  }
}

const app = new App();
window.app = app;
app.init();

export { app };
