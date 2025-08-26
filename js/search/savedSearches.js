// Lightweight persisted "smart folders" for the Notes page & sidebars.
// Storage: IndexedDB via localforage (already loaded on all pages).
// Schema is additive/back-compatible with your bundle export (see README snippet below).

const KEY = 'saved_searches_v1';

async function _getAll() {
  try {
    const v = await localforage.getItem(KEY);
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
async function _setAll(list) { return localforage.setItem(KEY, list || []); }

export async function list() {
  return _getAll();
}

export async function create({ title, query, filters={}, sort='newest' }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const s = await _getAll();
  s.push({ id, title, query, filters, sort, createdAt: now, updatedAt: now });
  await _setAll(s);
  return id;
}

export async function updateTitle(id, title) {
  const s = await _getAll();
  const i = s.findIndex(x => x.id === id);
  if (i === -1) return false;
  s[i].title = title;
  s[i].updatedAt = new Date().toISOString();
  await _setAll(s);
  return true;
}

export async function updateItem(id, patch) {
  const s = await _getAll();
  const i = s.findIndex(x => x.id === id);
  if (i === -1) return false;
  s[i] = { ...s[i], ...patch, updatedAt: new Date().toISOString() };
  await _setAll(s);
  return true;
}

export async function remove(id) {
  const s = await _getAll();
  const n = s.filter(x => x.id !== id);
  await _setAll(n);
  return s.length !== n.length;
}

export async function reorder(ids) {
  // ids = array of saved search ids in new order
  const s = await _getAll();
  const map = new Map(s.map(x => [x.id, x]));
  const next = ids.map(id => map.get(id)).filter(Boolean);
  // append any missing (defensive)
  s.forEach(x => { if (!map.has(x.id) || next.find(y => y.id === x.id)) return; next.push(x); });
  await _setAll(next);
  return true;
}

// Helper: persist the "current" notes search UI state.
// Pass in the same shape your notes page uses.
export async function saveFromCurrent({ title, query, filters, sort }) {
  return create({ title, query, filters, sort });
}
