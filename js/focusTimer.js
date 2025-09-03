// js/focusTimer.js
const $ = s => document.querySelector(s);
const KEY = 'focus_sessions_v1';

let totalSec = 25*60;  // default 25 min
let leftSec  = totalSec;
let ticking  = null;

function fmt(s){
  const m = Math.floor(s/60).toString().padStart(2,'0');
  const ss = Math.floor(s%60).toString().padStart(2,'0');
  return `${m}:${ss}`;
}
function show(){ const el = $('#ft-time'); if (el) el.textContent = fmt(leftSec); }

async function saveSession(minutes){
  const list = (await localforage.getItem(KEY)) || [];
  list.push({ at: Date.now(), minutes });
  await localforage.setItem(KEY, list);
  document.dispatchEvent(new CustomEvent('focus:updated'));
}

function start(){
  if (ticking) return;
  const t0 = Date.now();
  const end = t0 + leftSec*1000;
  ticking = setInterval(()=>{
    leftSec = Math.max(0, Math.round((end - Date.now())/1000));
    show();
    if (leftSec <= 0){
      clearInterval(ticking); ticking = null;
      saveSession(Math.round(totalSec/60));
      const snd = new Audio();
      try { new Notification('Focus done!', { body:'Time to take a break.' }); } catch {}
    }
  }, 250);
}
function pause(){ if (ticking){ clearInterval(ticking); ticking = null; } }
function reset(){ pause(); leftSec = totalSec; show(); }

function preset(kind){
  const map = { pomodoro:25, short:5, long:15 };
  totalSec = (map[kind]||25)*60;
  reset();
}

document.getElementById('ft-start')?.addEventListener('click', start);
document.getElementById('ft-pause')?.addEventListener('click', pause);
document.getElementById('ft-reset')?.addEventListener('click', reset);
document.querySelectorAll('[data-ft]').forEach(btn=>{
  btn.addEventListener('click', ()=> preset(btn.getAttribute('data-ft')));
});

show();
