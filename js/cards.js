// js/cards.js
export const cards = {
  async ensureDefaultDeck(){ return { id:'default' }; },
  async syncFromHighlights(){},
  async syncFromMeetingNotes(){},
  async getDueCards(){ return []; },
  grade(){},
  async save(){},
};
window.cards = cards;
