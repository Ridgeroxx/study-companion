// /js/sync/bundle.js
export async function makeBundle(storage){
  const docs = await storage.getDocuments?.() || [];
  const favorites = await storage.getFavorites?.() || [];
  const annotations = await storage.getAllAnnotations?.() || [];
  const meetingNotes = await storage.getMeetingNotes?.() || [];
  const midweek = await storage.getSchedule?.('midweek') || {};
  const weekend = await storage.getSchedule?.('weekend') || {};
  const settings = await storage.getSettings?.() || {};
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    library: { docs, favorites },
    notes: { annotations, meeting: meetingNotes },
    meetings: { schedules: { midweek, weekend } },
    settings
  };
}
