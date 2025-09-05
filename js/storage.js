// js/storage.js — single source of truth (ES module)

// Ensure localforage loaded
if (!window.localforage) {
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js';
  await new Promise((res, rej) => { s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
const LF = window.localforage.createInstance({ name: 'study-companion' });

// utils
const nowISO = () => new Date().toISOString();
function generateId(prefix='item'){
  const r = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2,10));
  return `${prefix}_${r}`;
}
async function _get(k, fb){ try { const v = await LF.getItem(k); return v ?? fb; } catch { return fb; } }
async function _set(k, v){ return LF.setItem(k, v); }
async function _rm(k){ try { await LF.removeItem(k); } catch {} }

// keys
const KEYS = {
  DOCS: 'docs',
  FAVS: 'favorites',
  SETTINGS: 'settings',
  MEETING_NOTES: 'meeting-notes',
  PLANNER: 'plannerTasks',
  SCHEDULE: (kind) => `schedule_${kind}_v1`, // midweek|weekend
  CONVENTION: 'convention_v1',
  BOOKMARKS: (docId) => `bm:${docId}`,
  ANN:       (docId) => `ann:${docId}`,
  FILE:      (key)   => `file:${key}`,
  REC_INDEX: 'recordings:index',
  REC_BLOB:  (id) => `rec:${id}`,
};

// optional schema migrations
const SCHEMA_VERSION_KEY = 'schema_version';
(async ()=>{
  const v = await _get(SCHEMA_VERSION_KEY, 1);
  if (v < 2) {
    const s = await _get(KEYS.SETTINGS, {});
    s.new = {
      ...(s.new||{}),
      savedSearches: s.new?.savedSearches || [],
      templates: s.new?.templates || [],
      security: s.new?.security || {},
      sync: s.new?.sync || {},
      ocr: s.new?.ocr || { pages: [] },
      links: s.new?.links || { wikilinks: [], backlinksIndex: {} }
    };
    await _set(KEYS.SETTINGS, s);
    await _set(SCHEMA_VERSION_KEY, 2);
  }
})();

/* -------- Documents -------- */
async function getDocuments(){ return await _get(KEYS.DOCS, []); }
async function getActiveDocuments(){ return (await getDocuments()).filter(d=>!d.deletedAt); }
async function getDocument(id){ return (await getDocuments()).find(d=>d.id===id) || null; }
async function saveDocument(doc){
  const list = await getDocuments();
  const idx = list.findIndex(d=>d.id===doc.id);
  const next = { ...doc, createdAt: doc.createdAt || nowISO(), updatedAt: nowISO() };
  if (idx>=0) list[idx] = next; else list.push(next);
  await _set(KEYS.DOCS, list);
  return next;
}
async function softDeleteDocument(id){
  const list = await getDocuments();
  const i = list.findIndex(d=>d.id===id);
  if (i>=0){ list[i].deletedAt = nowISO(); await _set(KEYS.DOCS, list); }
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
  return all.sort((a,b)=> new Date(b.lastOpened||b.updatedAt||0) - new Date(a.lastOpened||a.updatedAt||0)).slice(0,n);
}

/* -------- Files -------- */
async function saveFile(fileKey, arrayBuffer){ return _set(KEYS.FILE(fileKey), arrayBuffer); }
async function getFile(fileKey){ return _get(KEYS.FILE(fileKey), null); }
async function getDocumentArrayBuffer(docId){
  const doc = await getDocument(docId);
  if (!doc) return null;
  if (doc.fileKey) return await getFile(doc.fileKey);
  return null;
}

/* -------- Import file -------- */
function _ext(name){ const m=/\.[^\.]+$/.exec(name||''); return (m? m[0].slice(1) : '').toLowerCase(); }
function _typeFromExt(ext){
  if (ext==='epub') return 'epub';
  if (ext==='pdf')  return 'pdf';
  if (ext==='docx') return 'docx';
  if (ext==='md'||ext==='markdown') return 'md';
  return 'txt';
}
async function importFile(file){
  const id = generateId('doc');
  const ext = _ext(file.name);
  const type = _typeFromExt(ext);
  const fileKey = `orig:${id}`;
  const buf = await file.arrayBuffer();
  await _set(KEYS.FILE(fileKey), buf);
  return await saveDocument({
    id, title: file.name.replace(/\.[^\.]+$/,'') || 'Untitled',
    type, fileKey, createdAt: nowISO(), updatedAt: nowISO()
  });
}

/* -------- Annotations -------- */
async function getAnnotations(docId){ return await _get(KEYS.ANN(docId), []); }
async function saveAnnotations(docId, list){ return _set(KEYS.ANN(docId), Array.isArray(list)? list : []); }
async function getAllAnnotations(){
  const docs = await getDocuments();
  const out = [];
  for (const d of docs){
    const arr = await getAnnotations(d.id);
    (arr||[]).forEach(a => out.push({ ...a, documentId: d.id, docTitle: d.title || '' }));
  }
  return out;
}
function _tagsFromText(text=''){
  const re = /(^|\s)#([a-z0-9_][a-z0-9_\-]*)/ig;
  const out = new Set(); let m;
  while ((m = re.exec(text))) out.add(m[2].toLowerCase());
  return [...out];
}
async function getRecentTags(limit=30){
  const anns = await getAllAnnotations();
  const freq = {};
  (anns||[]).forEach(a=>{
    let tags = a.tags || _tagsFromText(a.text || a.quote || a.note || '');
    tags.forEach(t => { freq[t]=(freq[t]||0)+1; });
  });
  const arr = Object.entries(freq).map(([name,count])=>({name,count}))
               .sort((a,b)=>b.count-a.count);
  return (limit>0)? arr.slice(0,limit) : arr;
}
async function getRecentHighlights(limit=30){
  const anns = await getAllAnnotations();
  const items = (anns||[])
    .map(a => ({ text: a.text || a.quote || a.note || '', docTitle: a.docTitle || '' }))
    .filter(h => h.text && h.text.trim());
  return (limit>0)? items.slice(0,limit) : items;
}

/* -------- Bookmarks -------- */
async function getBookmarks(docId){ return await _get(KEYS.BOOKMARKS(docId), []); }
async function saveBookmarks(docId, list){ return _set(KEYS.BOOKMARKS(docId), Array.isArray(list)?list:[]); }

/* -------- Favorites -------- */
async function getFavorites(){ return await _get(KEYS.FAVS, []); }
async function toggleFavorite(docId){
  const list = await getFavorites();
  const i = list.indexOf(docId);
  if (i>=0) list.splice(i,1); else list.push(docId);
  await _set(KEYS.FAVS, list);
  return list;
}

/* -------- Settings & Smart folders -------- */
async function getSettings(){ return await _get(KEYS.SETTINGS, {}); }
async function saveSettings(s){ return _set(KEYS.SETTINGS, s || {}); }
async function getSmartFolders(){
  const s = await getSettings();
  const sfs = s.smartFolders || s.new?.savedSearches || [];
  return (sfs || []).map(x => ({ id: x.id || x.title || generateId('sf'), title: x.title || x.name || 'Smart Folder' }));
}

/* -------- Planner -------- */
async function getPlannerTasks(){ return await _get(KEYS.PLANNER, []); }
async function savePlannerTasks(tasks){ return _set(KEYS.PLANNER, Array.isArray(tasks)?tasks:[]); }

/* -------- Meeting notes -------- */
async function getMeetingNotes(){ return await _get(KEYS.MEETING_NOTES, []); }
async function saveMeetingNote(note){
  const list = await getMeetingNotes();
  const i = list.findIndex(n=>n.id===note.id);
  const now = nowISO();
  if (i>=0) list[i] = { ...list[i], ...note, updatedAt: now };
  else list.push({ ...note, createdAt: note.createdAt || now, updatedAt: now });
  await _set(KEYS.MEETING_NOTES, list);
  return note;
}
async function deleteMeetingNote(id){
  const list = await getMeetingNotes();
  await _set(KEYS.MEETING_NOTES, list.filter(n=>n.id!==id));
}

/* -------- Schedules (weekly) -------- */
async function getSchedule(kind){ return await _get(KEYS.SCHEDULE(kind), []); }
async function saveSchedule(kind, list){ return _set(KEYS.SCHEDULE(kind), Array.isArray(list)?list:[]); }

/* -------- Convention -------- */
async function getConvention(){ return await _get(KEYS.CONVENTION, { sessions: [] }); }
async function setConvention(conv){ await _set(KEYS.CONVENTION, conv || { sessions: [] }); return conv; }

/* -------- Audio recordings (local only) -------- */
async function saveRecording({ title, blob }){
  const id = generateId('rec');
  const rec = { id, title: title||'Recording', createdAt: nowISO(), mime: blob?.type || 'audio/webm' };
  const index = await _get(KEYS.REC_INDEX, []);
  index.unshift(rec);
  await _set(KEYS.REC_INDEX, index);
  await _set(KEYS.REC_BLOB(id), blob);
  return rec;
}
async function getRecordings(){ return await _get(KEYS.REC_INDEX, []); }
async function getRecordingUrl(id){
  const blob = await _get(KEYS.REC_BLOB(id), null);
  return blob ? URL.createObjectURL(blob) : '';
}
async function deleteRecording(id){
  const all = await _get(KEYS.REC_INDEX, []);
  await _set(KEYS.REC_INDEX, all.filter(r=>r.id!==id));
  await _rm(KEYS.REC_BLOB(id));
}

/* -------- Misc -------- */
async function getDocumentBody(docId){
  const ab = await getDocumentArrayBuffer(docId);
  if (ab && ab.byteLength) return new TextDecoder().decode(ab);
  return '';
}
async function init(){ /* no-op */ }

/* -------- Export -------- */
const storage = {
  // base
  init, generateId,
  // docs
  getDocuments, getActiveDocuments, getDocument, saveDocument, softDeleteDocument, hardDeleteDocument, getRecentDocuments,
  // files
  saveFile, getFile, getDocumentArrayBuffer, importFile,
  // annotations
  getAnnotations, saveAnnotations, getAllAnnotations, getRecentTags, getRecentHighlights,
  // bookmarks
  getBookmarks, saveBookmarks,
  // favorites
  getFavorites, toggleFavorite,
  // settings + smart folders
  getSettings, saveSettings, getSmartFolders,
  // planner
  getPlannerTasks, savePlannerTasks,
  // meeting notes
  getMeetingNotes, saveMeetingNote, deleteMeetingNote,
  // schedules / convention
  getSchedule, saveSchedule, getConvention, setConvention,
  // recordings
  saveRecording, getRecordings, getRecordingUrl, deleteRecording,
  // misc
  getDocumentBody
};

export { storage };
