// /js/ext/clipper-bridge.js
window.addEventListener('message', async (e)=>{
  if (e.data?.type !== 'clipper:new') return;
  const { title, url, selection, html } = e.data.payload;
  const noteText = (selection||'') + (html ? `\n\n<details><summary>Snapshot</summary>\n${html}\n</details>` : '');
  const note = {
    id: 'ann_'+Date.now(), documentId: '__inbox__', kind: 'note',
    note: `# ${title||'Web clip'}\nSource: ${url||''}\n\n${noteText}`,
    tags: ['clipped'],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  const list = await (storage.getAllAnnotations?.() || []);
  list.push(note);
  await storage.saveAllAnnotations?.(list);
});
