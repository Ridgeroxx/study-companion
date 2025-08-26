// Simple inline slash menu for your Markdown textarea(s).
// Usage: import { bindSlashMenu } and call bindSlashMenu(textareaEl)

const TEMPLATES = [
  {
    id: 'outline',
    title: '/outline',
    body: `# Title\n\n## Main Points\n- \n- \n- \n\n## Takeaways\n- \n- \n`
  },
  {
    id: 'study',
    title: '/study',
    body: `# Study Notes\n\n> Key Scripture: \n\n### Summary\n\n### Quotes\n- \n- \n\n### Application\n- \n- \n`
  },
  {
    id: 'sermon',
    title: '/sermon',
    body: `# Sermon Outline\n\n**Theme:** \n**Speaker:** \n**Date:** \n\n## Introduction\n\n## Points\n1. \n2. \n3. \n\n## Scriptures\n- \n- \n- \n\n## Conclusion\n`
  },
  {
    id: 'meeting',
    title: '/meeting',
    body: `# Meeting Notes\n\n**Type:** Midweek/Weekend\n**Date:** \n\n## Highlights\n- \n- \n\n## Scriptures\n- \n- \n\n## Tasks\n- [ ] \n- [ ] \n`
  }
];

// Insert text at cursor with selection preserved
function insertAtCursor(el, text) {
  const start = el.selectionStart ?? el.value.length;
  const end   = el.selectionEnd ?? el.value.length;
  const before = el.value.slice(0, start);
  const after  = el.value.slice(end);
  el.value = before + text + after;
  const pos = start + text.length;
  el.setSelectionRange(pos, pos);
  el.dispatchEvent(new Event('input', { bubbles:true }));
}

export function bindSlashMenu(textarea) {
  if (!textarea) return;
  let menu = null;
  let lastSlashPos = -1;

  function close() {
    if (menu && menu.parentNode) menu.parentNode.removeChild(menu);
    menu = null;
    lastSlashPos = -1;
  }

  function open(items) {
    close();
    menu = document.createElement('div');
    menu.className = 'position-absolute bg-body border rounded shadow p-1 small';
    // position: under caret (approx fallback)
    const rect = textarea.getBoundingClientRect();
    const y = rect.top + window.scrollY + 20;
    const x = rect.left + window.scrollX + 16;
    menu.style.top = `${y}px`;
    menu.style.left = `${x}px`;
    menu.style.zIndex = 9999;

    menu.innerHTML = items.map(t => `
      <button class="btn btn-sm btn-light w-100 text-start my-1" data-id="${t.id}">${t.title}</button>
    `).join('');

    menu.addEventListener('click', (e) => {
      const id = e.target?.getAttribute?.('data-id');
      if (!id) return;
      const tpl = TEMPLATES.find(x => x.id === id);
      if (tpl) insertAtCursor(textarea, tpl.body);
      close();
    });

    document.body.appendChild(menu);
  }

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(); return; }
  });

  textarea.addEventListener('input', (e) => {
    const val = textarea.value;
    const pos = textarea.selectionStart ?? val.length;
    const slice = val.slice(0, pos);
    const lastSlash = slice.lastIndexOf('/');
    if (lastSlash !== -1) {
      const token = slice.slice(lastSlash, pos); // includes '/'
      const matches = TEMPLATES.filter(t => t.title.startsWith(token));
      if (token === '/') { lastSlashPos = lastSlash; open(TEMPLATES); }
      else if (matches.length) { lastSlashPos = lastSlash; open(matches); }
      else if (lastSlashPos !== -1 && pos - lastSlashPos > 24) { close(); }
    } else {
      close();
    }
  });

  document.addEventListener('click', (e) => {
    if (!menu) return;
    if (e.target === menu || menu.contains(e.target)) return;
    close();
  });
}
