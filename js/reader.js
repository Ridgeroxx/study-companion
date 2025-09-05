// /js/reader.js — Reader engine (no extra toolbar injected)
import { storage } from './storage.js';

function resolveContainer(cRef) {
  if (!cRef) return document.getElementById('reader-container') || document.querySelector('[data-reader-root]');
  if (typeof cRef === 'string') return document.querySelector(cRef);
  return cRef;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}

async function ensureEPUBDeps() {
  if (!window.JSZip) await loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
  if (!window.ePub)  await loadScript('https://cdn.jsdelivr.net/npm/epubjs@0.3.92/dist/epub.min.js');
}

function ensurePdfWorker() {
  try {
    if (window.pdfjsLib && (!window.pdfjsLib.GlobalWorkerOptions?.workerSrc)) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  } catch {}
}

async function decodeBase64ToArrayBuffer(b64) {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  } catch { return null; }
}

async function getDocSource(doc) {
  if (typeof storage?.getDocumentArrayBuffer === 'function') {
    try {
      const ab = await storage.getDocumentArrayBuffer(doc.id);
      if (ab && ab.byteLength > 0) return { arrayBuffer: ab };
    } catch {}
  }
  if (window.localforage && doc.fileKey) {
    const keysToTry = [doc.fileKey, `file:${doc.fileKey}`, `doc:${doc.fileKey}`];
    for (const k of keysToTry) {
      try {
        const item = await localforage.getItem(k);
        if (item) {
          if (item instanceof Blob) return { arrayBuffer: await item.arrayBuffer() };
          if (item.byteLength > 0) return { arrayBuffer: item };
        }
      } catch {}
    }
  }
  if (doc.arrayBufferBase64) {
    const ab = await decodeBase64ToArrayBuffer(doc.arrayBufferBase64);
    if (ab && ab.byteLength > 0) return { arrayBuffer: ab };
  }
  if (doc.blobUrl) return { url: doc.blobUrl };
  if (doc.url)     return { url: doc.url };

  try {
    const body = await storage.getDocumentBody?.(doc.id);
    if (body != null) return { arrayBuffer: new TextEncoder().encode(body).buffer };
  } catch {}
  return {};
}

class Reader {
  constructor() {
    this.currentDocument = null;
    this.container = null;

    this._pdf = null;
    this._pdfPages = [];
    this._io = null;

    this._book = null;
    this._rendition = null;

    this._fontScale = 1;
  }

  async init(){}

  getCurrentDocument(){ return this.currentDocument; }

  async openDocument(docId, containerRef) {
    const container = resolveContainer(containerRef);
    if (!container) throw new Error('Reader container not found');
    this.container = container;

    const doc = await storage.getDocument?.(docId);
    if (!doc) throw new Error('Document not found');
    this.currentDocument = doc;

    // Only create the stage; DO NOT add another toolbar/wrap
    container.innerHTML = `<div id="stage" class="p-2"></div>`;
    const stage = container.querySelector('#stage');

    const type = String(doc.type||'').toLowerCase();
    const source = await getDocSource(doc);

    try {
      if (type === 'pdf')       await this._renderPDF(source, stage);
      else if (type === 'epub') await this._renderEPUB(source, stage);
      else if (type === 'docx') await this._renderDOCX(source, stage);
      else                      await this._renderTEXT(source, stage, type);
    } catch (e) {
      console.error(e);
      stage.innerHTML = `<div class="alert alert-danger m-3">Failed to open the document.</div>`;
    }

    try {
      doc.lastOpened = new Date().toISOString();
      await storage.saveDocument?.(doc);
      await window.activity?.logDocOpened?.(doc);
    } catch {}
  }

  nextPage(){
    if (this._pdf) this._scrollPDF(1);
    else if (this._rendition) this._rendition.next();
    else document.getElementById('viewer-wrap')?.scrollBy({ top: 400, behavior:'smooth' });
  }
  prevPage(){
    if (this._pdf) this._scrollPDF(-1);
    else if (this._rendition) this._rendition.prev();
    else document.getElementById('viewer-wrap')?.scrollBy({ top: -400, behavior:'smooth' });
  }
  _scrollPDF(delta){
    const wrap = document.getElementById('viewer-wrap');
    if (!wrap || !this._pdfPages.length) return;
    const top = wrap.scrollTop;
    let idx = 0;
    for (let i=0;i<this._pdfPages.length;i++){
      if (this._pdfPages[i].div.offsetTop - 20 > top) { idx = Math.max(0,i-1); break; }
      idx = i;
    }
    idx = Math.max(0, Math.min(this._pdfPages.length - 1, idx + (delta>0?1:-1)));
    wrap.scrollTo({ top: this._pdfPages[idx].div.offsetTop - 24, behavior:'smooth' });
  }

  async _renderPDF(source, stage){
    ensurePdfWorker();
    if (!window.pdfjsLib) { stage.innerHTML = `<div class="p-3 text-danger">PDF.js not loaded.</div>`; return; }

    let ab = source.arrayBuffer;
    if (!ab && source.url) {
      try {
        const res = await fetch(source.url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        ab = await res.arrayBuffer();
      } catch (err) {
        stage.innerHTML = `<div class="alert alert-danger m-3">Unable to fetch PDF. ${err?.message||''}</div>`;
        return;
      }
    }
    if (!ab || !ab.byteLength) { stage.innerHTML = `<div class="p-3 text-warning">Missing PDF data. Re-import the document.</div>`; return; }

    this._destroyAny();
    let pdf;
    try { pdf = await window.pdfjsLib.getDocument({ data: ab }).promise; }
    catch (err) { console.error(err); stage.innerHTML = `<div class="alert alert-danger m-3">Failed to open PDF.</div>`; return; }

    this._pdf = pdf; this._pdfPages = [];
    stage.innerHTML = '';

    for (let p=1; p<=pdf.numPages; p++){
      const div = document.createElement('div');
      div.className = 'pdf-page';
      div.style.position = 'relative';
      div.style.width = 'min(100%, 1200px)';
      div.style.minHeight = '400px';
      div.dataset.page = String(p);
      stage.appendChild(div);
      this._pdfPages.push({ pageNum: p, div, rendered:false, text:null });
    }

    this._io?.disconnect();
    const wrap = document.getElementById('viewer-wrap');
    this._io = new IntersectionObserver((entries)=>{
      entries.forEach(e => { if (e.isIntersecting){
        const info = this._pdfPages.find(x=>x.div===e.target);
        if (info) this._ensurePDFRendered(info);
      }});
    }, { root: wrap, rootMargin: '300px 0px 600px 0px', threshold: 0.01 });

    this._pdfPages.forEach(p => this._io.observe(p.div));
  }

  async _ensurePDFRendered(info){
    if (!this._pdf || info.rendered) return;
    const page = await this._pdf.getPage(info.pageNum);
    const raw = page.getViewport({ scale: 1 });
    const width = Math.min(info.div.clientWidth, 1200);
    const scale = Math.max(0.5, Math.min(2.0, width / raw.width));
    const vp = page.getViewport({ scale });

    info.div.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    info.div.style.height = `${Math.round(vp.height)}px`;
    info.div.appendChild(canvas);

    const ctx = canvas.getContext('2d', { alpha:false });
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    info.rendered = true;
  }

  async _renderEPUB(source, stage){
    if (!window.ePub) { stage.innerHTML = `<div class="p-3 text-danger">EPUB library not loaded.</div>`; return; }
    if (!source.arrayBuffer && !source.url) { stage.innerHTML = `<div class="p-3 text-warning">Missing EPUB bytes. Re-import the document.</div>`; return; }

    this._destroyAny();
    stage.innerHTML = '';
    const view = document.createElement('div');
    view.id = 'epub-view';
    view.style.width = '100%';
    view.style.minHeight = '60vh';
    stage.appendChild(view);

    const book = source.arrayBuffer ? window.ePub(source.arrayBuffer) : window.ePub(source.url);
    const rendition = book.renderTo(view, { width:'100%', height:'calc(100vh - 120px)', spread:'none' });
    this._book = book; this._rendition = rendition;

    const isDark = (document.documentElement.getAttribute('data-bs-theme')||'light') === 'dark';
    rendition.themes.register('appDark',  { 'body': { 'color': '#e8e8e8', 'background': '#121212' }});
    rendition.themes.register('appLight', { 'body': { 'color': '#222',    'background': '#fff' }});
    rendition.themes.select(isDark ? 'appDark' : 'appLight');

    rendition.on('relocated', async (location) => {
      try {
        const doc = this.currentDocument; if (!doc) return;
        doc.location = { cfi: location?.start?.cfi, at: new Date().toISOString() };
        await storage.saveDocument?.(doc);
      } catch {}
    });

    const cfi = this.currentDocument?.location?.cfi;
    await rendition.display(cfi || undefined);

    // Re-apply saved highlights on open
try {
  const doc = this.currentDocument;
  const anns = await (storage.getAnnotations?.(doc.id) || []);
  const highs = (anns||[]).filter(a => a.kind === 'highlight' && a.cfi);
  highs.forEach(h => {
    try {
      this._book?.annotations?.add('highlight', h.cfi, {}, null, 'hl-persist');
    } catch {}
  });
} catch {}

  }

  async _renderDOCX(source, stage){
    if (!window.mammoth) { stage.innerHTML = `<div class="p-3 text-danger">DOCX viewer not loaded.</div>`; return; }
    let ab = source.arrayBuffer;
    if (!ab && source.url) { try { ab = await (await fetch(source.url)).arrayBuffer(); } catch {} }
    if (!ab || !ab.byteLength) { stage.innerHTML = `<div class="p-3 text-warning">Missing DOCX bytes. Re-import the document.</div>`; return; }
    const result = await window.mammoth.convertToHtml({ arrayBuffer: ab });
    stage.innerHTML = `<article class="container py-3">${result.value || '<p>(Empty)</p>'}</article>`;
  }

    async _renderTEXT(source, stage, kind='txt'){
    let text = '';
    if (source.arrayBuffer && source.arrayBuffer.byteLength) {
      text = new TextDecoder().decode(source.arrayBuffer);
    } else if (source.url) {
      try { text = await (await fetch(source.url)).text(); } catch {}
    } else {
      try { text = await storage.getDocumentBody?.(this.currentDocument.id) || ''; } catch {}
    }

    // 🔧 Fallback: no body? show annotations as content
    if (!text || !text.trim()) {
      try {
        const anns = await storage.getAnnotations?.(this.currentDocument.id) || [];
        if (anns.length) {
          const lines = anns.map(a => (a.text || a.quote || a.note || '').trim()).filter(Boolean);
          text = lines.join('\n\n');
        }
      } catch {}
    }

    const isMd = /^(md|markdown)$/i.test(kind||'');
    if (isMd && window.marked) {
      stage.innerHTML = `<article class="container py-3">${window.marked.parse(text||'')}</article>`;
    } else {
      stage.innerHTML = '';
      const pre = document.createElement('pre');
      pre.className = 'container py-3';
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.wordBreak = 'break-word';
      pre.textContent = text || '(empty)';
      stage.appendChild(pre);
    }

    // 🔧 If deep-linked to a note id, signal page code to open the drawer + load it
    try {
      const params = new URLSearchParams(location.search);
      const noteId = params.get('note');
      if (noteId) {
        // let the page script handle the offcanvas open & editor focus
        window.dispatchEvent(new CustomEvent('reader:openNote', { detail: { noteId } }));
      }
    } catch {}
  }


  _toast(message, type='primary'){
    const el = document.getElementById('app-toast');
    const body = document.getElementById('app-toast-body');
    if (!el || !body || !window.bootstrap) { console.log(`[${type}] ${message}`); return; }
    body.textContent = message;
    el.className = `toast align-items-center text-bg-${type} border-0 shadow`;
    new bootstrap.Toast(el, { autohide:true, delay: 1600 }).show();
  }

  _destroyAny(){
    try { this._io?.disconnect?.(); } catch {}
    this._io = null;
    if (this._rendition) { try { this._rendition.destroy?.(); } catch {} this._rendition = null; }
    if (this._book) { try { this._book.destroy?.(); } catch {} this._book = null; }
    this._pdf = null; this._pdfPages = [];
  }

  // Import helpers used by other pages
  async _pickAndImport(accept) {
    return new Promise((resolve)=>{
      const input=document.createElement('input');
      input.type='file'; input.accept=accept;
      input.onchange=async()=>{ const f=input.files?.[0]; if(!f) return resolve(null);
        try { const doc = await storage.importFile(f); window.onDocumentImported?.(doc); resolve(doc); }
        catch(e){ console.error(e); alert('Import failed'); resolve(null); } };
      input.click();
    });
  }
  importEpub(){ return this._pickAndImport('.epub'); }
  importPdf(){  return this._pickAndImport('.pdf'); }
  importDocx(){ return this._pickAndImport('.docx'); }
  importText(){ return this._pickAndImport('.txt,.md'); }
}

const reader = new Reader();
window.reader = reader;
export { reader };
