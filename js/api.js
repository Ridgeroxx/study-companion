// js/api.js
const BASE = 'http://localhost:3000';

let TOKEN = localStorage.getItem('sc_token') || '';

function setToken(t){
  TOKEN = t || '';
  try { localStorage.setItem('sc_token', TOKEN); } catch {}
}
function authHeaders(){
  return TOKEN ? { 'Authorization': `Bearer ${TOKEN}` } : {};
}
async function jfetch(path, opts={}){
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers||{}),
      ...authHeaders()
    }
  });
  if (!res.ok) {
    const text = await res.text().catch(()=> '');
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

export const api = {
  setToken,
  get token(){ return TOKEN; },

  async register({ email, password, name }){
    const data = await jfetch('/api/register', { method:'POST', body: JSON.stringify({ email, password, name }) });
    if (data?.token) setToken(data.token);
    return data?.user || null;
  },
  async login({ email, password }){
    const data = await jfetch('/api/login', { method:'POST', body: JSON.stringify({ email, password }) });
    if (data?.token) setToken(data.token);
    return data?.user || null;
  },
  async me(){
    return jfetch('/api/me', { method:'GET' });
  },

  // Docs
  async upsertDoc(doc){
    return jfetch('/api/docs', { method:'POST', body: JSON.stringify(doc) });
  },
  async listDocs(){
    return jfetch('/api/docs', { method:'GET' });
  },

  // Annotations
  async upsertAnnotation(a){
    return jfetch('/api/annotations', { method:'POST', body: JSON.stringify(a) });
  },
  async listAnnotations(){
    return jfetch('/api/annotations', { method:'GET' });
  },

  // Recordings
  async uploadRecording({ id, title, blob, mime='audio/webm' }){
    const fd = new FormData();
    fd.append('id', id);
    fd.append('title', title || id);
    fd.append('file', blob, (title||id)+'.webm');
    const res = await fetch(BASE + '/api/recordings', { method:'POST', headers: { ...authHeaders() }, body: fd });
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
  },
  async listRecordings(){
    return jfetch('/api/recordings', { method:'GET' });
  },
  streamRecordingUrl(id){
    const u = new URL(BASE + `/api/recordings/${encodeURIComponent(id)}/stream`);
    if (TOKEN) u.searchParams.set('token', TOKEN);
    return u.toString();
  }
};
