// js/planner.js
import * as reminders from './reminders.js';

const KEY = 'planner_items_v1';
const $ = s => document.querySelector(s);

function toast(msg, type='primary'){
  const el = $('#app-toast'); const body = $('#app-toast-body');
  if (!el || !body) return alert(msg);
  body.textContent = msg;
  el.className = `toast align-items-center text-bg-${type} border-0 shadow`;
  new bootstrap.Toast(el, { autohide:true, delay:1500 }).show();
}

async function getAll(){ return (await localforage.getItem(KEY)) || []; }
async function saveAll(list){ await localforage.setItem(KEY, Array.isArray(list)?list:[]); }

function sameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function isThisWeek(d){
  const now = new Date(); const start = new Date(now);
  start.setDate(now.getDate()-now.getDay()); start.setHours(0,0,0,0);
  const end = new Date(start); end.setDate(start.getDate()+7);
  return d>=start && d<end;
}

function cardHTML(it, idx){
  const due = it.date ? new Date(it.date + 'T' + (it.time||'00:00') + ':00') : null;
  const when = due ? due.toLocaleString() : 'No date';
  const type = (it.type||'task').replace(/^[a-z]/, m=>m.toUpperCase());
  return `
    <div class="task-card" data-idx="${idx}">
      <div class="d-flex justify-content-between align-items-center">
        <div class="task-title ${it.done?'done':''}">${(it.title||'Untitled').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</div>
        <div class="badge text-bg-light">${type}</div>
      </div>
      <div class="small text-muted mt-1"><i class="fa-regular fa-clock me-1"></i>${when}</div>
      <div class="d-flex gap-2 mt-2">
        <button class="btn btn-sm btn-outline-success" data-act="toggle"><i class="fa-solid fa-check"></i></button>
        <button class="btn btn-sm btn-outline-danger" data-act="del"><i class="fa-regular fa-trash-can"></i></button>
      </div>
    </div>`;
}

async function render(){
  const list = await getAll();
  const now = new Date();
  const today = []; const week = []; const later = [];

  for (let i=0;i<list.length;i++){
    const it = list[i];
    if (it.date){
      const d = new Date(it.date + 'T' + (it.time||'00:00') + ':00');
      if (sameDay(d, now)) today.push([it,i]);
      else if (isThisWeek(d)) week.push([it,i]);
      else later.push([it,i]);
    } else {
      later.push([it,i]);
    }
  }

  $('#kanban-today').innerHTML = today.length ? today.map(([it,i])=>cardHTML(it,i)).join('') : `<div class="text-muted small">Nothing for today.</div>`;
  $('#kanban-week').innerHTML  = week.length  ? week.map(([it,i])=>cardHTML(it,i)).join('')  : `<div class="text-muted small">Nothing scheduled.</div>`;
  $('#kanban-later').innerHTML = later.length ? later.map(([it,i])=>cardHTML(it,i)).join('') : `<div class="text-muted small">No later items.</div>`;

  // actions
  document.querySelectorAll('.task-card [data-act="toggle"]').forEach(btn=>{
    btn.onclick = async (e)=>{
      const idx = parseInt(e.currentTarget.closest('.task-card').dataset.idx,10);
      const l = await getAll(); if (!l[idx]) return;
      l[idx].done = !l[idx].done; await saveAll(l);
      render();
    };
  });
  document.querySelectorAll('.task-card [data-act="del"]').forEach(btn=>{
    btn.onclick = async (e)=>{
      const idx = parseInt(e.currentTarget.closest('.task-card').dataset.idx,10);
      const l = await getAll(); if (!l[idx]) return;
      l.splice(idx,1); await saveAll(l);
      render(); reminders.refresh(window.storage);
    };
  });
}

function setFilter(mode){
  const lanes = document.querySelectorAll('.lane');
  lanes.forEach(l=>{
    const id = l.getAttribute('data-lane');
    const show = (mode==='all') || (mode===id);
    l.style.display = show ? '' : 'none';
  });
}

// Modal save
document.getElementById('pl-save')?.addEventListener('click', async ()=>{
  const title = (document.getElementById('pl-title')?.value||'').trim();
  const date  = document.getElementById('pl-date')?.value || '';
  const time  = document.getElementById('pl-time')?.value || '';
  const type  = document.getElementById('pl-type')?.value || 'task';
  const remind= !!document.getElementById('pl-remind')?.checked;

  if (!title){ toast('Title is required','danger'); return; }

  const list = await getAll();
  list.push({ title, date, time, type, remind, createdAt: new Date().toISOString(), done:false });
  await saveAll(list);
  bootstrap.Modal.getInstance(document.getElementById('plannerModal'))?.hide();
  (document.getElementById('pl-title')||{}).value='';
  render();
  if (remind) reminders.refresh(window.storage);
  toast('Planner item added','success');
});

// Filters
document.getElementById('planner-filter-today')?.addEventListener('click', ()=> setFilter('today'));
document.getElementById('planner-filter-week')?.addEventListener('click',  ()=> setFilter('week'));
document.getElementById('planner-filter-all')?.addEventListener('click',   ()=> setFilter('all'));

// initial
render(); setFilter('all');
