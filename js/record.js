import { storage } from './storage.js';
import { sync } from './sync-local.js';

const $ = (id)=>document.getElementById(id);
let media, chunks=[], blob=null;

async function listRecordings(){
  if (sync.isAuthed()) {
    const rows = await sync.listRecordings();
    $('rec-list').innerHTML = rows.length
      ? rows.map(r=>`
        <div class="d-flex align-items-center justify-content-between border rounded p-2 mb-1">
          <div class="text-truncate">${r.title||'(Untitled)'} <span class="text-muted">· ${new Date(r.createdAt).toLocaleString()}</span></div>
          <div class="btn-group btn-group-sm">
            <a class="btn btn-outline-primary" href="${sync.recordingUrl(r.id)}" target="_blank"><i class="fa-solid fa-play"></i></a>
            <button class="btn btn-outline-danger" onclick="delRec('${r.id}')"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>`).join('')
      : '<div class="text-muted">No recordings yet.</div>';
  } else {
    const list = await (storage.getRecordings?.() || []);
    $('rec-list').innerHTML = list.length
      ? list.map(r=>`
        <div class="d-flex align-items-center justify-content-between border rounded p-2 mb-1">
          <div class="text-truncate">${r.title||'(Untitled)'} <span class="text-muted">· ${new Date(r.createdAt).toLocaleString()}</span></div>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" onclick="playRec('${r.id}')"><i class="fa-solid fa-play"></i></button>
            <button class="btn btn-outline-danger" onclick="delRec('${r.id}')"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>`).join('')
      : '<div class="text-muted">No recordings yet.</div>';
  }
}

window.playRec = async (id)=>{
  const url = await storage.getRecordingUrl?.(id);
  $('rec-audio').src = url || '';
  $('rec-audio').play();
};

window.delRec = async (id)=>{
  if (sync.isAuthed()) {
    await sync.deleteRecording(id);
  } else {
    await storage.deleteRecording?.(id);
  }
  await listRecordings();
};

$('rec-start').onclick = async ()=>{
  chunks=[]; blob=null;
  const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
  media = new MediaRecorder(stream, { mimeType:'audio/webm' });
  media.ondataavailable = e => e.data?.size && chunks.push(e.data);
  media.onstop = ()=> { blob = new Blob(chunks, { type:'audio/webm' }); $('rec-save').disabled = !blob; };
  media.start();
  $('rec-start').disabled = true; $('rec-stop').disabled = false;
};

$('rec-stop').onclick = ()=>{
  try { media?.stop(); } catch {}
  $('rec-start').disabled = false; $('rec-stop').disabled = true;
};

$('rec-save').onclick = async ()=>{
  const title = ($('rec-title').value || '').trim() || 'Talk';
  if (!blob) return;
  const id = (storage.generateId ? storage.generateId('rec') : `rec_${Date.now()}`);
  if (sync.isAuthed()) {
    await sync.uploadRecording({ id, title, blob });
  } else {
    await storage.saveRecording?.({ title, blob }); // local fallback
  }
  $('rec-title').value = ''; blob=null; $('rec-audio').src='';
  $('rec-save').disabled = true;
  await listRecordings();
};

(async ()=>{ try{ await storage.init?.(); } catch{}; await listRecordings(); })();
