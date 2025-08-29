import { storage } from './storage.js';

const $ = s => document.querySelector(s);
const toast = (msg, type='primary')=>{
  const el = $('#app-toast'), body = $('#app-toast-body');
  body.textContent = msg; el.className = `toast align-items-center text-bg-${type} border-0 shadow`;
  new bootstrap.Toast(el, {autohide:true, delay:1600}).show();
};

(async function init(){
  try { await storage.init?.(); } catch {}
  const id = new URLSearchParams(location.search).get('doc');

  if (id){
    const doc = await storage.getDocument?.(id);
    $('#ed-title').value = doc?.title || '';
    $('#ed-body').value  = doc?.content || '';
  }

  const render = ()=>{
    const src = $('#ed-body').value || '';
    $('#ed-preview').innerHTML = window.marked ? window.marked.parse(src) : src;
  };
  $('#ed-body').addEventListener('input', render);
  render();

  $('#ed-save').addEventListener('click', async ()=>{
    const title = ($('#ed-title').value || '').trim() || 'Untitled';
    const body  = $('#ed-body').value || '';
    let doc = id ? await storage.getDocument?.(id) : null;
    if (!doc){
      doc = { id: storage.generateId?.('doc') || `doc_${Date.now()}`, type:'txt', title, content: body, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    } else {
      doc.title = title; doc.content = body; doc.updatedAt = new Date().toISOString();
    }
    await storage.saveDocument?.(doc);
    toast('Saved','success');
    if (!id) history.replaceState(null, '', `?doc=${encodeURIComponent(doc.id)}`);
  });
})();
