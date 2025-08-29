// /js/schedule.js — weekly meetings helper
import { storage } from './storage.js';

function parseWeeklyInput(s){
  // Examples: "Thu 3:50 PM", "Sun 09:00", "wed 7pm"
  const days = ['sun','mon','tue','wed','thu','fri','sat'];
  s = (s||'').trim().toLowerCase();
  const m = /^([a-z]{3,})\s+(\d{1,2})(?::(\d{2}))?\s*([ap]m)?$/.exec(s.replace(/\./g,''));
  if (!m) return null;
  const dStr = m[1].slice(0,3);
  const day = days.indexOf(dStr);
  if (day < 0) return null;
  let hh = parseInt(m[2],10), mm = parseInt(m[3]||'0',10);
  const ampm = m[4] || '';
  if (ampm) {
    if (ampm === 'pm' && hh < 12) hh += 12;
    if (ampm === 'am' && hh === 12) hh = 0;
  }
  const hhmm = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  return { day, time: hhmm };
}

function humanWeekly({day,time}){
  const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const [hh,mm] = time.split(':').map(n=>parseInt(n,10));
  const h12 = ((hh + 11) % 12) + 1;
  const ampm = hh >= 12 ? 'PM' : 'AM';
  return `${names[day]} ${h12}:${String(mm).padStart(2,'0')} ${ampm}`;
}

export const schedule = {
  async init(){ await this.refreshMeetings(); },

  async addMeetingTime(kind){
    const raw = prompt(`Add ${kind} meeting time (e.g., "Thu 3:50 PM"):`, '');
    if (raw == null || !raw.trim()) return;
    const parsed = parseWeeklyInput(raw);
    if (!parsed) { alert('Could not parse. Try like: Thu 3:50 PM'); return; }
    const list = await storage.getSchedule(kind);
    list.push({ id: storage.generateId('mtg'), ...parsed, createdAt: new Date().toISOString() });
    await storage.saveSchedule(kind, list);
    window.dispatchEvent(new Event('schedule:updated'));
    await this.refreshMeetings();
  },

  async deleteMeetingTime(kind, id){
    const list = await storage.getSchedule(kind);
    await storage.saveSchedule(kind, list.filter(x => x.id !== id));
    window.dispatchEvent(new Event('schedule:updated'));
    await this.refreshMeetings();
  },

  async refreshMeetings(){
    const [mid, wk] = await Promise.all([
      storage.getSchedule('midweek'),
      storage.getSchedule('weekend')
    ]);
    const midBox = document.getElementById('midweek-schedule');
    const wkBox  = document.getElementById('weekend-schedule');

    const render = (arr=[]) => arr.length
      ? arr.map(x=>`
        <div class="d-flex align-items-center justify-content-between border rounded p-2 mb-2">
          <span>${humanWeekly(x)}</span>
          <button class="btn btn-sm btn-outline-danger" onclick="schedule.deleteMeetingTime('${x.day<5?'midweek':'weekend'}','${x.id}')"><i class="fa-regular fa-trash-can"></i></button>
        </div>`).join('')
      : `<div class="text-muted">No times yet.</div>`;

    if (midBox) midBox.innerHTML = render(mid);
    if (wkBox)  wkBox.innerHTML  = render(wk);
  }
};

window.schedule = schedule;
