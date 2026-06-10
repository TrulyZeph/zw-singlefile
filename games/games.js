const DISCORD_WEBHOOK = "https://discord.com/api/webhooks/1486107482026938580/l62LKSzb8f1bzKMZ1JJKsTnNaVxzQcV96y7C0TJziP3ZpFMolr6EsPJ_z9QjVhgbGjf-";
const ZEPHWARE_URL = "../index.html";

let buttonConfigs = [];
let activeTag = null;
let panel = null;
let slugMap = new Map();
let slugToConfig = new Map();

const imageCache = new Map();

const DB_NAME    = 'ZephwareSaves';
const DB_VERSION = 1;
let   _db        = null;

function _openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('games')) db.createObjectStore('games');
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = e => reject(e.target.error);
  });
}

async function _dbGet(key) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('games','readonly').objectStore('games').get(key);
    req.onsuccess = e => resolve(e.target.result ?? null);
    req.onerror   = e => reject(e.target.error);
  });
}

async function _dbSet(key, value) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('games','readwrite').objectStore('games').put(value, key);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

async function _dbDelete(key) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('games','readwrite');
    tx.objectStore('games').delete(key);
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}

async function _dbGetAll() {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const out = {};
    const req = db.transaction('games','readonly').objectStore('games').openCursor();
    req.onsuccess = e => {
      const c = e.target.result;
      if (c) { out[c.key] = c.value; c.continue(); } else resolve(out);
    };
    req.onerror = e => reject(e.target.error);
  });
}

function _saveKey(config) {
  const raw = (config.url || config.label || 'unknown').toLowerCase().replace(/\/+$/, '');
  return 'game:' + raw;
}

function _hash(obj) {
  const s = JSON.stringify(obj) || '';
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; }
  return h;
}

async function saveGetRecord(config) {
  try { return (await _dbGet(_saveKey(config))) || {}; } catch { return {}; }
}

async function savePutRecord(config, patch) {
  try {
    const existing = (await _dbGet(_saveKey(config))) || {};
    const updated  = { ...existing, ...patch, ts: Date.now() };
    await _dbSet(_saveKey(config), updated);
    return updated;
  } catch (e) { console.warn('[ZW save] write failed:', e); return {}; }
}

function _showSaveToast(text = '💾 Saved') {
  let el = document.getElementById('zw-save-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'zw-save-toast';
    Object.assign(el.style, {
      position: 'fixed', bottom: '16px', right: '16px', zIndex: '99999',
      background: 'rgba(15,15,30,.93)', color: '#4ade80',
      font: '700 12px/1 sans-serif', padding: '6px 13px', borderRadius: '6px',
      boxShadow: '0 2px 12px rgba(0,0,0,.5)', pointerEvents: 'none',
      opacity: '0', transition: 'opacity .25s',
    });
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 2000);
}

const _session = {
  intervals:  [],
  listeners:  [],
  lastHash:   null, 
  config:     null,

  add(id)              { this.intervals.push(id); },
  on(target, type, fn) { target.addEventListener(type, fn); this.listeners.push({ target, type, fn }); },

  teardown() {
    this.intervals.forEach(clearInterval);
    this.listeners.forEach(({ target, type, fn }) => target.removeEventListener(type, fn));
    this.intervals  = [];
    this.listeners  = [];
    this.lastHash   = null;
    this.config     = null;
  }
};

function _buildBridgeScript(baseUrl, spoofHost, savedLS) {
  return `(function(){
  var BASE       = ${JSON.stringify(baseUrl)};
  var SPOOF_HOST = ${JSON.stringify(spoofHost || '')};
  var SAVED_LS   = ${JSON.stringify(savedLS   || {})};

  /* ── 1. Restore saved localStorage ── */
  try {
    for (var k in SAVED_LS) {
      if (Object.prototype.hasOwnProperty.call(SAVED_LS, k))
        localStorage.setItem(k, SAVED_LS[k]);
    }
  } catch(e) {}

  /* ── 2. localStorage → parent mirror (with 60 s hard-cap debounce) ── */
  var _lastSent = '';
  function _snapshot() {
    try {
      var snap = {};
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        snap[k] = localStorage.getItem(k);
      }
      var str = JSON.stringify(snap);
      if (str !== _lastSent) {
        _lastSent = str;
        parent.postMessage({ type: 'zw_ls_save', data: snap }, '*');
      }
    } catch(e) {}
  }
  /* Poll every 5 s + flush on visibility hide + page unload */
  setInterval(_snapshot, 5000);
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') _snapshot();
  });
  window.addEventListener('pagehide',     _snapshot);
  window.addEventListener('beforeunload', _snapshot);

  /* ── 3. Location spoof (via Window.prototype — works even when
          window.location is non-configurable on the instance) ── */
  if (SPOOF_HOST) {
    try {
      var _rl = location;
      var _fo = 'https://' + SPOOF_HOST;
      var _lp = new Proxy(_rl, {
        get: function(t, p) {
          if (p === 'hostname' || p === 'host') return SPOOF_HOST;
          if (p === 'origin')   return _fo;
          if (p === 'protocol') return 'https:';
          if (p === 'href')     return _fo + '/';
          var v = t[p]; return typeof v === 'function' ? v.bind(t) : v;
        }
      });
      Object.defineProperty(Window.prototype, 'location',
        { get: function(){ return _lp; }, configurable: true });
      try {
        Object.defineProperty(document, 'referrer',
          { get: function(){ return _fo + '/'; }, configurable: true });
      } catch(e) {}
    } catch(e) { console.warn('[ZW] location spoof failed:', e); }
  }

  /* ── 4. fetch — resolve relative URLs, swallow non-GitHub failures ── */
  var _oFetch = window.fetch;
  window.fetch = function(input, init) {
    var u = input;
    try {
      if (typeof input === 'string' && !/^(https?:|data:|blob:)/i.test(input)) {
        u = new URL(input, BASE).href;
        input = u;
      }
    } catch(e) {}
    var p = _oFetch.call(this, input, init);
    if (typeof u === 'string' && u.indexOf('raw.githubusercontent.com') === -1) {
      p = p.catch(function() {
        return new Response('{}', { status: 200,
          headers: { 'Content-Type': 'application/json' } });
      });
    }
    return p;
  };

  /* ── 5. XHR — resolve relative URLs ── */
  var _oXHR = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    try {
      if (url && !/^(https?:|data:|blob:)/i.test(url))
        url = new URL(url, BASE).href;
    } catch(e) {}
    return _oXHR.apply(this, arguments);
  };

  /* ── 6. Worker — blobify cross-origin scripts + patch importScripts ── */
  var _oWorker = window.Worker;
  window.Worker = function(url, opts) {
    try {
      if (!/^(https?:|blob:)/i.test(url)) url = new URL(url, BASE).href;
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.send(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        var workerBase = url.substring(0, url.lastIndexOf('/') + 1) || BASE;
        var patch = '(function(){'
          + 'var __wb=' + JSON.stringify(workerBase) + ';'
          + 'var __ois=self.importScripts;'
          + 'self.importScripts=function(){'
          + '  var a=Array.prototype.slice.call(arguments).map(function(u){'
          + '    return /^(https?:|blob:|data:)/i.test(u)?u:new URL(u,__wb).href;'
          + '  });'
          + '  return __ois.apply(self,a);'
          + '};'
          + '})();\n';
        return new _oWorker(
          URL.createObjectURL(new Blob([patch + xhr.responseText],
            { type: 'application/javascript' })), opts);
      }
    } catch(e) { console.warn('[ZW] Worker blobify failed:', e); }
    return new _oWorker(url, opts);
  };

})();`;
}

async function enableRuffleSave(player, config) {
  const key = _saveKey(config);
  try {
    const rec = await _dbGet(key);
    if (rec?.ruffle && player.setLocalStorageData) {
      player.setLocalStorageData(rec.ruffle);
    }
  } catch(e) { console.warn('[ZW] Ruffle restore failed:', e); }

  let lastHash = null;
  const flush = async () => {
    try {
      const data = player.getLocalStorageData?.();
      if (!data) return;
      const h = _hash(data);
      if (h === lastHash) return;
      lastHash = h;
      await savePutRecord(config, { ruffle: data });
      _showSaveToast('💾 Flash save');
    } catch(e) {}
  };

  const id = setInterval(flush, 4000);
  _session.add(id);
  _session.on(document, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}


function preloadImage(src) {
  if (imageCache.has(src)) return imageCache.get(src);
  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  imageCache.set(src, promise);
  return promise;
}

function convertToRawGitHubURL(url) {
  if (typeof url !== 'string' || url.startsWith('http')) return url;
  const match = url.match(/^([^\/]+)\/([^\/]+)(?:\/(.+))?$/);
  if (!match) return url;
  const [, username, repo, rest = 'main'] = match;
  const path = rest.endsWith('/') ? rest : rest + '/';
  return `https://raw.githubusercontent.com/${username}/${repo}/${path}`;
}

function makeAbsoluteURL(baseUrl, resourcePath) {
  if (!resourcePath) return resourcePath;
  if (/^(https?:|\/\/|data:|mailto:|javascript:|#)/i.test(resourcePath)) return resourcePath;
  const path = resourcePath.startsWith('/') ? resourcePath.slice(1) : resourcePath;
  return baseUrl + path;
}

function buildSlugMaps(configs) {
  slugMap = new Map();
  slugToConfig = new Map();

  const baseCount = {};

  configs.forEach(cfg => {
    const base = (cfg.label || 'game')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    baseCount[base] = (baseCount[base] || 0) + 1;
  });

  const seen = {};
  configs.forEach(cfg => {
    const base = (cfg.label || 'game')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    let slug;
    if (baseCount[base] > 1) {
      seen[base] = (seen[base] || 0) + 1;
      slug = `${base}-${seen[base]}`;
    } else {
      slug = base;
    }

    slugMap.set(cfg, slug);
    slugToConfig.set(slug, cfg);
  });
}

function getRoute() {
  const hash = window.location.hash.slice(1);
  return hash.startsWith('/') ? hash.slice(1) : '';
}

function setRoute(slug) {
  window.location.hash = slug ? `#/${slug}` : '';
}

function handleRouteChange() {
  const slug = getRoute();
  if (slug && slugToConfig.has(slug)) {
    openGame(slugToConfig.get(slug), true);
  } else {
    closeGame();
  }
}

async function loadGameBuild(rawOrShorthandUrl, savedLS = {}) {
  try {
    let baseUrl = convertToRawGitHubURL(rawOrShorthandUrl);
    if (!baseUrl.endsWith('/')) baseUrl += '/';

    const fetchCache = new Map();
    const cachedFetch = (url) => {
      if (fetchCache.has(url)) return fetchCache.get(url);
      const p = fetch(url);
      fetchCache.set(url, p);
      return p;
    };

    const resp = await cachedFetch(baseUrl + 'index.html');
    if (!resp.ok) throw new Error(`Failed to fetch index.html: ${resp.status}`);
    let htmlText = await resp.text();

    const externalScriptPatterns = [
      /https:\/\/apis\.google\.com/gi,
      /https?:\/\/connect\.facebook\.net/gi,
      /https?:\/\/cdn\.ravenjs\.com/gi,
      /https:\/\/.*doorbell\.io/gi,
      /https?:\/\/.*googletagmanager/gi,
      /https?:\/\/.*analytics/gi,
      /https?:\/\/static\.addtoany/gi
    ];

    htmlText = htmlText.replace(/<script[\s\S]*?<\/script>/gi, (match) => {
      for (const pattern of externalScriptPatterns) {
        if (pattern.test(match)) return '';
      }
      return match;
    });

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');

    let baseEl = doc.querySelector('base');
    if (!baseEl) {
      baseEl = doc.createElement('base');
      baseEl.href = baseUrl;
      (doc.head || doc.documentElement).insertBefore(baseEl, doc.head?.firstChild || null);
    } else {
      baseEl.href = baseUrl;
    }

    const linkEls = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
    for (const link of linkEls) {
      const href = link.getAttribute('href') || '';
      const absHref = makeAbsoluteURL(baseUrl, href);
      try {
        const cssResp = await cachedFetch(absHref);
        if (!cssResp.ok) throw new Error('CSS fetch failed');
        let cssText = await cssResp.text();
        const cssDir = absHref.substring(0, absHref.lastIndexOf('/') + 1);
        cssText = cssText.replace(/url\(([^)]+)\)/gi, (match, p1) => {
          const clean = p1.trim().replace(/^['"]|['"]$/g, '');
          if (/^(data:|https?:|\/\/)/i.test(clean)) return match;
          return `url("${makeAbsoluteURL(cssDir, clean)}")`;
        });
        const styleEl = doc.createElement('style');
        styleEl.textContent = cssText;
        link.replaceWith(styleEl);
      } catch {
        link.href = absHref;
      }
    }

    const scriptEls = Array.from(doc.querySelectorAll('script[src]'));
    for (const script of scriptEls) {
      const src = script.getAttribute('src') || '';
      const absSrc = makeAbsoluteURL(baseUrl, src);
      try {
        const jsResp = await cachedFetch(absSrc);
        if (!jsResp.ok) throw new Error('JS fetch failed');
        const jsText = await jsResp.text();
        const inline = doc.createElement('script');
        inline.textContent = jsText;
        script.replaceWith(inline);
      } catch {
        script.src = absSrc;
      }
    }

    const resourceAttrs = [
      { sel: 'img', attr: 'src' },
      { sel: 'audio', attr: 'src' },
      { sel: 'video', attr: 'src' },
      { sel: 'source', attr: 'src' },
      { sel: 'iframe', attr: 'src' },
      { sel: 'a', attr: 'href' },
      { sel: 'link[rel="icon"]', attr: 'href' }
    ];

    for (const { sel, attr } of resourceAttrs) {
      for (const node of doc.querySelectorAll(sel)) {
        const val = node.getAttribute(attr);
        if (!val || /^(https?:|\/\/|data:|mailto:|javascript:)/i.test(val)) continue;
        node.setAttribute(attr, makeAbsoluteURL(baseUrl, val));
      }
    }

    let spoofHost = '';
    const _ghm = baseUrl.match(/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\//);
    if (_ghm) {
      spoofHost = _ghm[2].endsWith('.github.io') ? _ghm[2] : `${_ghm[1]}.github.io`;
    }

    const runtimeFix = doc.createElement('script');
    runtimeFix.textContent = _buildBridgeScript(baseUrl, spoofHost, savedLS);
    (doc.head || doc.documentElement).insertBefore(runtimeFix, doc.head?.firstChild || null);

    const finalHtml = '<!doctype html>\n' + doc.documentElement.outerHTML;
    return URL.createObjectURL(new Blob([finalHtml], { type: 'text/html' }));
  } catch (e) {
    console.error('Error building game:', e);
    throw e;
  }
}

async function injectRuffle() {
  return new Promise((resolve) => {
    if (window.RufflePlayer) { resolve(); return; }
    const script = document.createElement('script');
    script.src = "https://unpkg.com/@ruffle-rs/ruffle";
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.body.appendChild(script);
  });
}


async function openGame(config, fromRoute = false) {
  _session.teardown();
  _session.config = config;

  if (panel) panel.style.display = 'none';
  document.querySelectorAll('.game-player, .game-back-bar').forEach(el => el.remove());

  if (!fromRoute) setRoute(slugMap.get(config) || '');

  const backBar = document.createElement('div');
  backBar.className = 'game-back-bar';

  const backBtn = document.createElement('button');
  backBtn.className = 'game-back-btn';
  backBtn.innerHTML = `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
    </svg>
    Back to Games
  `;
  backBtn.addEventListener('click', () => setRoute(''));

  const gameTitle = document.createElement('div');
  gameTitle.className = 'game-back-title';
  gameTitle.textContent = config.label || '';

  backBar.appendChild(backBtn);
  backBar.appendChild(gameTitle);
  document.body.appendChild(backBar);

  let url = config.url;
  const isGameBuild = config.type === 'gameBuild' ||
    (/gameBuilds|github|raw\.githubusercontent\.com/i.test(url) && !url.endsWith('.swf'));

  if (isGameBuild) {
    let savedLS = {};
    try {
      const rec = await saveGetRecord(config);
      savedLS = rec.ls || {};
    } catch(e) {}

    try {
      url = await loadGameBuild(url, savedLS);
    } catch (e) {
      console.error('Failed to load game build:', e);
      alert('Failed to load game. Please try again.');
      closeGame();
      return;
    }

    const lsMsgHandler = async (e) => {
      if (e.data?.type !== 'zw_ls_save') return;
      const snap = e.data.data;
      const h    = _hash(snap);
      if (h === _session.lastHash) return;
      _session.lastHash = h;
      try {
        await savePutRecord(config, { ls: snap });
        _showSaveToast();
      } catch(err) { console.warn('[ZW save] postMessage write failed:', err); }
    };
    _session.on(window, 'message', lsMsgHandler);
  }

  if (url && url.endsWith('.swf')) {
    try {
      await injectRuffle();
      const ruffle = window.RufflePlayer.newest();
      const player = ruffle.createPlayer();
      player.className = 'game-player';
      document.body.appendChild(player);
      await enableRuffleSave(player, config);
      player.load(url);
    } catch (e) {
      console.error('Ruffle error:', e);
      alert('Could not run Flash game.');
      closeGame();
    }
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.className = 'game-player';
  iframe.src = url;
  iframe.allow = "autoplay; fullscreen; gamepad; microphone; camera";
  iframe.sandbox = "allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-modals";
  document.body.appendChild(iframe);
}

function closeGame() {
  document.querySelectorAll('.game-player, .game-back-bar').forEach(el => el.remove());
  _session.teardown();
  if (panel) panel.style.display = '';
}

function createTitleBar() {
  const bar = document.createElement('div');
  bar.className = 'title-bar';

  const left = document.createElement('div');
  left.className = 'title-bar-left';

  const logo = document.createElement('img');
  logo.className = 'title-bar-logo';
  logo.src = '../assets/Zephware.png';
  left.appendChild(logo);

  const title = document.createElement('div');
  title.className = 'title-bar-title';
  title.textContent = 'Zephware';
  left.appendChild(title);

  const searchBar = document.createElement('input');
  searchBar.className = 'title-bar-search';
  searchBar.type = 'text';
  searchBar.placeholder = 'Search games...';

  const right = document.createElement('div');
  right.className = 'title-bar-right';

  const buttons = [
    {
      title: 'Zephware',
      svg: '<svg viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>',
      handler: () => { window.location.href = ZEPHWARE_URL; }
    },
    {
      title: 'Random',
      svg: '<svg viewBox="0 0 24 24"><path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm0 4c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm6 12H6v-1.4c0-2 4-3.1 6-3.1s6 1.1 6 3.1V19z"/></svg>',
      handler: rollGame
    },
    {
      title: 'Tags',
      svg: '<svg viewBox="0 0 24 24"><path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/></svg>',
      handler: showTagsModal
    },
    {
      title: 'Report',
      svg: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
      handler: showReportModal
    },
    {
      title: 'Settings',
      svg: '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>',
      handler: createSettingsPanel
    }
  ];

  buttons.forEach(btn => {
    const button = document.createElement('button');
    button.className = 'icon-button';
    button.title = btn.title;
    button.innerHTML = btn.svg;
    button.onclick = btn.handler;
    right.appendChild(button);
  });

  bar.appendChild(left);
  bar.appendChild(searchBar);
  bar.appendChild(right);

  bar._searchBar = searchBar;
  return bar;
}

function renderGames(configs) {
  const container = document.querySelector('.game-grid');
  if (!container) return;

  container.innerHTML = '';

  configs.forEach(config => {
    const card = document.createElement('button');
    card.className = 'game-card';

    const img = document.createElement('img');
    img.className = 'game-card-image';
    img.src = config.image;
    img.alt = config.label || '';
    card.appendChild(img);

    const label = document.createElement('div');
    label.className = 'game-card-label';
    label.textContent = config.label || '';
    card.appendChild(label);

    card.addEventListener('click', () => {
      setRoute(slugMap.get(config) || '');
    });

    container.appendChild(card);
  });
}

function showTagsModal() {
  if (document.querySelector('.modal-overlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '×';
  closeBtn.onclick = () => overlay.remove();
  modal.appendChild(closeBtn);

  const title = document.createElement('div');
  title.className = 'modal-title';
  title.textContent = 'Filter by Tag';
  modal.appendChild(title);

  const tagsContainer = document.createElement('div');
  tagsContainer.className = 'tags-container';

  const tags = ['Simulator', 'Fighting', 'RPG', 'Puzzle', 'Action', 'Strategy'];
  tags.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'tag-button';
    if (activeTag === tag) btn.classList.add('active');
    btn.textContent = tag;
    btn.onclick = () => {
      activeTag = activeTag === tag ? null : tag;
      const filtered = buttonConfigs.filter(cfg =>
        !cfg.highlighted &&
        (!activeTag || (Array.isArray(cfg.tag) ? cfg.tag.includes(activeTag) : cfg.tag === activeTag))
      );
      window.zwRenderGames?.(filtered);
      overlay.remove();
    };
    tagsContainer.appendChild(btn);
  });

  modal.appendChild(tagsContainer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

function rollGame() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal roller-modal';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '×';
  closeBtn.onclick = () => overlay.remove();
  modal.appendChild(closeBtn);

  let currentIdx = Math.floor(Math.random() * buttonConfigs.length);
  let cycles = 0;

  const gameBtn = document.createElement('button');
  gameBtn.className = 'roller-game';

  const img = document.createElement('img');
  img.className = 'roller-image';
  gameBtn.appendChild(img);

  const label = document.createElement('div');
  label.className = 'roller-label';
  gameBtn.appendChild(label);

  function updateGame() {
    const cfg = buttonConfigs[currentIdx];
    img.src = cfg.image;
    label.textContent = cfg.label || '';
  }

  updateGame();

  const interval = setInterval(() => {
    currentIdx = Math.floor(Math.random() * buttonConfigs.length);
    updateGame();
    if (++cycles >= 30) {
      clearInterval(interval);
      gameBtn.onclick = () => {
        overlay.remove();
        setRoute(slugMap.get(buttonConfigs[currentIdx]) || '');
      };
    }
  }, 100);

  modal.appendChild(gameBtn);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

function showReportModal() {
  if (document.querySelector('.modal-overlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal report-modal';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '×';
  closeBtn.onclick = () => overlay.remove();
  modal.appendChild(closeBtn);

  const title = document.createElement('div');
  title.className = 'modal-title';
  title.textContent = 'Report / Suggest';
  modal.appendChild(title);

  modal.innerHTML += `
    <div class="report-form">
      <div class="report-form-group">
        <label>Your Name (Optional)</label>
        <input type="text" id="report-name" placeholder="Anonymous">
      </div>
      <div class="report-form-group">
        <label>Type</label>
        <select id="report-type">
          <option value="Bug Report">Bug Report</option>
          <option value="Suggestion">Suggestion</option>
          <option value="Missing Game">Missing Game</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div class="report-form-group">
        <label>Title</label>
        <input type="text" id="report-title" placeholder="Brief title...">
      </div>
      <div class="report-form-group">
        <label>Details</label>
        <textarea id="report-details" rows="4" placeholder="Describe the issue or suggestion..."></textarea>
      </div>
      <button class="report-submit-btn" id="report-submit">Submit</button>
      <div id="report-message"></div>
    </div>
  `;

  modal.querySelector('.modal-close').onclick = () => overlay.remove();

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  modal.querySelector('#report-submit').addEventListener('click', async () => {
    const name    = modal.querySelector('#report-name').value.trim() || 'Anonymous';
    const type    = modal.querySelector('#report-type').value;
    const rtitle  = modal.querySelector('#report-title').value.trim();
    const details = modal.querySelector('#report-details').value.trim();
    const msgEl   = modal.querySelector('#report-message');

    if (!rtitle || !details) {
      msgEl.style.color = '#ff6b6b';
      msgEl.textContent = 'Please fill in the title and details.';
      return;
    }

    const submitBtn = modal.querySelector('#report-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    const payload = {
      embeds: [{
        title: `${type}: ${rtitle}`,
        color: type === 'Bug Report' ? 0xff4444 : type === 'Suggestion' ? 0x4488ff : 0xffaa00,
        fields: [
          { name: 'Submitted By', value: name, inline: true },
          { name: 'Type', value: type, inline: true },
          { name: 'Details', value: details }
        ],
        footer: { text: 'Zephware Games' },
        timestamp: new Date().toISOString()
      }]
    };

    try {
      const res = await fetch(DISCORD_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        msgEl.style.color = '#4ade80';
        msgEl.textContent = 'Submitted! Thank you.';
        modal.querySelector('#report-title').value = '';
        modal.querySelector('#report-details').value = '';
        setTimeout(() => overlay.remove(), 2000);
      } else {
        throw new Error('Bad response');
      }
    } catch {
      msgEl.style.color = '#ff6b6b';
      msgEl.textContent = 'Failed to send. Please try again.';
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit';
  });
}

function createSettingsPanel() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal settings-panel';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '×';
  closeBtn.onclick = () => overlay.remove();
  modal.appendChild(closeBtn);

  const title = document.createElement('div');
  title.className = 'modal-title';
  title.textContent = 'Settings';
  modal.appendChild(title);

  const content = document.createElement('div');
  content.className = 'settings-content';
  content.innerHTML = '<h3>Miscellaneous</h3><p>No settings available yet.</p>';
  modal.appendChild(content);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

function createPanel() {
  panel = document.createElement('div');
  panel.className = 'games-panel custom-scroll';

  const titleBar = createTitleBar();
  panel.appendChild(titleBar);

  const container = document.createElement('div');
  container.className = 'game-grid';
  panel.appendChild(container);

  let filteredConfigs = buttonConfigs.filter(cfg => !cfg.highlighted);

  titleBar._searchBar.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    filteredConfigs = buttonConfigs.filter(cfg =>
      !cfg.highlighted &&
      cfg.label?.toLowerCase().includes(query) &&
      (!activeTag || (Array.isArray(cfg.tag) ? cfg.tag.includes(activeTag) : cfg.tag === activeTag))
    );
    renderGames(filteredConfigs);
  });

  window.zwRenderGames = renderGames;
  document.body.appendChild(panel);
  renderGames(filteredConfigs);
}

function loadGameList() {
    const base = window.ZW_BASE_URL || '';
    fetch(base + 'data/gamelist.json')
    .then(response => response.json())
    .then(data => {
      buttonConfigs = data;
      buildSlugMaps(data);
      data.slice(0, 10).forEach(cfg => {
        if (cfg.image) preloadImage(cfg.image);
      });
      createPanel();

      window.addEventListener('hashchange', handleRouteChange);
      const initialRoute = getRoute();
      if (initialRoute) {
        handleRouteChange();
      }
    })
    .catch(error => {
      console.error('Error loading game list:', error);
      alert('Failed to load games. Please try again.');
    });
}

loadGameList();