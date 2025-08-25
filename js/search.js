// js/search.js
import { storage } from './storage.js';

class Search {
  async init(){ /* optional; real index can be added later */ }
  performSearch(){ /* stub called by app.html if wired; using app.js simple search instead */ }
}
export const search = new Search();
window.search = search;
