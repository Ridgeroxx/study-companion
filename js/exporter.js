// js/exporter.js
import { storage } from './storage.js';

export async function makeStudyBundle(){
  const data = await storage.exportAll();
  return new Blob([JSON.stringify(data,null,2)], { type:'application/json' });
}
export async function importStudyBundle(textOrInput){
  if (typeof textOrInput === 'string') return storage.importAll(textOrInput);
  const file = textOrInput?.files?.[0]; if (!file) return;
  const text = await file.text();
  return storage.importAll(text);
}

// optional re-exports used by app.js wrapper
export async function exportAll(){ return makeStudyBundle(); }
export async function importAll(text){ return storage.importAll(text); }
