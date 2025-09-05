// js/planner.js
import { storage } from './storage.js';

const KEY = 'planner_tasks_v1';
const nowISO = () => new Date().toISOString();

const planner = {
  tasks: [],
  filter: 'all',

  async init(){
    try { await storage.init?.(); } catch {}
    // Load tasks
    this.tasks =
      (await storage.getItem?.(KEY)) ||
      JSON.parse(localStorage.getItem(KEY) || '[]');

    this._wire();
    this.render();
    window.planner = this; // allow app.html's Save button to call addTask
  },

  async save(){
    if (storage.setItem) await storage.setItem(KEY, this.tasks);
    else localStorage.setItem(KEY, JSON.stringify(this.tasks));
  },

  async addTask({ title, lane='today' }){
    const t = {
      id: storage.generateId ? storage.generateId('task') : ('t_'+Date.now()),
      title: (title||'').trim(),
      lane,
      done: false,
      createdAt: nowISO(),
      updatedAt: nowISO()
    };
    if (!t.title) return;
    this.tasks.unshift(t);
    await this.save();
    this.render();
    try { window.app?.toast?.('Task added','success'); } catch {}
  },

  async toggleDone(id){
    const t = this.tasks.find(x=>x.id===id);
    if (!t) return;
    t.done = !t.done;
    t.updatedAt = nowISO();
    await this.save();
    this.render();
  },

  async deleteTask(id){
    this.tasks = this.tasks.filter(x=>x.id!==id);
    await this.save();
    this.render();
    try { window.app?.toast?.('Task removed','secondary'); } catch {}
  },

  setFilter(f){ this.filter = f; this.render(); },

  _wire(){
    document.getElementById('planner-filter-today')?.addEventListener('click', ()=>this.setFilter('today'));
    document.getElementById('planner-filter-week') ?.addEventListener('click', ()=>this.setFilter('week'));
    document.getElementById('planner-filter-all')  ?.addEventListener('click', ()=>this.setFilter('all'));
  },

  _renderLane(laneId, laneName){
    const box = document.getElementById(`kanban-${laneId}`);
    if (!box) return;
    const list = this.tasks
      .filter(t => t.lane === laneId)
      .filter(t => this.filter === 'all' ? true : (this.filter === laneId));

    box.innerHTML = list.length
      ? list.map(t=>`
        <div class="task-card" data-id="${t.id}">
          <div class="d-flex justify-content-between align-items-center">
            <div class="task-title ${t.done?'done':''}">${t.title}</div>
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-secondary" data-toggle="${t.id}" title="${t.done?'Mark as not done':'Mark as done'}">
                <i class="fa-regular fa-square-check"></i>
              </button>
              <button class="btn btn-outline-danger" data-del="${t.id}" title="Delete">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>
        </div>`).join('')
      : `<div class="text-muted small">No tasks in ${laneName}.</div>`;
  },

  render(){
    this._renderLane('today','Today');
    this._renderLane('week','This Week');
    this._renderLane('later','Later');

    // Delegated actions per lane
    ['kanban-today','kanban-week','kanban-later'].forEach(id=>{
      const box = document.getElementById(id);
      if (!box) return;
      box.querySelectorAll('[data-toggle]').forEach(btn=>{
        btn.onclick = ()=> this.toggleDone(btn.getAttribute('data-toggle'));
      });
      box.querySelectorAll('[data-del]').forEach(btn=>{
        btn.onclick = ()=> this.deleteTask(btn.getAttribute('data-del'));
      });
    });
  }
};

planner.init?.();
export { planner };
