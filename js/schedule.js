// /js/schedule.js
// Meeting schedule utilities (global + module)

import { storage } from './storage.js';

const schedule = {
  async init(){
    await this.refreshMeetings();
  },

  async addMeetingTime(kind /* 'midweek'|'weekend' */){
    const when = prompt(`Add ${kind} meeting time (e.g., "Wed 7:00 PM"):`,'');
    if (when == null || !when.trim()) return;
    const list = await storage.getSchedule(kind);
    list.push({ id: storage.generateId('mtg'), when: when.trim(), createdAt: new Date().toISOString() });
    await storage.saveSchedule(kind, list);
    await this.refreshMeetings();
  },

  async deleteMeetingTime(kind, id){
    const list = await storage.getSchedule(kind);
    await storage.saveSchedule(kind, list.filter(x => x.id !== id));
    await this.refreshMeetings();
  },

  async refreshMeetings(){
    const mid = await storage.getSchedule('midweek');
    const wk  = await storage.getSchedule('weekend');

    const midBox = document.getElementById('midweek-schedule');
    const wkBox  = document.getElementById('weekend-schedule');

    if (midBox){
      midBox.innerHTML = mid.length
        ? mid.map(x => `
          <div class="d-flex align-items-center justify-content-between border rounded p-2 mb-2">
            <span>${x.when}</span>
            <button class="btn btn-sm btn-outline-danger" onclick="schedule.deleteMeetingTime('midweek','${x.id}')"><i class="fa-regular fa-trash-can"></i></button>
          </div>`).join('')
        : `<div class="text-muted">No times yet.</div>`;
    }

    if (wkBox){
      wkBox.innerHTML = wk.length
        ? wk.map(x => `
          <div class="d-flex align-items-center justify-content-between border rounded p-2 mb-2">
            <span>${x.when}</span>
            <button class="btn btn-sm btn-outline-danger" onclick="schedule.deleteMeetingTime('weekend','${x.id}')"><i class="fa-regular fa-trash-can"></i></button>
          </div>`).join('')
        : `<div class="text-muted">No times yet.</div>`;
    }
  }
};

window.schedule = schedule;
export { schedule };
