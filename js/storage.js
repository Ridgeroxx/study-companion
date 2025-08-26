// /js/storage.js
// Lightweight localforage-backed storage layer (ES module)

if (!window.localforage) {
  console.error('localforage missing — include it before storage.js');
}

const LF = window.localforage?.createInstance({ name: 'study-companion' });

const KEYS = {
  DOCS: 'docs',
  FAVS: 'favorites',
  SETTINGS: 'settings',
  PAGES: 'pages',
  SEARCH: 'search-index',
  MEETING_NOTES: 'meeting-notes',
  SCHEDULE_MIDWEEK: 'schedule:midweek',
  SCHEDULE_WEEKEND: 'schedule:weekend',
  BOOKMARKS: (docId) => `bm:${docId}`,
  ANN:  (docId) => `ann:${docId}`,
  FILE: (key)   => `file:${key}`,
};

const nowISO = () => new Date().toISOString();
function generateId(prefix='item'){
  const r = crypto.randomUUID?.() || Math.random().toString(36).slice(2,10);
  return `${prefix}_${r}`;
}

// /js/storage.js (inside init)
const SCHEMA_VERSION_KEY = 'schema_version';
const v = (await localforage.getItem(SCHEMA_VERSION_KEY)) || 1;
if (v < 2) {
  await migrateToV2();
  await localforage.setItem(SCHEMA_VERSION_KEY, 2);
}

async function migrateToV2() {
  // add containers if missing
  const def = { savedSearches: [], templates: [], security: {}, sync:{}, ocr:{pages:[]}, links:{wikilinks:[], backlinksIndex:{}} };
  const s = (await getSettings()) || {};
  s.new = { ...(s.new||{}), ...def };
  await saveSettings(s); // your existing setter
}

async function _get(k, fb){ try{ const v = await LF.getItem(k); return v ?? fb; }catch{return fb} }
async function _set(k, v){ return LF.setItem(k, v) }
async function _rm(k){ try{ await LF.removeItem(k) }catch{} }

/* ---------------- Documents ---------------- */
async function getDocuments(){ return await _get(KEYS.DOCS, []) }
async function getActiveDocuments(){ return (await getDocuments()).filter(d=>!d.deletedAt) }
async function getDocument(id){ return (await getDocuments()).find(d=>d.id===id) || null }
async function saveDocument(doc){
  const list = await getDocuments();
  const idx = list.findIndex(d=>d.id===doc.id);
  const next = { ...doc, createdAt:doc.createdAt || nowISO(), updatedAt: nowISO() };
  if (idx>=0) list[idx] = next; else list.push(next);
  await _set(KEYS.DOCS, list);
  return next;
}
async function softDeleteDocument(id){
  const list = await getDocuments(); const i=list.findIndex(d=>d.id===id);
  if (i>=0){ list[i].deletedAt=nowISO(); await _set(KEYS.DOCS, list); }
}
async function hardDeleteDocument(id){
  const list = await getDocuments();
  const doc = list.find(d=>d.id===id);
  await _set(KEYS.DOCS, list.filter(d=>d.id!==id));
  if (doc?.fileKey) await _rm(KEYS.FILE(doc.fileKey));
  await _rm(KEYS.ANN(id)); await _rm(KEYS.BOOKMARKS(id));
}
async function getRecentDocuments(n=12){
  const all = await getActiveDocuments();
  return all.sort((a,b)=>new Date(b.lastOpened||b.updatedAt||0)-new Date(a.lastOpened||a.updatedAt||0)).slice(0,n);
}

/* ---------------- Files ---------------- */
async function saveFile(fileKey, arrayBuffer){ return _set(KEYS.FILE(fileKey), arrayBuffer) }
async function getFile(fileKey){ return _get(KEYS.FILE(fileKey), null) }
async function getDocumentArrayBuffer(docId){
  const doc = await getDocument(docId);
  if (!doc) return null;
  if (doc.fileKey) return await getFile(doc.fileKey);
  return null;
}

/* ---------------- Import file (EPUB/PDF/DOCX/TXT/MD) ---------------- */
function _ext(name){ const m = /\.[^\.]+$/.exec(name||''); return (m? m[0].slice(1) : '').toLowerCase(); }
function _typeFromExt(ext){
  if(ext==='epub')return 'epub';
  if(ext==='pdf')return 'pdf';
  if(ext==='docx')return 'docx';
  if(ext==='md'||ext==='markdown')return 'md';
  return 'txt';
}
async function importFile(file){
  const id = generateId('doc');
  const ext = _ext(file.name);
  const type = _typeFromExt(ext);
  const fileKey = `orig:${id}`;
  const buf = await file.arrayBuffer();
  await LF.setItem(KEYS.FILE(fileKey), buf);
  const doc = await saveDocument({
    id, title: file.name.replace(/\.[^\.]+$/,'') || 'Untitled',
    type, fileKey, createdAt: nowISO(), updatedAt: nowISO()
  });
  try{ await window.activity?.logDocImported?.(doc) }catch{}
  return doc;
}

/* ---------------- Annotations ---------------- */
async function getAnnotations(docId){ return await _get(KEYS.ANN(docId), []) }
async function saveAnnotations(docId, list){ return _set(KEYS.ANN(docId), Array.isArray(list)? list : []) }
async function getAllAnnotations(){
  const docs = await getDocuments(); const out=[];
  for (const d of docs){ const arr = await getAnnotations(d.id); arr.forEach(a=>out.push(a)) }
  return out;
}

/* ---------------- Bookmarks ---------------- */
async function getBookmarks(docId){ return await _get(KEYS.BOOKMARKS(docId), []) }
async function saveBookmarks(docId, list){ return _set(KEYS.BOOKMARKS(docId), Array.isArray(list)?list:[]) }

/* ---------------- Favorites ---------------- */
async function getFavorites(){ return await _get(KEYS.FAVS, []) }
async function toggleFavorite(docId){
  const list = await getFavorites(); const i=list.indexOf(docId);
  if(i>=0) list.splice(i,1); else list.push(docId);
  await _set(KEYS.FAVS, list); return list;
}

/* ---------------- Settings ---------------- */
async function getSettings(){ return await _get(KEYS.SETTINGS, {}) }
async function saveSettings(s){ return _set(KEYS.SETTINGS, s || {}) }

/* ---------------- Pages ---------------- */
async function getPages(){ return await _get(KEYS.PAGES, []) }
async function createPage({ title='Untitled', content='' }={}){
  const pages = await getPages();
  const p = { id: generateId('page'), title, content, createdAt: nowISO(), updatedAt: nowISO() };
  pages.push(p); await _set(KEYS.PAGES, pages); return p;
}
async function updatePage(id, patch){
  const pages = await getPages(); const i = pages.findIndex(p=>p.id===id);
  if(i<0) return; pages[i] = { ...pages[i], ...patch, updatedAt: nowISO() };
  await _set(KEYS.PAGES, pages);
}
async function deletePage(id){ const pages=await getPages(); await _set(KEYS.PAGES, pages.filter(p=>p.id!==id)) }

/* ---------------- Search cache ---------------- */
async function getSearchIndex(){ return await _get(KEYS.SEARCH, null) }
async function saveSearchIndex(v){ return _set(KEYS.SEARCH, v) }
async function clearSearchIndex(){ return _rm(KEYS.SEARCH) }

/* ---------------- Meeting Notes (NEW) ---------------- */
async function getMeetingNotes(){ return await _get(KEYS.MEETING_NOTES, []) }
async function saveMeetingNote(note){
  const list = await getMeetingNotes();
  if (!note.id) note.id = generateId('meet');
  const idx = list.findIndex(n => n.id === note.id);
  const next = { ...note, updatedAt: nowISO(), createdAt: note.createdAt || nowISO() };
  if (idx >= 0) list[idx] = next; else list.push(next);
  await _set(KEYS.MEETING_NOTES, list);
  return next;
}
async function deleteMeetingNote(id){
  const list = await getMeetingNotes();
  await _set(KEYS.MEETING_NOTES, list.filter(n => n.id !== id));
}

/* ---------------- Schedule (NEW, used by schedule.js) ---------------- */
async function getSchedule(kind){ // 'midweek' | 'weekend'
  const key = kind === 'weekend' ? KEYS.SCHEDULE_WEEKEND : KEYS.SCHEDULE_MIDWEEK;
  return await _get(key, []);
}
async function saveSchedule(kind, list){
  const key = kind === 'weekend' ? KEYS.SCHEDULE_WEEKEND : KEYS.SCHEDULE_MIDWEEK;
  return _set(key, Array.isArray(list) ? list : []);
}

/* ---------------- Misc ---------------- */
async function getDocumentBody(docId){
  const ab = await getDocumentArrayBuffer(docId);
  if (ab && ab.byteLength) return new TextDecoder().decode(ab);
  return '';
}
async function setItem(k,v){ return _set(k,v) }
async function getItem(k){ return _get(k,null) }
async function init(){ /* no-op; LF ready */ }

const storage = {
  init, generateId,
  getDocuments, getActiveDocuments, getDocument, saveDocument, softDeleteDocument, hardDeleteDocument, getRecentDocuments,
  saveFile, getFile, getDocumentArrayBuffer, importFile,
  getAnnotations, saveAnnotations, getAllAnnotations,
  getBookmarks, saveBookmarks,
  getFavorites, toggleFavorite,
  getSettings, saveSettings,
  getPages, createPage, updatePage, deletePage,
  getSearchIndex, saveSearchIndex, clearSearchIndex,
  // NEW:
  getMeetingNotes, saveMeetingNote, deleteMeetingNote,
  getSchedule, saveSchedule,
  getDocumentBody,
  setItem, getItem
};

export { storage };

// Expose globally for inline handlers safety (optional)
window.storage = storage;
