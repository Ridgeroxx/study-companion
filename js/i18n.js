// js/i18n.js
(function(){
  const LS_KEY = 'app_lang';
  const SELECTOR = '#langSelect';
  const SUPPORTED = ['en','es','fr'];
  const locales = {};
  let current = localStorage.getItem(LS_KEY) || 'en';

  function resolveLang(lang) {
    return SUPPORTED.includes(lang) ? lang : 'en';
  }

  async function loadLocale(lang){
    lang = resolveLang(lang);
    if (locales[lang]) return locales[lang];
    try {
      const res = await fetch(`locales/${lang}.json`, { cache: 'no-store' });
      if (!res.ok) throw new Error('locale fetch failed');
      const data = await res.json();
      locales[lang] = data;
      return data;
    } catch (e) {
      console.warn('i18n load failed for', lang, e);
      // fallback to english
      if (lang !== 'en') {
        return loadLocale('en');
      }
      return {};
    }
  }

  function applyI18N(lang, root=document){
    const dict = locales[lang] || {};
    root.querySelectorAll('[data-i18n]').forEach(el=>{
      const key = el.getAttribute('data-i18n');
      const t = dict[key];
      if (typeof t === 'string') {
        // if element has an icon then text, try to only replace the text node
        const first = el.firstChild;
        if (first && first.nodeType === Node.TEXT_NODE && el.firstElementChild) {
          first.textContent = t;
        } else {
          el.textContent = t;
        }
      }
    });
  }

  async function setLang(lang){
    lang = resolveLang(lang);
    current = lang;
    localStorage.setItem(LS_KEY, current);
    await loadLocale(current);
    applyI18N(current);
    document.documentElement.setAttribute('lang', current);
    // mirror old badge if present
    const badge = document.getElementById('current-language');
    if (badge) badge.textContent = current.toUpperCase();
    // sync the select if present
    const sel = document.querySelector(SELECTOR);
    if (sel && sel.value !== current) sel.value = current;
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    // wire new select
    const sel = document.querySelector(SELECTOR);
    if (sel) {
      if (!SUPPORTED.includes(sel.value)) sel.value = resolveLang(current);
      sel.addEventListener('change', (e)=> setLang(e.target.value));
    }

    // keep compatibility with legacy buttons
    document.getElementById('lang-en')?.addEventListener('click', ()=> setLang('en'));
    document.getElementById('lang-es')?.addEventListener('click', ()=> setLang('es'));
    // (add more if you have them)

    // initial render (fallback-safe)
    await setLang(resolveLang(current));
  });

  window.i18n = { setLang, apply: applyI18N };
})();
