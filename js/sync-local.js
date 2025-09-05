// js/sync-local.js — resilient client for unknown servers
const BASE = window.SC_API_BASE || 'http://localhost:3000';
const TOKEN_KEY = 'sc_token';

function getToken(){ try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
function setToken(t){ try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} }
function authedHeaders(){
  const h = { 'Content-Type':'application/json' };
  const t = getToken(); if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}
function b64(s){ try { return btoa(s); } catch { return ''; } }

const PATHS = {
  me:        ['/api/me','/auth/me','/api/auth/me','/me'],
  login:     ['/api/auth/login','/auth/login','/login','/api/login'],
  register:  ['/api/auth/register','/auth/register','/register','/api/register'],
  docsList:  ['/api/sync/docs','/sync/docs','/api/docs','/docs'],
  docsUp:    ['/api/sync/docs/upsert','/sync/docs/upsert','/api/docs/upsert','/docs/upsert'],
  annList:   ['/api/sync/annotations','/sync/annotations','/api/annotations','/annotations'],
  annUp:     ['/api/sync/annotations/upsert','/sync/annotations/upsert','/api/annotations/upsert','/annotations/upsert']
};

async function fetchTry(method, url, { body, headers }={}){
  return fetch(url, { method, headers, body, credentials: 'omit' });
}

async function tryPaths(method, paths, { body, allow401AsNull=false, extraHeaders=null, basicAuth=null }={}){
  let lastErr = null;
  for (const p of paths) {
    try {
      const res = await fetchTry(method, BASE + p, {
        body: body ? JSON.stringify(body) : undefined,
        headers: extraHeaders || authedHeaders()
      });
      if (res.status === 404) { lastErr = 'notfound'; continue; }
      if (res.status === 401) {
        if (allow401AsNull) return null; // treat as logged out
        if (basicAuth) {
          const h = { 'Content-Type':'application/json', 'Authorization': `Basic ${b64(`${basicAuth.user}:${basicAuth.pass}`)}` };
          const res2 = await fetchTry(method, BASE + p, { body: body ? JSON.stringify(body) : undefined, headers: h });
          if (res2.status === 404) { lastErr = 'notfound'; continue; }
          if (!res2.ok) { lastErr = new Error(`HTTP ${res2.status}`); continue; }
          return await res2.json();
        }
        lastErr = new Error('unauthorized'); continue;
      }
      if (!res.ok) { lastErr = new Error(`HTTP ${res.status}`); continue; }
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  if (allow401AsNull && (lastErr === 'notfound' || lastErr?.message === 'unauthorized')) return null;
  if (lastErr === 'notfound') return null;
  throw lastErr || new Error('No endpoint responded');
}

async function me(){
  const data = await tryPaths('GET', PATHS.me, { allow401AsNull: true });
  return data || null;
}
function isAuthed(){ return !!getToken(); }

async function login({ email, password }){
  const data = await tryPaths('POST', PATHS.login, {
    body: { email, password },
    basicAuth: { user: email, pass: password }
  });
  if (!data) throw new Error('login endpoint not found');
  if (data.token) setToken(data.token);
  return data.user || { email, name: data.name || email.split('@')[0] };
}
async function register({ email, password, name }){
  const data = await tryPaths('POST', PATHS.register, { body: { email, password, name } });
  if (!data) throw new Error('register endpoint not found');
  if (data.token) setToken(data.token);
  return data.user || { email, name };
}
function logout(){ setToken(''); }

async function upsertDoc(doc){
  const data = await tryPaths('POST', PATHS.docsUp, { body: doc });
  return data || {};
}
async function pullDocs(){
  const data = await tryPaths('GET', PATHS.docsList, {});
  return Array.isArray(data) ? data : (data?.items || []);
}
async function upsertAnn(ann){
  const data = await tryPaths('POST', PATHS.annUp, { body: ann });
  return data || {};
}
async function pullAnnotations(){
  const data = await tryPaths('GET', PATHS.annList, {});
  return Array.isArray(data) ? data : (data?.items || []);
}

export const sync = { me, isAuthed, login, register, logout, upsertDoc, pullDocs, upsertAnn, pullAnnotations };
