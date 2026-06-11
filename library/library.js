(function () {
  const moviesUrl = "data/movies.json";
  const showsUrl = "data/shows.json";
  const soundsUrl = "data/sounds.json";
  const DISCORD_WEBHOOK = "https://discord.com/api/webhooks/1486107640806375535/lccT2x8NgVlaWRBmgZap8qMrrb1-fgbCFCNKJVF_dQUvH4KgZwzoSCkutSFpQtCRXx8K";
  const base = window.location.href.replace(/\/[^\/]*$/, '/');

  const navbar = document.getElementById('zw-navbar');
  const content = document.getElementById('zw-content');
  const navLinks = navbar.querySelectorAll('.zw-nav-link');
  const navSearchInput = navbar.querySelector('#zw-search');
  const logo = navbar.querySelector('#zw-logo');

  let movies = [];
  let shows = [];
  let sounds = [];
  let currentPage = 'home';
  let searchQuery = '';
  let activeTag = '';
  let sortOrder = 'default';
  let watchProgress = {};
  let myList = [];
  let settings = {};

  const THEME_VARS = {
    default: {
      '--blue': '#3b82f6',
      '--blue-dim': 'rgba(59,130,246,0.12)',
      '--blue-border': 'rgba(59,130,246,0.35)',
      '--bg': '#111111',
      '--surface': '#1a1a1a',
      '--surface2': '#222222',
      '--border': '#2a2a2a',
      '--text': '#e8e8e8',
      '--text-dim': '#aaaaaa',
      '--muted': '#666666',
    },
    netflix: {
      '--blue': '#e50914',
      '--blue-dim': 'rgba(229,9,20,0.12)',
      '--blue-border': 'rgba(229,9,20,0.35)',
      '--bg': '#141414',
      '--surface': '#1f1f1f',
      '--surface2': '#2a2a2a',
      '--border': '#333333',
      '--text': '#ffffff',
      '--text-dim': '#b3b3b3',
      '--muted': '#777777',
    },
    purple: {
      '--blue': '#a855f7',
      '--blue-dim': 'rgba(168,85,247,0.12)',
      '--blue-border': 'rgba(168,85,247,0.35)',
      '--bg': '#0d0d1a',
      '--surface': '#16162a',
      '--surface2': '#1e1e35',
      '--border': '#2a2a40',
      '--text': '#e8e0ff',
      '--text-dim': '#9d8fcc',
      '--muted': '#5a5080',
    },
    neon: {
      '--blue': '#00ff9f',
      '--blue-dim': 'rgba(0,255,159,0.10)',
      '--blue-border': 'rgba(0,255,159,0.30)',
      '--bg': '#080810',
      '--surface': '#0f0f1c',
      '--surface2': '#161625',
      '--border': '#1a1a30',
      '--text': '#e0ffe8',
      '--text-dim': '#7affb0',
      '--muted': '#3a6a50',
    },
    ocean: {
      '--blue': '#0ea5e9',
      '--blue-dim': 'rgba(14,165,233,0.12)',
      '--blue-border': 'rgba(14,165,233,0.35)',
      '--bg': '#040d18',
      '--surface': '#091525',
      '--surface2': '#0d1e33',
      '--border': '#132840',
      '--text': '#d0eaff',
      '--text-dim': '#7aaece',
      '--muted': '#385070',
    },
    amoled: {
      '--blue': '#ffffff',
      '--blue-dim': 'rgba(255,255,255,0.07)',
      '--blue-border': 'rgba(255,255,255,0.2)',
      '--bg': '#000000',
      '--surface': '#0a0a0a',
      '--surface2': '#111111',
      '--border': '#1a1a1a',
      '--text': '#ffffff',
      '--text-dim': '#aaaaaa',
      '--muted': '#555555',
    },
  };

  const DEFAULT_SETTINGS = {
    theme: 'default',
    autoplay: true,
    continueWatchingDays: 30,
    showProgressOnCards: true,
    cardHoverEffect: true,
    compactCards: false,
    showDuration: true,
    homeHero: true,
  };

  // ── LOAD DATA ──
  try { const s = localStorage.getItem('zw-watch-progress'); if (s) watchProgress = JSON.parse(s); } catch (e) {}
  try { const s = localStorage.getItem('zw-my-list'); if (s) myList = JSON.parse(s); } catch (e) {}
  try { const s = localStorage.getItem('zw-settings'); if (s) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(s) }; else settings = { ...DEFAULT_SETTINGS }; } catch (e) { settings = { ...DEFAULT_SETTINGS }; }

  applyTheme(settings.theme || 'default');

  function saveSettings() {
    try { localStorage.setItem('zw-settings', JSON.stringify(settings)); } catch (e) {}
  }

  function applyTheme(theme) {
    settings.theme = theme;
    const vars = THEME_VARS[theme] || THEME_VARS.default;
    const root = document.documentElement;
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
    document.querySelectorAll('.zw-theme-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.theme === theme);
    });
  }

  function saveWatchProgress() {
    try { localStorage.setItem('zw-watch-progress', JSON.stringify(watchProgress)); } catch (e) {}
  }

  window.addEventListener('storage', function (e) {
    if (e.key === 'zw-watch-progress') {
      try { watchProgress = e.newValue ? JSON.parse(e.newValue) : {}; } catch (e) { watchProgress = {}; }
      if (currentPage === 'home') renderPage();
    }
    if (e.key === 'zw-my-list') {
      try { myList = e.newValue ? JSON.parse(e.newValue) : []; } catch (e) { myList = []; }
      if (currentPage === 'home') renderPage();
    }
  });

  function saveMyList() {
    try { localStorage.setItem('zw-my-list', JSON.stringify(myList)); } catch (e) {}
  }

  function getItemId(item) {
    return item.name.replace(/\s+/g, '-').toLowerCase();
  }

  function findItemInList(id) {
    return shows.find(s => getItemId(s) === id) || movies.find(m => getItemId(m) === id);
  }

  function parseEpisodeRange(eps) {
    if (typeof eps === 'number') return { start: 1, end: eps };
    if (typeof eps === 'string' && eps.includes('-')) {
      const parts = eps.split('-').map(p => parseInt(p.trim()));
      return { start: parts[0], end: parts[1] };
    }
    return { start: 1, end: 0 };
  }

  function getTotalEpisodes(seasons) {
    return seasons.reduce((sum, s) => {
      const r = parseEpisodeRange(s.episodes);
      return sum + (r.end - r.start + 1);
    }, 0);
  }

  function getLastEpisodeInfo(show) {
    const lastSeason = show.seasons[show.seasons.length - 1];
    const range = parseEpisodeRange(lastSeason.episodes);
    return { season: lastSeason, episodeNum: range.end };
  }

  function isWatchAgain(show) {
    const id = getItemId(show);
    const progress = watchProgress[id];
    if (!progress || !progress.time) return false;
    const { season: lastSeason, episodeNum: lastEpisodeNum } = getLastEpisodeInfo(show);
    const seasonName = typeof lastSeason.season === 'string'
      ? lastSeason.season
      : (lastSeason.sname || 'Season ' + lastSeason.season);
    if (progress.season !== seasonName || progress.episode !== lastEpisodeNum) return false;
    const dur = progress.duration || (42 * 60);
    return (dur - progress.time) < 120;
  }

  function isMovieWatchAgain(movie) {
    const id = getItemId(movie);
    const progress = watchProgress[id];
    if (!progress || !progress.time) return false;
    const dur = progress.duration || (movie.duration ? movie.duration * 60 : 7200);
    return (dur - progress.time) < 300;
  }

  function openMovieModal(movie) {
    const movieId = getItemId(movie);
    const progress = watchProgress[movieId];
    let url = `${base}/watch.svg?id=` + movieId;
    if (progress && progress.isDub) url += '&audio=dub';
    window.location.href = url;
  }

  function openShowModal(show) {
    const showId = getItemId(show);
    const progress = watchProgress[showId];
    let url = `${base}/watch.svg?id=` + showId;
    if (progress && progress.season) {
      url += '&season=' + encodeURIComponent(progress.season);
      if (progress.episode) url += '&episode=' + progress.episode;
      if (progress.isDub) url += '&audio=dub';
    }
    window.location.href = url;
  }

  // ── SMART SEARCH
  function matchesSearch(name, query) {
    if (!query) return true;
    const q = query.toLowerCase().trim();
    const n = name.toLowerCase();
    if (n.includes(q)) return true;
    const words = n.split(/[\s\-_:]+/);
    const acronym = words.map(w => w[0] || '').join('');
    if (acronym.startsWith(q) || acronym.includes(q)) return true;
    if (q.length >= 2) {
      let ci = 0;
      for (let wi = 0; wi < words.length && ci < q.length; wi++) {
        if (words[wi].startsWith(q[ci])) ci++;
      }
      if (ci === q.length) return true;
    }
    return false;
  }

  function filterContent(items) {
    let filtered = items;
    if (searchQuery) {
      filtered = filtered.filter(item => matchesSearch(item.name, searchQuery));
    }
    if (activeTag) {
      filtered = filtered.filter(item => {
        const tags = Array.isArray(item.tags) ? item.tags : (item.tags ? [item.tags] : []);
        return tags.includes(activeTag);
      });
    }
    if (sortOrder === 'az') filtered = filtered.slice().sort((a, b) => a.name.localeCompare(b.name));
    else if (sortOrder === 'za') filtered = filtered.slice().sort((a, b) => b.name.localeCompare(a.name));
    return filtered;
  }

  function getTagsFor(items) {
    const all = items.flatMap(i => Array.isArray(i.tags) ? i.tags : (i.tags ? [i.tags] : []));
    return [...new Set(all)].sort();
  }

  // ── DURATION ──
  function fmtSeconds(secs) {
    if (!secs || secs <= 0) return null;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    return m + ':' + String(s).padStart(2, '0');
  }

  function fmtDuration(duration) {
    if (!duration) return null;
    const h = Math.floor(duration / 60), m = duration % 60;
    return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
  }

  async function calculateMovieDuration(movie) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.crossOrigin = 'anonymous';
      let done = false;
      const finish = (val) => { if (!done) { done = true; resolve(val); } };
      video.addEventListener('loadedmetadata', () => finish(Math.round(video.duration / 60)));
      video.addEventListener('error', () => finish(null));
      setTimeout(() => finish(null), 8000);
      video.src = movie.url;
    });
  }

  async function loadMovieDurations() {
    let durations = {};
    try { const c = localStorage.getItem('zw-movie-durations'); if (c) durations = JSON.parse(c); } catch (e) {}
    for (const movie of movies) {
      const id = getItemId(movie);
      if (durations[id]) {
        movie.duration = durations[id];
        updateMovieCardMeta(id, fmtDuration(durations[id]));
      } else if (!movie.duration) {
        const dur = await calculateMovieDuration(movie);
        if (dur) {
          movie.duration = dur;
          durations[id] = dur;
          updateMovieCardMeta(id, fmtDuration(dur));
        }
      } else {
        updateMovieCardMeta(id, fmtDuration(movie.duration));
      }
    }
    try { localStorage.setItem('zw-movie-durations', JSON.stringify(durations)); } catch (e) {}
  }

  function updateMovieCardMeta(id, text) {
    document.querySelectorAll('[data-movie-id="' + id + '"]').forEach(card => {
      const el = card.querySelector('.zw-card-meta');
      if (el && text) el.textContent = text;
    });
  }

  // ── LIST TOGGLE ──
  function toggleMyList(id, btn) {
    const idx = myList.indexOf(id);
    if (idx === -1) {
      myList.push(id);
      if (btn) {
        btn.textContent = '✓';
        btn.classList.add('in-list');
        btn.title = 'Remove from list';
      }
    } else {
      myList.splice(idx, 1);
      if (btn) {
        btn.textContent = '+';
        btn.classList.remove('in-list');
        btn.title = 'Add to list';
      }
    }
    saveMyList();
    document.querySelectorAll('[data-list-id="' + id + '"]').forEach(b => {
      if (b === btn) return;
      const inList = myList.includes(id);
      b.textContent = inList ? '✓' : '+';
      b.classList.toggle('in-list', inList);
      b.title = inList ? 'Remove from list' : 'Add to list';
    });
  }

  // ── REMOVE PROGRESS ──
  function removeItemProgress(id) {
    delete watchProgress[id];
    saveWatchProgress();
    document.querySelectorAll('[data-cw-id="' + id + '"]').forEach(card => {
      card.style.transition = 'opacity 0.3s, transform 0.3s';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.9)';
      setTimeout(() => {
        const row = card.parentElement;
        card.remove();
        if (row && row.querySelectorAll('.zw-card').length === 0) {
          const section = row.closest('.zw-section');
          if (section) {
            section.style.transition = 'opacity 0.3s';
            section.style.opacity = '0';
            setTimeout(() => section.remove(), 300);
          }
        }
      }, 300);
    });
    document.querySelectorAll('[data-movie-id="' + id + '"], [data-show-id="' + id + '"]').forEach(card => {
      const bar = card.querySelector('.zw-progress-bar');
      if (bar) bar.remove();
      const label = card.querySelector('.zw-card-progress-label');
      if (label) label.remove();
    });
  }

  // ── CARD CREATION ──
  function createMovieCard(movie, options = {}) {
    const card = document.createElement('div');
    card.className = 'zw-card' + (settings.compactCards ? ' compact' : '');
    const id = getItemId(movie);
    card.dataset.movieId = id;
    if (options.isContinueWatching) card.dataset.cwId = id;

    const progress = watchProgress[id];
    let progressPct = 0;
    let progressTimeLabel = '';
    if (progress && progress.time > 5) {
      const totalSecs = progress.duration || (movie.duration ? movie.duration * 60 : 0);
      if (totalSecs > 0) {
        progressPct = Math.min(98, Math.round((progress.time / totalSecs) * 100));
        if (settings.showProgressOnCards && options.isContinueWatching) {
          progressTimeLabel = fmtSeconds(progress.time) + ' / ' + fmtSeconds(totalSecs);
        }
      }
    }

    const inList = myList.includes(id);
    const dur = fmtDuration(movie.duration);

    let progressBar = progressPct > 0
      ? '<div class="zw-progress-bar"><div class="zw-progress-fill" style="width:' + progressPct + '%"></div></div>'
      : '';

    let progressLabel = (progressTimeLabel && options.isContinueWatching)
      ? '<div class="zw-card-progress-label">' + progressTimeLabel + '</div>'
      : '';

    let removeBtn = options.isContinueWatching
      ? '<button class="zw-remove-progress-btn" title="Remove from continue watching" data-id="' + id + '">✕</button>'
      : '';

    card.innerHTML =
      '<div class="zw-card-thumb"' + (movie.cover ? ' style="background-image:url(\'' + movie.cover + '\')"' : '') + '>' +
        (!movie.cover ? '<span class="zw-card-emoji">🎬</span>' : '') +
        '<div class="zw-card-overlay"><button class="zw-card-play-btn" aria-label="Play">▶</button></div>' +
        progressBar + progressLabel + removeBtn +
        '<button class="zw-list-btn' + (inList ? ' in-list' : '') + '" data-list-id="' + id + '" title="' + (inList ? 'Remove from list' : 'Add to list') + '">' + (inList ? '✓' : '+') + '</button>' +
      '</div>' +
      '<div class="zw-card-info">' +
        '<div class="zw-card-title">' + movie.name + '</div>' +
        '<div class="zw-card-meta">' + (dur || '—') + '</div>' +
      '</div>';

    card.querySelector('.zw-card-play-btn').addEventListener('click', (e) => { e.stopPropagation(); openMovieModal(movie); });
    card.querySelector('.zw-list-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleMyList(id, e.currentTarget); });
    card.addEventListener('click', () => openMovieModal(movie));

    if (options.isContinueWatching) {
      const rmBtn = card.querySelector('.zw-remove-progress-btn');
      if (rmBtn) {
        rmBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          removeItemProgress(id);
        });
      }
    }

    return card;
  }

  function createShowCard(show, options = {}) {
    const card = document.createElement('div');
    card.className = 'zw-card' + (settings.compactCards ? ' compact' : '');
    const id = getItemId(show);
    card.dataset.showId = id;
    if (options.isContinueWatching) card.dataset.cwId = id;

    const total = getTotalEpisodes(show.seasons);
    const progress = watchProgress[id];
    const inList = myList.includes(id);

    let progressLabel = '';
    let progressTimeLabel = '';
    let removeBtn = '';

    if (progress && !isWatchAgain(show)) {
      if (options.isContinueWatching && settings.showProgressOnCards) {
        const totalSecs = progress.duration || 0;
        const currentSecs = progress.time || 0;
        if (totalSecs > 0 && currentSecs > 5) {
          progressTimeLabel = fmtSeconds(currentSecs) + ' / ' + fmtSeconds(totalSecs);
          progressLabel = '<div class="zw-card-progress-label">' + progressTimeLabel + '</div>';
        } else {
          progressLabel = '<div class="zw-card-progress-label">↳ S:' + progress.season + ' E' + progress.episode + '</div>';
        }
      } else if (progress.season && progress.episode) {
        progressLabel = '<div class="zw-card-progress-label">↳ S:' + progress.season + ' E' + progress.episode + '</div>';
      }
    }

    if (options.isContinueWatching) {
      removeBtn = '<button class="zw-remove-progress-btn" title="Remove from continue watching" data-id="' + id + '">✕</button>';
    }

    card.innerHTML =
      '<div class="zw-card-thumb"' + (show.cover ? ' style="background-image:url(\'' + show.cover + '\')"' : '') + '>' +
        (!show.cover ? '<span class="zw-card-emoji">📺</span>' : '') +
        '<div class="zw-card-overlay"><button class="zw-card-play-btn" aria-label="Play">▶</button></div>' +
        progressLabel + removeBtn +
        '<button class="zw-list-btn' + (inList ? ' in-list' : '') + '" data-list-id="' + id + '" title="' + (inList ? 'Remove from list' : 'Add to list') + '">' + (inList ? '✓' : '+') + '</button>' +
      '</div>' +
      '<div class="zw-card-info">' +
        '<div class="zw-card-title">' + show.name + '</div>' +
        '<div class="zw-card-meta">' + show.seasons.length + ' Season' + (show.seasons.length > 1 ? 's' : '') + ' · ' + total + ' Ep</div>' +
      '</div>';

    card.querySelector('.zw-card-play-btn').addEventListener('click', (e) => { e.stopPropagation(); openShowModal(show); });
    card.querySelector('.zw-list-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleMyList(id, e.currentTarget); });
    card.addEventListener('click', () => openShowModal(show));

    if (options.isContinueWatching) {
      const rmBtn = card.querySelector('.zw-remove-progress-btn');
      if (rmBtn) {
        rmBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          removeItemProgress(id);
        });
      }
    }

    return card;
  }

  function createSoundCard(sound) {
    const card = document.createElement('div');
    card.className = 'zw-sound-card';
    card.innerHTML = '<div class="zw-sound-icon">🔊</div><div class="zw-sound-title">' + sound.name + '</div>';
    let audio = null;
    card.addEventListener('click', () => {
      if (audio && !audio.paused) {
        audio.pause();
        audio.currentTime = 0;
        card.classList.remove('playing');
        return;
      }
      document.querySelectorAll('.zw-sound-card.playing').forEach(c => c.classList.remove('playing'));
      audio = new Audio(sound.url);
      audio.play();
      card.classList.add('playing');
      audio.addEventListener('ended', () => card.classList.remove('playing'));
    });
    return card;
  }

  // ── PAGE TOOLBAR ──
  function buildPageToolbar(items, placeholder) {
    const tags = getTagsFor(items);

    const toolbar = document.createElement('div');
    toolbar.className = 'zw-toolbar';

    toolbar.innerHTML =
      '<div class="zw-page-search-wrap">' +
        '<span class="zw-search-icon">⌕</span>' +
        '<input class="zw-page-search" type="search" placeholder="' + placeholder + '" value="' + (searchQuery || '') + '" autocomplete="off" />' +
        (searchQuery ? '<button class="zw-search-clear" aria-label="Clear">✕</button>' : '') +
      '</div>' +
      '<select class="zw-sort-select">' +
        '<option value="default"' + (sortOrder === 'default' ? ' selected' : '') + '>Default</option>' +
        '<option value="az"' + (sortOrder === 'az' ? ' selected' : '') + '>A → Z</option>' +
        '<option value="za"' + (sortOrder === 'za' ? ' selected' : '') + '>Z → A</option>' +
      '</select>';

    const pageSearch = toolbar.querySelector('.zw-page-search');
    pageSearch.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      navSearchInput.value = searchQuery;
      renderPage();
    });
    setTimeout(() => pageSearch.focus(), 50);

    const clearBtn = toolbar.querySelector('.zw-search-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      searchQuery = '';
      navSearchInput.value = '';
      renderPage();
    });

    toolbar.querySelector('.zw-sort-select').addEventListener('change', (e) => {
      sortOrder = e.target.value;
      renderPage();
    });

    content.appendChild(toolbar);

    if (tags.length > 0) {
      const tagRow = document.createElement('div');
      tagRow.className = 'zw-tag-row';

      ['All', ...tags].forEach(tag => {
        const btn = document.createElement('button');
        btn.className = 'zw-tag-btn' + ((tag === 'All' ? '' : tag) === activeTag ? ' active' : '');
        btn.textContent = tag;
        btn.addEventListener('click', () => {
          activeTag = tag === 'All' ? '' : (activeTag === tag ? '' : tag);
          renderPage();
        });
        tagRow.appendChild(btn);
      });

      content.appendChild(tagRow);
    }
  }

  // ── GRID RENDERERS ──
  function renderGrid(items, typeOrFn) {
    const filtered = filterContent(items);

    const meta = document.createElement('div');
    meta.className = 'zw-result-meta';
    meta.textContent = filtered.length === 0 ? 'No results' : filtered.length + ' result' + (filtered.length !== 1 ? 's' : '');
    content.appendChild(meta);

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'zw-empty-state';
      empty.innerHTML = '<div class="zw-empty-state-icon">🔍</div><div class="zw-empty-state-text">Nothing found — try a different search</div>';
      content.appendChild(empty);
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'zw-grid';
    filtered.forEach((item, idx) => {
      const type = typeof typeOrFn === 'function' ? typeOrFn(item) : (Array.isArray(typeOrFn) ? typeOrFn[idx] : typeOrFn);
      if (type === 'movie') grid.appendChild(createMovieCard(item));
      else if (type === 'show') grid.appendChild(createShowCard(item));
    });
    content.appendChild(grid);
  }

  function renderSoundsGrid(items) {
    const filtered = filterContent(items);

    const meta = document.createElement('div');
    meta.className = 'zw-result-meta';
    meta.textContent = filtered.length === 0 ? 'No results' : filtered.length + ' sound' + (filtered.length !== 1 ? 's' : '');
    content.appendChild(meta);

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'zw-empty-state';
      empty.innerHTML = '<div class="zw-empty-state-icon">🔍</div><div class="zw-empty-state-text">Nothing found</div>';
      content.appendChild(empty);
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'zw-sounds-grid';
    filtered.forEach(s => grid.appendChild(createSoundCard(s)));
    content.appendChild(grid);
  }

  // ── HOME ROW ──
  function renderHomeRow(title, items, types, options = {}) {
    if (!items.length) return;
    const section = document.createElement('div');
    section.className = 'zw-section';
    section.innerHTML =
      '<div class="zw-section-header">' +
        '<span class="zw-section-title">' + title + '</span>' +
        '<span class="zw-section-count">' + items.length + '</span>' +
      '</div>' +
      '<div class="zw-row-wrapper">' +
        '<button class="zw-scroll-arrow left" aria-label="Scroll left">‹</button>' +
        '<div class="zw-row"></div>' +
        '<button class="zw-scroll-arrow right" aria-label="Scroll right">›</button>' +
      '</div>';

    const row = section.querySelector('.zw-row');
    items.forEach((item, idx) => {
      const type = Array.isArray(types) ? types[idx] : types;
      if (type === 'movie') row.appendChild(createMovieCard(item, { isContinueWatching: options.isContinueWatching }));
      else if (type === 'show') row.appendChild(createShowCard(item, { isContinueWatching: options.isContinueWatching }));
    });
    section.querySelector('.zw-scroll-arrow.left').addEventListener('click', () => row.scrollBy({ left: -460, behavior: 'smooth' }));
    section.querySelector('.zw-scroll-arrow.right').addEventListener('click', () => row.scrollBy({ left: 460, behavior: 'smooth' }));
    content.appendChild(section);
  }

  function renderHomeSoundsRow(title, items) {
    if (!items.length) return;
    const section = document.createElement('div');
    section.className = 'zw-section';
    section.innerHTML =
      '<div class="zw-section-header">' +
        '<span class="zw-section-title">' + title + '</span>' +
        '<span class="zw-section-count">' + items.length + '</span>' +
      '</div>' +
      '<div class="zw-row-wrapper">' +
        '<button class="zw-scroll-arrow left" aria-label="Scroll left">‹</button>' +
        '<div class="zw-row zw-sound-row"></div>' +
        '<button class="zw-scroll-arrow right" aria-label="Scroll right">›</button>' +
      '</div>';

    const row = section.querySelector('.zw-sound-row');
    items.forEach(s => row.appendChild(createSoundCard(s)));
    section.querySelector('.zw-scroll-arrow.left').addEventListener('click', () => row.scrollBy({ left: -320, behavior: 'smooth' }));
    section.querySelector('.zw-scroll-arrow.right').addEventListener('click', () => row.scrollBy({ left: 320, behavior: 'smooth' }));
    content.appendChild(section);
  }

  // ── CONTINUE WATCHING / WATCH AGAIN ──
  function getContinueWatching() {
    const watching = [];
    const now = Date.now();
    const days = (settings.continueWatchingDays || 30) * 24 * 60 * 60 * 1000;
    for (const [id, data] of Object.entries(watchProgress)) {
      if (!data.timestamp || now - data.timestamp > days) continue;
      if (!data.time || data.time < 5) continue;
      const item = findItemInList(id);
      if (!item) continue;
      if (item.seasons) {
        if (!isWatchAgain(item)) watching.push({ type: 'show', item });
      } else {
        if (!isMovieWatchAgain(item)) watching.push({ type: 'movie', item });
      }
    }
    return watching.sort((a, b) => (watchProgress[getItemId(b.item)].timestamp || 0) - (watchProgress[getItemId(a.item)].timestamp || 0));
  }

  function getWatchAgain() {
    const wa = [];
    shows.filter(s => isWatchAgain(s)).forEach(s => wa.push({ type: 'show', item: s }));
    movies.filter(m => isMovieWatchAgain(m)).forEach(m => wa.push({ type: 'movie', item: m }));
    return wa.sort((a, b) => (watchProgress[getItemId(b.item)].timestamp || 0) - (watchProgress[getItemId(a.item)].timestamp || 0));
  }

  function getMyListItems() {
    return myList.map(id => findItemInList(id)).filter(Boolean);
  }

  // ── SETTINGS PAGE ──
  function renderSettingsPage() {
    content.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.id = 'zw-settings-page';

    const themeNames = { default: 'Default', netflix: 'Netflix Red', purple: 'Purple', neon: 'Neon Green', ocean: 'Ocean Blue', amoled: 'AMOLED' };
    const themeColors = { default: '#3b82f6', netflix: '#e50914', purple: '#a855f7', neon: '#00ff9f', ocean: '#0ea5e9', amoled: '#ffffff' };

    wrap.innerHTML =
      '<h1 class="zw-settings-title">Settings</h1>' +

      '<div class="zw-settings-section">' +
        '<div class="zw-settings-section-title">Appearance</div>' +

        '<div class="zw-settings-row">' +
          '<div class="zw-settings-label">Theme</div>' +
          '<div class="zw-theme-chips">' +
            Object.entries(themeNames).map(([key, label]) =>
              '<button class="zw-theme-chip' + (settings.theme === key ? ' active' : '') + '" data-theme="' + key + '">' +
                '<span class="zw-theme-dot" style="background:' + themeColors[key] + '"></span>' +
                label +
              '</button>'
            ).join('') +
          '</div>' +
        '</div>' +

        '<div class="zw-settings-row">' +
          '<div>' +
            '<div class="zw-settings-label">Compact Cards</div>' +
            '<div class="zw-settings-desc">Make cards slightly smaller to fit more on screen</div>' +
          '</div>' +
          '<label class="zw-toggle"><input type="checkbox" id="set-compact" ' + (settings.compactCards ? 'checked' : '') + '><span class="zw-toggle-slider"></span></label>' +
        '</div>' +

        '<div class="zw-settings-row">' +
          '<div>' +
            '<div class="zw-settings-label">Card Hover Effects</div>' +
            '<div class="zw-settings-desc">Animate cards on hover</div>' +
          '</div>' +
          '<label class="zw-toggle"><input type="checkbox" id="set-hover" ' + (settings.cardHoverEffect !== false ? 'checked' : '') + '><span class="zw-toggle-slider"></span></label>' +
        '</div>' +

        '<div class="zw-settings-row">' +
          '<div>' +
            '<div class="zw-settings-label">Show Hero Banner</div>' +
            '<div class="zw-settings-desc">Display the featured banner on the home page</div>' +
          '</div>' +
          '<label class="zw-toggle"><input type="checkbox" id="set-hero" ' + (settings.homeHero !== false ? 'checked' : '') + '><span class="zw-toggle-slider"></span></label>' +
        '</div>' +
      '</div>' +

      '<div class="zw-settings-section">' +
        '<div class="zw-settings-section-title">Playback</div>' +

        '<div class="zw-settings-row">' +
          '<div>' +
            '<div class="zw-settings-label">Autoplay Next Episode</div>' +
            '<div class="zw-settings-desc">Automatically play the next episode when one ends</div>' +
          '</div>' +
          '<label class="zw-toggle"><input type="checkbox" id="set-autoplay" ' + (settings.autoplay !== false ? 'checked' : '') + '><span class="zw-toggle-slider"></span></label>' +
        '</div>' +

        '<div class="zw-settings-row">' +
          '<div>' +
            '<div class="zw-settings-label">Show Progress Time on Cards</div>' +
            '<div class="zw-settings-desc">Show watched/total time on Continue Watching cards (e.g. 1:38 / 2:13)</div>' +
          '</div>' +
          '<label class="zw-toggle"><input type="checkbox" id="set-progress" ' + (settings.showProgressOnCards !== false ? 'checked' : '') + '><span class="zw-toggle-slider"></span></label>' +
        '</div>' +

        '<div class="zw-settings-row">' +
          '<div>' +
            '<div class="zw-settings-label">Continue Watching History</div>' +
            '<div class="zw-settings-desc">How many days to keep items in Continue Watching</div>' +
          '</div>' +
          '<select class="zw-sort-select" id="set-cw-days">' +
            [7, 14, 30, 60, 90].map(d => '<option value="' + d + '"' + (settings.continueWatchingDays === d ? ' selected' : '') + '>' + d + ' days</option>').join('') +
          '</select>' +
        '</div>' +
      '</div>' +

      '<div class="zw-settings-section">' +
        '<div class="zw-settings-section-title">Data</div>' +
        '<div class="zw-settings-row">' +
          '<div>' +
            '<div class="zw-settings-label">Clear Watch History</div>' +
            '<div class="zw-settings-desc">Remove all Continue Watching progress</div>' +
          '</div>' +
          '<button class="zw-danger-btn" id="set-clear-progress">Clear History</button>' +
        '</div>' +
        '<div class="zw-settings-row">' +
          '<div>' +
            '<div class="zw-settings-label">Clear My List</div>' +
            '<div class="zw-settings-desc">Remove all items from My List</div>' +
          '</div>' +
          '<button class="zw-danger-btn" id="set-clear-list">Clear List</button>' +
        '</div>' +
        '<div class="zw-settings-row">' +
          '<div>' +
            '<div class="zw-settings-label">Reset All Settings</div>' +
            '<div class="zw-settings-desc">Restore all settings to defaults</div>' +
          '</div>' +
          '<button class="zw-danger-btn" id="set-reset">Reset Settings</button>' +
        '</div>' +
      '</div>';

    content.appendChild(wrap);

    // Theme Chips
    wrap.querySelectorAll('.zw-theme-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        applyTheme(btn.dataset.theme);
        saveSettings();
      });
    });

    // Toggles
    const bindToggle = (id, key) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => { settings[key] = el.checked; saveSettings(); });
    };
    bindToggle('set-compact', 'compactCards');
    bindToggle('set-hover', 'cardHoverEffect');
    bindToggle('set-hero', 'homeHero');
    bindToggle('set-autoplay', 'autoplay');
    bindToggle('set-progress', 'showProgressOnCards');

    const cwDays = document.getElementById('set-cw-days');
    if (cwDays) cwDays.addEventListener('change', () => { settings.continueWatchingDays = parseInt(cwDays.value); saveSettings(); });

    document.getElementById('set-clear-progress').addEventListener('click', () => {
      if (confirm('Clear all watch history?')) {
        watchProgress = {};
        saveWatchProgress();
        showSettingsToast('Watch history cleared');
      }
    });

    document.getElementById('set-clear-list').addEventListener('click', () => {
      if (confirm('Clear your entire list?')) {
        myList = [];
        saveMyList();
        showSettingsToast('My List cleared');
      }
    });

    document.getElementById('set-reset').addEventListener('click', () => {
      if (confirm('Reset all settings to defaults?')) {
        settings = { ...DEFAULT_SETTINGS };
        saveSettings();
        applyTheme(settings.theme);
        renderSettingsPage();
        showSettingsToast('Settings reset');
      }
    });
  }

  function showSettingsToast(msg) {
    let toast = document.getElementById('zw-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'zw-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('visible');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('visible'), 2500);
  }

  // ── MAIN RENDER ──
  function renderPage() {
    content.innerHTML = '';

    if (currentPage === 'home') {
      const highlighted = shows.find(s => s.highlighted === 'true' || s.highlighted === true);

      if (settings.homeHero !== false) {
        content.innerHTML =
          '<div id="zw-hero">' +
            (highlighted
              ? '<div class="zw-hero-banner" style="background-image:url(\'../assets/Banner.png\')">' +
                  '<div class="zw-hero-overlay"></div>' +
                  '<div class="zw-hero-content">' +
                    '<div class="zw-hero-badge">Featured</div>' +
                    '<h1 class="zw-hero-title">' + highlighted.name + '</h1>' +
                    '<div class="zw-hero-meta">' +
                      '<span>' + getTotalEpisodes(highlighted.seasons) + ' Episodes</span>' +
                      '<span class="zw-hero-separator">·</span>' +
                      '<span>' + highlighted.seasons.length + ' Season' + (highlighted.seasons.length > 1 ? 's' : '') + '</span>' +
                    '</div>' +
                    '<button class="zw-hero-play" id="zw-hero-play-btn">▶ Play</button>' +
                  '</div>' +
                '</div>'
              : '<div class="zw-hero-placeholder"><h1>Zephware</h1><p>Your streaming library</p></div>'
            ) +
          '</div>';

        if (highlighted) {
          content.querySelector('#zw-hero-play-btn').addEventListener('click', () => openShowModal(highlighted));
        }
      }

      const cw = getContinueWatching();
      if (cw.length) renderHomeRow('Continue Watching', cw.map(w => w.item), cw.map(w => w.type), { isContinueWatching: true });

      const wa = getWatchAgain();
      if (wa.length) renderHomeRow('Watch Again', wa.map(w => w.item), wa.map(w => w.type));

      const ml = getMyListItems();
      if (ml.length) renderHomeRow('My List', ml, ml.map(i => i.seasons ? 'show' : 'movie'));

      renderHomeRow('Shows', shows, shows.map(() => 'show'));
      renderHomeRow('Movies', movies, movies.map(() => 'movie'));
      if (sounds.length) renderHomeSoundsRow('Sounds', sounds);

    } else if (currentPage === 'movies') {
      buildPageToolbar(movies, 'Search movies…');
      renderGrid(movies, () => 'movie');
      loadMovieDurations();

    } else if (currentPage === 'shows') {
      buildPageToolbar(shows, 'Search shows…');
      renderGrid(shows, () => 'show');

    } else if (currentPage === 'sounds') {
      buildPageToolbar(sounds, 'Search sounds…');
      renderSoundsGrid(sounds);

    } else if (currentPage === 'settings') {
      renderSettingsPage();

    } else if (currentPage === 'suggestions') {
      content.innerHTML =
        '<div id="zw-suggestions">' +
          '<h1 class="zw-suggestions-title">Suggestions</h1>' +
          '<p class="zw-suggestions-desc">Have an idea for content you\'d like to see? Let us know!</p>' +
          '<form id="zw-suggestion-form">' +
            '<div class="zw-form-group"><label for="suggestion-name">Your Name</label><input type="text" id="suggestion-name" placeholder="Anonymous"></div>' +
            '<div class="zw-form-group"><label for="suggestion-type">Type</label><select id="suggestion-type" required><option value="">Select a type</option><option value="Movie">Movie</option><option value="Show">Show</option><option value="Sound">Sound</option><option value="Feature">Feature Request</option><option value="Bug">Bug Report</option><option value="Other">Other</option></select></div>' +
            '<div class="zw-form-group"><label for="suggestion-title">Title / Subject</label><input type="text" id="suggestion-title" placeholder="Brief title" required></div>' +
            '<div class="zw-form-group"><label for="suggestion-details">Details</label><textarea id="suggestion-details" rows="5" placeholder="Tell us more..." required></textarea></div>' +
            '<button type="submit" class="zw-submit-btn">Submit</button>' +
          '</form>' +
          '<div id="zw-form-message"></div>' +
        '</div>';

      const form = content.querySelector('#zw-suggestion-form');
      const message = content.querySelector('#zw-form-message');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = content.querySelector('#suggestion-name').value || 'Anonymous';
        const type = content.querySelector('#suggestion-type').value;
        const title = content.querySelector('#suggestion-title').value;
        const details = content.querySelector('#suggestion-details').value;
        const embed = { embeds: [{ title: 'New Suggestion: ' + title, color: 0x3b82f6, fields: [{ name: 'By', value: name, inline: true }, { name: 'Type', value: type, inline: true }, { name: 'Details', value: details }], timestamp: new Date().toISOString() }] };
        try {
          const res = await fetch(DISCORD_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(embed) });
          if (res.ok) { message.className = 'zw-form-success'; message.textContent = '✓ Submitted! Thanks.'; form.reset(); }
          else throw new Error();
        } catch { message.className = 'zw-form-error'; message.textContent = '✗ Failed to submit. Try again later.'; }
        setTimeout(() => { message.textContent = ''; message.className = ''; }, 5000);
      });
    }
  }

  // ── NAV EVENTS ──
  function setActivePage(page) {
    navLinks.forEach(l => l.classList.remove('active'));
    const link = navbar.querySelector('[data-page="' + page + '"]');
    if (link) link.classList.add('active');
    currentPage = page;
    searchQuery = '';
    activeTag = '';
    sortOrder = 'default';
    navSearchInput.value = '';
    renderPage();
  }

  navLinks.forEach(link => {
    link.addEventListener('click', () => setActivePage(link.dataset.page));
  });

  logo.addEventListener('click', () => window.location.href = '/index.html');

  // ── NAVBAR SEARCH ──
  navSearchInput.addEventListener('input', (e) => {
    const q = e.target.value;
    searchQuery = q;
    if (currentPage === 'home') {
      if (q.trim()) {
        currentPage = 'home-search';
        content.innerHTML = '';

        const allItems = [...shows.map(s => ({ item: s, type: 'show' })), ...movies.map(m => ({ item: m, type: 'movie' }))];
        const filtered = allItems.filter(({ item }) => matchesSearch(item.name, q));

        if (filtered.length === 0) {
          content.innerHTML = '<div class="zw-empty-state"><div class="zw-empty-state-icon">🔍</div><div class="zw-empty-state-text">Nothing found for "' + q + '"</div></div>';
        } else {
          const meta = document.createElement('div');
          meta.className = 'zw-result-meta';
          meta.textContent = filtered.length + ' result' + (filtered.length !== 1 ? 's' : '') + ' for "' + q + '"';
          content.appendChild(meta);

          const grid = document.createElement('div');
          grid.className = 'zw-grid';
          filtered.forEach(({ item, type }) => {
            if (type === 'movie') grid.appendChild(createMovieCard(item));
            else grid.appendChild(createShowCard(item));
          });
          content.appendChild(grid);
        }
      } else {
        currentPage = 'home';
        renderPage();
      }
    } else if (currentPage !== 'settings' && currentPage !== 'suggestions') {
      renderPage();
    }
  });

  // Settings Icon
  document.getElementById('zw-settings-btn').addEventListener('click', () => {
    setActivePage('settings');
  });

  // ── INIT ──
  Promise.all([
    fetch(moviesUrl).then(r => r.json()).catch(() => []),
    fetch(showsUrl).then(r => r.json()).catch(() => []),
    fetch(soundsUrl).then(r => r.json()).catch(() => [])
  ]).then(([moviesData, showsData, soundsData]) => {
    movies = moviesData;
    shows = showsData;
    sounds = soundsData;
    renderPage();
    loadMovieDurations();
  });
})();