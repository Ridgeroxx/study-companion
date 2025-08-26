// /js/notes/exporters.js
function esc(s=''){ return (s+'').replace(/[&<>]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c])); }
function safe(s=''){ return s.replace(/[^\w\d]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,''); }
function downloadFile(data, name, type) {
  const blob = new Blob([data], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

/* ---------- Per-note ---------- */
export function toMarkdown({ title='Note', body='', quote='', tags=[], meta={} }) {
  const md = [
    `# ${title}`,
    '',
    meta.title ? `**Document:** ${meta.title}` : '',
    meta.author ? `**Author:** ${meta.author}` : '',
    meta.range ? `**Range:** ${meta.range}` : '',
    meta.date ? `**Date:** ${meta.date}` : '',
    '',
    quote ? `> ${quote}` : '',
    '',
    body,
    '',
    tags?.length ? `Tags: ${tags.map(t=>`#${t}`).join(' ')}` : ''
  ].filter(Boolean).join('\n');
  downloadFile(md, `${safe(title)}.md`, 'text/markdown');
}

export function toHTML({ title='Note', body='', quote='', tags=[], meta={} }) {
  const html = `<!doctype html><html><head>
<meta charset="utf-8"><title>${esc(title)}</title>
<link rel="stylesheet" href="styles/print.css"></head><body>
  <article class="print-wrap">
    <header>
      <h1>${esc(title)}</h1>
      <div class="meta">
        ${meta.title ? `<div><b>Document:</b> ${esc(meta.title)}</div>`:''}
        ${meta.author? `<div><b>Author:</b> ${esc(meta.author)}</div>`:''}
        ${meta.range ? `<div><b>Range:</b> ${esc(meta.range)}</div>`:''}
        ${meta.date  ? `<div><b>Date:</b> ${esc(meta.date)}</div>`:''}
      </div>
    </header>
    ${quote ? `<blockquote>${esc(quote)}</blockquote>` : ''}
    <section class="content">${body}</section>
    ${tags?.length ? `<footer class="tags">${tags.map(t=>`<span class="tag">#${esc(t)}</span>`).join('')}</footer>`:''}
  </article></body></html>`;
  downloadFile(html, `${safe(title)}.html`, 'text/html');
}

export function toPDF(htmlOrPayload) {
  const html = typeof htmlOrPayload === 'string'
    ? htmlOrPayload
    : `<!doctype html><html><head>
<meta charset="utf-8"><title>${esc(htmlOrPayload?.title || 'Export')}</title>
<link rel="stylesheet" href="styles/print.css">
<style>@page{margin:16mm}body{margin:0}</style>
</head><body>
${toInlineHTML(htmlOrPayload)}
</body></html>`;

  const w = window.open('', '_blank', 'noopener');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(()=> w.print(), 250);
}

function toInlineHTML({ title='Note', body='', quote='', tags=[], meta={} }){
  return `
  <article class="print-wrap">
    <header>
      <h1>${esc(title)}</h1>
      <div class="meta">
        ${meta.title ? `<div><b>Document:</b> ${esc(meta.title)}</div>`:''}
        ${meta.author? `<div><b>Author:</b> ${esc(meta.author)}</div>`:''}
        ${meta.range ? `<div><b>Range:</b> ${esc(meta.range)}</div>`:''}
        ${meta.date  ? `<div><b>Date:</b> ${esc(meta.date)}</div>`:''}
      </div>
    </header>
    ${quote ? `<blockquote>${esc(quote)}</blockquote>` : ''}
    <section class="content">${body}</section>
    ${tags?.length ? `<footer class="tags">${tags.map(t=>`<span class="tag">#${esc(t)}</span>`).join('')}</footer>`:''}
  </article>`;
}

/* ---------- Per-book annotations ---------- */
export function exportBookAnnotations({ docMeta, annotations=[] }, fmt='md') {
  const title = docMeta?.title || 'Book Annotations';
  const author= docMeta?.author || '';

  if (fmt === 'md') {
    const md = [
      `# ${title}`, author ? `**Author:** ${author}` : '', '',
      ...annotations.map(a => {
        const when = a.createdAt ? new Date(a.createdAt).toLocaleString() : '';
        const tags = Array.isArray(a.tags) && a.tags.length ? `\nTags: ${a.tags.map(t=>`#${t}`).join(' ')}` : '';
        return `> ${a.quote||''}\n\n${a.note||a.text||''}\n\n_${when}_${tags}\n\n---\n`;
      })
    ].filter(Boolean).join('\n');
    downloadFile(md, `${safe(title)}.md`, 'text/markdown');
    return;
  }

  const htmlBody = annotations.map(a=>{
    const when = a.createdAt ? new Date(a.createdAt).toLocaleString() : '';
    const tags = Array.isArray(a.tags) && a.tags.length ? `<div class="tags">${a.tags.map(t=>`<span class="tag">#${esc(t)}</span>`).join('')}</div>` : '';
    return `<section class="ann">
      ${a.quote ? `<blockquote>${esc(a.quote)}</blockquote>`:''}
      ${a.note||a.text ? `<div class="content">${a.note||a.text}</div>`:''}
      ${when ? `<div class="when">${esc(when)}</div>`:''}
      ${tags}
    </section>`;
  }).join('');

  const doc = `<!doctype html><html><head>
<meta charset="utf-8"><title>${esc(title)}</title>
<link rel="stylesheet" href="styles/print.css"></head><body>
  <article class="print-wrap">
    <header>
      <h1>${esc(title)}</h1>
      ${author ? `<div class="meta"><b>Author:</b> ${esc(author)}</div>`:''}
    </header>
    ${htmlBody}
  </article></body></html>`;

  if (fmt === 'html') {
    downloadFile(doc, `${safe(title)}.html`, 'text/html');
  } else {
    const w = window.open('', '_blank', 'noopener'); if (!w) return;
    w.document.write(doc); w.document.close(); w.focus(); setTimeout(()=> w.print(), 250);
  }
}
