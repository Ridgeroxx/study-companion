// js/planner.js
// Study Planner with Kanban lanes + date filters; persists via localforage.
// Calls window.reminders?.refresh(storage) after changes (if available).

import { storage } from './storage.js';

const KEY = 'planner_items_v1';

const planner = {
  items: [],
  filter: 'all', // UI filter buttons; Kanban ignores this and splits by due window

  async init(){
    try { await storage.init?.(); } catch {}
    await this.load();
    this.bindUI();
    this.render();
  },

  async load(){
    try {
      const list = await localforage.getItem(KEY);
      this.items = Array.isArray(list) ? list : [];
    } catch { this.items = []; }
  },

  async save(){
    try { await localforage.setItem(KEY, this.items); } catch {}
    try { if (window.reminders?.refresh) await window.reminders.refresh(storage); } catch {}
  },

  bindUI(){
    const $ = s => document.querySelector(s);

    $('#pl-save')?.addEventListener('click', async ()=>{
      const title = ($('#pl-title')?.value || '').trim();
      const date  = $('#pl-date')?.value || '';
      const time  = $('#pl-time')?.value || '';
      const type  = $('#pl-type')?.value || 'study';
      const remind= !!$('#pl-remind')?.checked;

      if (!title){ alert('Enter a title'); return; }
      if (!date){ alert('Pick a date'); return; }

      const dtISO = (time ? `${date}T${time}:00` : `${date}T00:00:00`);
      this.items.push({
        id: `pl_${Date.now()}`,
        title, type, dueAt: dtISO, remind,
        done: false,
        createdAt: new Date().toISOString()
      });
      await this.save();
      this.render();

      try { bootstrap.Modal.getInstance(document.getElementById('plannerModal'))?.hide(); } catch {}
      ['#pl-title','#pl-date','#pl-time'].forEach(sel=>{ const el=$(sel); if(el) el.value=''; });
    });

    $('#planner-filter-all')?.addEventListener('click', ()=>{ this.filter='all'; this.render(); });
    $('#planner-filter-today')?.addEventListener('click', ()=>{ this.filter='today'; this.render(); });
    $('#planner-filter-week')?.addEventListener('click', ()=>{ this.filter='week'; this.render(); });

    // Delegated: toggle/del on the whole Kanban container
    document.getElementById('planner-kanban')?.addEventListener('click', async (e)=>{
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      const act= btn.getAttribute('data-action');
      const idx = this.items.findIndex(it=>it.id===id);
      if (idx<0) return;

      if (act==='toggle'){
        this.items[idx].done = !this.items[idx].done;
        await this.save(); this.render();
      } else if (act==='delete'){
        if (!confirm('Delete this item?')) return;
        this.items.splice(idx,1);
        await this.save(); this.render();
      }
    });
  },

  // Helpers
  withinToday(iso){
    const t = new Date(iso);
    if (isNaN(t)) return false;
    const now = new Date();
    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0,0,0,0).getTime();
    const e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59,999).getTime();
    const tt = t.getTime();
    return (tt>=s && tt<=e);
  },
  withinThisWeek(iso){
    const t = new Date(iso);
    if (isNaN(t)) return false;
    const now = new Date();
    const start = new Date(now); start.setHours(0,0,0,0);
    const diff = start.getDay(); // 0 Sun
    start.setDate(start.getDate()-diff);
    const end = new Date(start); end.setDate(end.getDate()+6); end.setHours(23,59,59,999);
    const tt = t.getTime();
    return (tt>=start.getTime() && tt<=end.getTime());
  },

  getFilteredList(){
    // Used for non-kanban filters (not visible on this page, but kept for reuse)
    const list = [...this.items];
    if (this.filter==='all') return list.sort((a,b)=>new Date(a.dueAt)-new Date(b.dueAt));
    if (this.filter==='today') return list.filter(it=>this.withinToday(it.dueAt)).sort((a,b)=>new Date(a.dueAt)-new Date(b.dueAt));
    if (this.filter==='week')  return list.filter(it=>this.withinThisWeek(it.dueAt)).sort((a,b)=>new Date(a.dueAt)-new Date(b.dueAt));
    return list.sort((a,b)=>new Date(a.dueAt)-new Date(b.dueAt));
  },

  render(){
    const kt = document.getElementById('kanban-today');
    const kw = document.getElementById('kanban-week');
    const kl = document.getElementById('kanban-later');

    if (!(kt && kw && kl)) return;

    const items = [...this.items].sort((a,b)=>new Date(a.dueAt)-new Date(b.dueAt));
    const today = [], week = [], later = [];
    for (const it of items){
      if (this.withinToday(it.dueAt)) today.push(it);
      else if (this.withinThisWeek(it.dueAt)) week.push(it);
      else later.push(it);
    }

    const renderList = (arr)=> arr.length ? arr.map(it=>`
      <div class="task-card">
        <div class="d-flex align-items-center justify-content-between">
          <div>
            <div class="fw-semibold task-title ${it.done?'done':''}">${it.title}</div>
            <div class="small text-muted">
              ${new Date(it.dueAt).toLocaleString()} ·
              <span class="badge text-bg-light">${it.type}</span>${it.remind?' · 🔔':''}
            </div>
          </div>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-success" data-action="toggle" data-id="${it.id}">
              ${it.done?'<i class="fa-regular fa-square"></i>':'<i class="fa-regular fa-square-check"></i>'}
            </button>
            <button class="btn btn-outline-danger" data-action="delete" data-id="${it.id}">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </div>
      </div>
    `).join('') : `<div class="text-muted small">Empty</div>`;

    kt.innerHTML = renderList(today);
    kw.innerHTML = renderList(week);
    kl.innerHTML = renderList(later);
  }
};

window.planner = planner;
(async ()=>{ await planner.init(); })();
export { planner };
