// Parse [[Wiki Links]] in markdown and build backlinks index.

export function parseWikilinks(md='') {
  const out = [];
  const re = /\[\[([^[\]]+?)\]\]/g;
  let m; while ((m = re.exec(md))) out.push(m[1].trim());
  return out;
}

/**
 * buildIndex
 * @param {Array<{id:string,title:string,content:string}>} notes
 * @returns {{ links: Array<{from:string,toTitle:string}>, backlinks: Record<title, Array<string>> }}
 */
export function buildIndex(notes) {
  const links = [];
  const backlinks = {};
  for (const n of notes) {
    const titles = parseWikilinks(n.content||'');
    titles.forEach(t => {
      links.push({ from:n.id, toTitle:t });
      (backlinks[t] ||= []).push(n.id);
    });
  }
  return { links, backlinks };
}
