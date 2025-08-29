// js/focusTimer.js
// Lightweight Pomodoro/Break timer with notification at end.

const FT_KEY = 'focus_timer_preset';
const DURATIONS = { pomodoro: 25*60, short: 5*60, long: 15*60 };

let _mode = 'pomodoro';
let _left = DURATIONS[_mode];
let _tick = null;

function $(s){ return document.querySelector(s); }
function fmt(s){ const m = Math.floor(s/60).toString().padStart(2,'0'); const ss=(s%60).toString().padStart(2,'0'); return `${m}:${ss}`; }
function draw(){ const el=$('#ft-time'); if (el) el.textContent = fmt(_left); }

async function notify(title, body){
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') {
      try { await Notification.requestPermission(); } catch {}
    }
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg && 'showNotification' in reg) return reg.showNotification(title, { body, icon:'icons/logo.png', badge:'icons/logo.png' });
    new Notification(title, { body, icon:'icons/logo.png' });
  } catch {}
}

function start(){
  if (_tick) return;
  _tick = setInterval(()=>{
    _left -= 1;
    if (_left <= 0){
      clearInterval(_tick); _tick=null;
      _left = 0; draw();
      notify('Timer complete', `Finished ${_mode}. Nice work!`);
    } else draw();
  }, 1000);
}
function pause(){ if (_tick){ clearInterval(_tick); _tick=null; } }
function reset(){ pause(); _left = DURATIONS[_mode]; draw(); }

function setMode(m){
  if (!DURATIONS[m]) return;
  _mode = m; _left = DURATIONS[m]; draw();
  try { localStorage.setItem(FT_KEY, _mode); } catch {}
}

function bind(){
  $('#ft-start')?.addEventListener('click', start);
  $('#ft-pause')?.addEventListener('click', pause);
  $('#ft-reset')?.addEventListener('click', reset);
  document.querySelectorAll('[data-ft]').forEach(btn=>{
    btn.addEventListener('click', ()=> setMode(btn.getAttribute('data-ft')));
  });
}

(function init(){
  const saved = localStorage.getItem(FT_KEY) || 'pomodoro';
  setMode(saved);
  bind();
  draw();
})();
