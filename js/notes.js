// /js/notes.js
// Meeting notes helpers used by meetings.html editor

import { storage } from './storage.js';

const notes = {
  async init(){ /* reserved for right-bar sync, etc. */ },

  _fields(){
    return {
      idEl: document.getElementById('meeting-id'),
      titleEl: document.getElementById('meeting-title'),
      dateEl: document.getElementById('meeting-date'),
      typeEl: document.getElementById('meeting-type'),
      contentEl: document.getElementById('meeting-content')
    };
  },

  async saveMeetingNote(){
    const { idEl, titleEl, dateEl, typeEl, contentEl } = this._fields();
    const note = {
      id: idEl?.value || undefined,
      title: (titleEl?.value||'').trim() || 'Untitled',
      date: (dateEl?.value||'').trim() || null,
      type: (typeEl?.value||'midweek'),
      content: contentEl?.value || ''
    };
    const saved = await storage.saveMeetingNote(note);
    if (idEl) idEl.value = saved.id; // remember current note id for updates
    return saved;
  },

  async deleteMeetingNote(){
    const { idEl, titleEl, contentEl } = this._fields();
    const id = idEl?.value;
    if (!id) return; // nothing loaded
    await storage.deleteMeetingNote(id);
    if (idEl) idEl.value = '';
    if (titleEl) titleEl.value = '';
    if (contentEl) contentEl.value = '';
  }
};

window.notes = notes;
export { notes };
