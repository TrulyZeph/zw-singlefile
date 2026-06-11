(function() {
  const DATA_URL = `${base}data/`;
  const VAST_TAG_URL = '';
  const base = window.location.href.replace(/\/[^\/]*$/, '/');

  let currentItem = null;
  let currentType = null;
  let currentSeason = null;
  let currentSeasonIndex = 0;
  let currentEpisode = 1;
  let currentAudioType = 'sub';
  let watchProgress = {};
  let myList = [];
  let player = null;
  let isRemovingProgress = false;
  let playerSettings = { autoplay: true, resume: true };

  // Data Load
  try { const s = localStorage.getItem('zw-watch-progress'); if (s) watchProgress = JSON.parse(s); } catch (e) {}
  try { const s = localStorage.getItem('zw-my-list'); if (s) myList = JSON.parse(s); } catch (e) {}
  try { const s = localStorage.getItem('zw-player-settings'); if (s) playerSettings = { ...playerSettings, ...JSON.parse(s) }; } catch (e) {}

  // CSS Variable Theme Sync from Library Settings
  try {
    const settings = JSON.parse(localStorage.getItem('zw-settings') || '{}');
    const THEME_VARS = {
      default: { '--blue':'#3b82f6','--blue-dim':'rgba(59,130,246,0.12)','--blue-border':'rgba(59,130,246,0.35)','--bg':'#111111','--surface':'#1a1a1a','--surface2':'#222222','--border':'#2a2a2a','--text':'#e8e8e8','--text-dim':'#aaaaaa','--muted':'#666666' },
      netflix:  { '--blue':'#e50914','--blue-dim':'rgba(229,9,20,0.12)','--blue-border':'rgba(229,9,20,0.35)','--bg':'#141414','--surface':'#1f1f1f','--surface2':'#2a2a2a','--border':'#333333','--text':'#ffffff','--text-dim':'#b3b3b3','--muted':'#777777' },
      purple:   { '--blue':'#a855f7','--blue-dim':'rgba(168,85,247,0.12)','--blue-border':'rgba(168,85,247,0.35)','--bg':'#0d0d1a','--surface':'#16162a','--surface2':'#1e1e35','--border':'#2a2a40','--text':'#e8e0ff','--text-dim':'#9d8fcc','--muted':'#5a5080' },
      neon:     { '--blue':'#00ff9f','--blue-dim':'rgba(0,255,159,0.10)','--blue-border':'rgba(0,255,159,0.30)','--bg':'#080810','--surface':'#0f0f1c','--surface2':'#161625','--border':'#1a1a30','--text':'#e0ffe8','--text-dim':'#7affb0','--muted':'#3a6a50' },
      ocean:    { '--blue':'#0ea5e9','--blue-dim':'rgba(14,165,233,0.12)','--blue-border':'rgba(14,165,233,0.35)','--bg':'#040d18','--surface':'#091525','--surface2':'#0d1e33','--border':'#132840','--text':'#d0eaff','--text-dim':'#7aaece','--muted':'#385070' },
      amoled:   { '--blue':'#ffffff','--blue-dim':'rgba(255,255,255,0.07)','--blue-border':'rgba(255,255,255,0.2)','--bg':'#000000','--surface':'#0a0a0a','--surface2':'#111111','--border':'#1a1a1a','--text':'#ffffff','--text-dim':'#aaaaaa','--muted':'#555555' },
    };
    const vars = THEME_VARS[settings.theme || 'default'] || THEME_VARS.default;
    Object.entries(vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
  } catch (e) {}

  function saveWatchProgress() {
    try { localStorage.setItem('zw-watch-progress', JSON.stringify(watchProgress)); } catch (e) {}
  }

  function saveMyList() {
    try { localStorage.setItem('zw-my-list', JSON.stringify(myList)); } catch (e) {}
  }

  function savePlayerSettings() {
    try { localStorage.setItem('zw-player-settings', JSON.stringify(playerSettings)); } catch (e) {}
  }

  function getItemId(item) {
    return item.name.replace(/\s+/g, '-').toLowerCase();
  }

  function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      id: params.get('id'),
      season: params.get('season'),
      episode: params.get('episode'),
      audio: params.get('audio') || 'sub'
    };
  }

  function updateUrl(season, episode, audio) {
    const params = new URLSearchParams(window.location.search);
    if (season != null) params.set('season', season);
    if (episode != null) params.set('episode', episode);
    if (audio != null) params.set('audio', audio);
    window.history.replaceState({}, '', window.location.pathname + '?' + params.toString());
  }

  function parseEpisodeRange(eps) {
    if (typeof eps === 'number') return { start: 1, end: eps };
    if (typeof eps === 'string' && eps.includes('-')) {
      const parts = eps.split('-').map(p => parseInt(p.trim()));
      return { start: parts[0], end: parts[1] };
    }
    return { start: 1, end: 0 };
  }

  function getEpisodeOffset(seasons, idx) {
    if (!seasons[idx] || !seasons[idx].continue) return 0;
    let offset = 0;
    for (let i = 0; i < idx; i++) {
      const range = parseEpisodeRange(seasons[i].episodes);
      offset += (range.end - range.start + 1);
    }
    return offset;
  }

  function getSeasonStartEpisode(seasons, idx) {
    return getEpisodeOffset(seasons, idx) + 1;
  }

  function getSeasonName(season) {
    return typeof season.season === 'string'
      ? season.season
      : (season.sname || 'Season ' + season.season);
  }

  // ── SUBTITLE SUPPORT ──
  // Convert
  function convertToVtt(content, format) {
    if (format === 'vtt') return content;

    if (format === 'srt') {
      let vtt = 'WEBVTT\n\n';
      vtt += content
        .replace(/\r\n/g, '\n')
        .replace(/^\d+\n/gm, '')
        .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
        .replace(/<[^>]+>/g, '')
        .trim();
      return vtt;
    }

    if (format === 'ssa' || format === 'ass') {
      let vtt = 'WEBVTT\n\n';
      const lines = content.split('\n');
      let inEvents = false;
      let formatFields = [];
      let counter = 0;

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '[Events]') { inEvents = true; continue; }
        if (trimmed.startsWith('[') && inEvents) { inEvents = false; continue; }
        if (!inEvents) continue;

        if (trimmed.startsWith('Format:')) {
          formatFields = trimmed.replace('Format:', '').split(',').map(s => s.trim());
          continue;
        }

        if (trimmed.startsWith('Dialogue:')) {
          const values = trimmed.replace('Dialogue:', '').split(',');
          const obj = {};
          formatFields.forEach((f, i) => { obj[f] = values[i] !== undefined ? values[i].trim() : ''; });
          if (formatFields.length < values.length) {
            obj['Text'] = values.slice(formatFields.indexOf('Text')).join(',').trim();
          }

          const start = obj['Start'] ? obj['Start'].replace(/\./g, ':').replace(/:(\d{2})$/, '.$1').replace(/^(\d):/, '0$1:') : null;
          const end = obj['End'] ? obj['End'].replace(/\./g, ':').replace(/:(\d{2})$/, '.$1').replace(/^(\d):/, '0$1:') : null;
          let text = (obj['Text'] || '').replace(/{[^}]+}/g, '').replace(/\\N/g, '\n').replace(/\\n/g, '\n');

          if (start && end && text) {
            counter++;
            vtt += counter + '\n' + start + ' --> ' + end + '\n' + text + '\n\n';
          }
        }
      }
      return vtt;
    }

    return content;
  }

  async function fetchSubtitle(url) {
    try {
      const ext = url.split('.').pop().toLowerCase();
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const text = await resp.text();
      const converted = convertToVtt(text, ext);
      const blob = new Blob([converted], { type: 'text/vtt' });
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }

  async function findMovieSubtitleUrl(movieUrl) {
    let basePath = movieUrl.substring(0, movieUrl.lastIndexOf('/'));
    if (basePath.endsWith('/Dub')) basePath = basePath.substring(0, basePath.lastIndexOf('/'));
    const movieFilename = movieUrl.substring(movieUrl.lastIndexOf('/') + 1);
    const movieName = movieFilename.substring(0, movieFilename.lastIndexOf('.'));
    const subtitleFormats = ['vtt', 'srt', 'ssa', 'ass'];
    const subtitleBase = basePath + '/Subtitles/' + movieName;

    for (const format of subtitleFormats) {
      const url = subtitleBase + '.' + format;
      try {
        const resp = await fetch(url, { method: 'HEAD' });
        if (resp.ok) return await fetchSubtitle(url);
      } catch {}
    }
    return null;
  }

  async function findShowSubtitleUrl(season, episodeNum) {
    if (!season.subtitles) return null;
    const basePath = (season.url || '').replace(/\/$/, '');
    const subtitleBase = basePath + '/Subtitles/' + episodeNum;
    const subtitleFormats = ['vtt', 'srt', 'ssa', 'ass'];

    for (const format of subtitleFormats) {
      const url = subtitleBase + '.' + format;
      try {
        const resp = await fetch(url, { method: 'HEAD' });
        if (resp.ok) return await fetchSubtitle(url);
      } catch {}
    }
    return null;
  }

  let _lastSubBlobUrl = null;
  async function applySubtitles(blobUrl) {
    if (!player) return;
    const tracks = player.textTracks();
    for (let i = tracks.length - 1; i >= 0; i--) {
      try { player.removeRemoteTextTrack(tracks[i]); } catch {}
    }
    if (_lastSubBlobUrl) { try { URL.revokeObjectURL(_lastSubBlobUrl); } catch {} }
    _lastSubBlobUrl = blobUrl;

    if (!blobUrl) return;

    player.addRemoteTextTrack({
      kind: 'captions',
      src: blobUrl,
      srclang: 'en',
      label: 'English',
      default: false
    }, false);
  }

  // ── PLAYER ──
  function initializePlayer(videoUrl, seekTo) {
    if (player) {
      player.src({ src: videoUrl, type: 'video/mp4' });
      if (seekTo && seekTo > 5) {
        player.one('loadedmetadata', () => {
          player.currentTime(seekTo);
          player.play().catch(() => {});
        });
      } else {
        player.play().catch(() => {});
      }
      return;
    }

    player = videojs('video-player', {
      controls: true,
      autoplay: true,
      preload: 'auto',
      fluid: false,
      responsive: true,
      aspectRatio: '16:9',
      playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
    });

    if (VAST_TAG_URL) {
      try {
        player.ima({ adTagUrl: VAST_TAG_URL, adsRenderingSettings: { enablePreloading: true } });
      } catch {}
    }

    player.src({ src: videoUrl, type: 'video/mp4' });

    if (seekTo && seekTo > 5) {
      player.one('loadedmetadata', () => {
        player.currentTime(seekTo);
        player.play().catch(() => {});
      });
    }

    player.on('timeupdate', () => {
      if (isRemovingProgress) return;
      const currentTime = player.currentTime();
      if (!currentTime || currentTime < 5) return;
      const duration = player.duration() || 0;
      const itemId = getItemId(currentItem);

      if (currentType === 'movie') {
        watchProgress[itemId] = {
          time: currentTime,
          duration: duration,
          isDub: currentAudioType === 'dub',
          timestamp: Date.now()
        };
      } else if (currentType === 'show') {
        watchProgress[itemId] = {
          season: getSeasonName(currentSeason),
          episode: currentEpisode,
          time: currentTime,
          duration: duration,
          isDub: currentAudioType === 'dub',
          timestamp: Date.now()
        };
      }
      saveWatchProgress();
    });

    // Auto-Play Next Episode
    if (currentType === 'show') {
      player.on('ended', () => {
        if (playerSettings.autoplay) {
          showUpNextBanner();
        }
      });

      // Show next banner 30s before end
      player.on('timeupdate', () => {
        const dur = player.duration();
        const ct = player.currentTime();
        if (!dur || dur <= 0) return;
        const remaining = dur - ct;
        if (remaining <= 30 && remaining > 0 && playerSettings.autoplay) {
          const nextInfo = getNextEpisodeInfo();
          if (nextInfo) showUpNextBanner(nextInfo);
        } else {
          hideUpNextBanner();
        }
      });
    }
  }

  function getNextEpisodeInfo() {
    const range = parseEpisodeRange(currentSeason.episodes);
    const offset = getEpisodeOffset(currentItem.seasons, currentSeasonIndex);
    const maxEp = (currentSeason.continue || (currentSeasonIndex > 0 && currentItem.seasons[currentSeasonIndex - 1].continue))
      ? offset + (range.end - range.start + 1)
      : range.end;

    if (currentEpisode < maxEp) {
      const nextNum = currentEpisode + 1;
      const epInfo = currentSeason.names && currentSeason.names.find(e => e.ep === nextNum);
      return { episode: nextNum, name: epInfo ? epInfo.name : 'Episode ' + nextNum, season: currentSeason, seasonIdx: currentSeasonIndex };
    } else if (currentSeasonIndex < currentItem.seasons.length - 1) {
      const nextSeason = currentItem.seasons[currentSeasonIndex + 1];
      const nextNum = getSeasonStartEpisode(currentItem.seasons, currentSeasonIndex + 1);
      const epInfo = nextSeason.names && nextSeason.names.find(e => e.ep === nextNum);
      return { episode: nextNum, name: epInfo ? epInfo.name : 'Episode ' + nextNum, season: nextSeason, seasonIdx: currentSeasonIndex + 1 };
    }
    return null;
  }

  let _upNextTimer = null;
  function showUpNextBanner(nextInfo) {
    const banner = document.getElementById('up-next-banner');
    if (!banner) return;

    if (nextInfo) {
      document.getElementById('up-next-title').textContent = nextInfo.name;
    }

    if (!banner.classList.contains('visible')) {
      banner.classList.add('visible');
    }

    clearTimeout(_upNextTimer);
  }

  function hideUpNextBanner() {
    const banner = document.getElementById('up-next-banner');
    if (banner) banner.classList.remove('visible');
    clearTimeout(_upNextTimer);
  }

  // ── LOAD EPISODE ──
  function loadEpisode(season, seasonIdx, episodeNum, audioType, resumeTime) {
    const isDub = audioType === 'dub';
    const videoUrl = season.url + (isDub ? 'Dub/' : '') + episodeNum + '.mp4';

    let seekTo = 0;
    if (resumeTime != null) {
      seekTo = resumeTime;
    } else if (playerSettings.resume) {
      const itemId = getItemId(currentItem);
      const prog = watchProgress[itemId];
      if (prog && prog.season === getSeasonName(season) && prog.episode === episodeNum && prog.time > 5) {
        seekTo = prog.time;
      }
    }

    initializePlayer(videoUrl, seekTo);

    player.one('loadedmetadata', async () => {
      const subUrl = await findShowSubtitleUrl(season, episodeNum);
      await applySubtitles(subUrl);
    });

    document.querySelectorAll('.episode-item').forEach(el => {
      el.classList.toggle('active', parseInt(el.dataset.ep) === episodeNum);
    });

    const activeEp = document.querySelector('.episode-item.active');
    if (activeEp) activeEp.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    updateUrl(getSeasonName(season), episodeNum, audioType);
    hideUpNextBanner();
  }

  function playNextEpisode() {
    const next = getNextEpisodeInfo();
    if (!next) return;

    if (next.seasonIdx !== currentSeasonIndex) {
      currentSeasonIndex = next.seasonIdx;
      currentSeason = next.season;
      renderSeasonSelector();
      renderEpisodeList();
    }

    currentEpisode = next.episode;
    loadEpisode(currentSeason, currentSeasonIndex, currentEpisode, currentAudioType);
    renderEpisodeList();
  }

  // ── RENDER SEASON / EPISODE LIST ──
  function renderSeasonSelector() {
    const sel = document.getElementById('season-select');
    if (!sel) return;
    sel.innerHTML = '';
    currentItem.seasons.forEach((season, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = getSeasonName(season);
      if (idx === currentSeasonIndex) opt.selected = true;
      sel.appendChild(opt);
    });

    const newSel = sel.cloneNode(true);
    sel.parentNode.replaceChild(newSel, sel);
    newSel.addEventListener('change', (e) => {
      currentSeasonIndex = parseInt(e.target.value);
      currentSeason = currentItem.seasons[currentSeasonIndex];
      currentEpisode = getSeasonStartEpisode(currentItem.seasons, currentSeasonIndex);
      updateEpisodeAudioSelector();
      renderEpisodeList();
      loadEpisode(currentSeason, currentSeasonIndex, currentEpisode, currentAudioType);
    });
  }

  function updateEpisodeAudioSelector() {
    const wrap = document.getElementById('episode-audio-selector');
    if (!wrap) return;
    if (currentSeason && currentSeason.dub) {
      wrap.style.display = 'flex';
      wrap.querySelectorAll('.wz-btn-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.audio === currentAudioType);
      });
    } else {
      wrap.style.display = 'none';
      currentAudioType = 'sub';
      updateAudioButtons(document.getElementById('audio-selector'), 'sub');
    }
  }

  function updateAudioButtons(wrap, audioType) {
    if (!wrap) return;
    wrap.querySelectorAll('.wz-btn-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.audio === audioType);
    });
  }

  function renderEpisodeList() {
    const episodeList = document.getElementById('episode-list');
    if (!episodeList) return;
    episodeList.innerHTML = '';

    const range = parseEpisodeRange(currentSeason.episodes);
    const offset = getEpisodeOffset(currentItem.seasons, currentSeasonIndex);

    for (let i = range.start; i <= range.end; i++) {
      const displayNum = offset > 0 ? offset + (i - range.start + 1) : i;
      const epInfo = currentSeason.names && currentSeason.names.find(e => e.ep === displayNum);
      const epName = epInfo ? epInfo.name : 'Episode ' + displayNum;

      const item = document.createElement('div');
      item.className = 'episode-item' + (displayNum === currentEpisode ? ' active' : '');
      item.dataset.ep = displayNum;
      item.innerHTML =
        '<div class="episode-number">Episode ' + displayNum + '</div>' +
        '<div class="episode-name">' + epName + '</div>';

      item.addEventListener('click', () => {
        currentEpisode = displayNum;
        loadEpisode(currentSeason, currentSeasonIndex, displayNum, currentAudioType);
      });

      episodeList.appendChild(item);
    }
  }

  // ── RENDER SHOW ──
  function renderShow() {
    document.title = currentItem.name + ' | Zephware';

    const itemId = getItemId(currentItem);
    const inMyList = myList.includes(itemId);
    const progress = watchProgress[itemId];

    // Breadcrumb
    const crumb = document.getElementById('wz-content-breadcrumb');
    if (crumb) crumb.textContent = currentItem.name;

    document.getElementById('content-title').textContent = currentItem.name;

    const totalEpisodes = currentItem.seasons.reduce((sum, s) => {
      const r = parseEpisodeRange(s.episodes);
      return sum + (r.end - r.start + 1);
    }, 0);
    document.getElementById('content-meta').textContent =
      currentItem.seasons.length + ' Season' + (currentItem.seasons.length !== 1 ? 's' : '') + ' · ' + totalEpisodes + ' Episodes';

    if (currentItem.tags) {
      const tags = Array.isArray(currentItem.tags) ? currentItem.tags : [currentItem.tags];
      document.getElementById('content-tags').innerHTML = tags.map(t => '<span class="wz-tag">' + t + '</span>').join('');
    }

    if (currentItem.description) {
      const descEl = document.getElementById('content-description');
      descEl.textContent = currentItem.description;
    }

    // My List Button
    const listBtn = document.getElementById('add-to-list');
    const updateListBtn = () => {
      const inList = myList.includes(itemId);
      listBtn.innerHTML = inList ? '<span id="list-icon">✓</span> In My List' : '<span id="list-icon">+</span> Add to My List';
      listBtn.classList.toggle('active', inList);
    };
    updateListBtn();
    listBtn.addEventListener('click', () => {
      if (myList.includes(itemId)) {
        myList = myList.filter(id => id !== itemId);
      } else {
        myList.push(itemId);
      }
      saveMyList();
      updateListBtn();
    });

    // Remove Progress Button
    const removeBtn = document.getElementById('remove-progress');
    if (progress) {
      removeBtn.style.display = 'block';
      removeBtn.addEventListener('click', () => {
        isRemovingProgress = true;
        delete watchProgress[itemId];
        saveWatchProgress();
        removeBtn.style.display = 'none';
        isRemovingProgress = false;
      });
    }

    // Episode Panel
    document.getElementById('episode-panel').style.display = 'flex';

    // Season Audio Selector
    const infoAudioSel = document.getElementById('audio-selector');
    if (currentSeason && currentSeason.dub) {
      infoAudioSel.style.display = 'flex';
      updateAudioButtons(infoAudioSel, currentAudioType);
      infoAudioSel.querySelectorAll('.wz-btn-option').forEach(btn => {
        btn.addEventListener('click', () => {
          const prev = player ? player.currentTime() : 0;
          currentAudioType = btn.dataset.audio;
          updateAudioButtons(infoAudioSel, currentAudioType);
          updateAudioButtons(document.getElementById('episode-audio-selector'), currentAudioType);
          loadEpisode(currentSeason, currentSeasonIndex, currentEpisode, currentAudioType, prev);
        });
      });
    } else {
      infoAudioSel.style.display = 'none';
    }

    // Episode Audio Selector
    const epAudioSel = document.getElementById('episode-audio-selector');
    if (epAudioSel) {
      updateEpisodeAudioSelector();
      epAudioSel.querySelectorAll('.wz-btn-option').forEach(btn => {
        btn.addEventListener('click', () => {
          const prev = player ? player.currentTime() : 0;
          currentAudioType = btn.dataset.audio;
          updateAudioButtons(infoAudioSel, currentAudioType);
          updateAudioButtons(epAudioSel, currentAudioType);
          loadEpisode(currentSeason, currentSeasonIndex, currentEpisode, currentAudioType, prev);
        });
      });
    }

    renderSeasonSelector();
    renderEpisodeList();

    let seekTo = 0;
    if (playerSettings.resume && progress && progress.season === getSeasonName(currentSeason) && progress.episode === currentEpisode && progress.time > 5) {
      seekTo = progress.time;
    }

    const videoUrl = currentSeason.url + (currentAudioType === 'dub' ? 'Dub/' : '') + currentEpisode + '.mp4';
    initializePlayer(videoUrl, seekTo);

    player.one('loadedmetadata', async () => {
      const subUrl = await findShowSubtitleUrl(currentSeason, currentEpisode);
      await applySubtitles(subUrl);
    });

    setupUpNextBanner();
  }

  function setupUpNextBanner() {
    const wrapper = document.getElementById('video-wrapper');
    if (!wrapper || document.getElementById('up-next-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'up-next-banner';
    banner.innerHTML =
      '<div>' +
        '<div id="up-next-label">Up Next</div>' +
        '<div id="up-next-title"></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;">' +
        '<button id="up-next-skip">Keep Watching</button>' +
        '<button id="up-next-btn">▶ Play Next</button>' +
      '</div>';
    wrapper.appendChild(banner);

    document.getElementById('up-next-btn').addEventListener('click', () => {
      hideUpNextBanner();
      playNextEpisode();
    });

    document.getElementById('up-next-skip').addEventListener('click', () => {
      hideUpNextBanner();
    });
  }

  // ── RENDER MOVIE ──
  function renderMovie() {
    document.title = currentItem.name + ' | Zephware';

    const itemId = getItemId(currentItem);
    const inMyList = myList.includes(itemId);
    const progress = watchProgress[itemId];

    // Breadcrumb
    const crumb = document.getElementById('wz-content-breadcrumb');
    if (crumb) crumb.textContent = currentItem.name;

    document.getElementById('content-title').textContent = currentItem.name;

    let metaParts = [];
    if (currentItem.duration) {
      const h = Math.floor(currentItem.duration / 60), m = currentItem.duration % 60;
      metaParts.push(h > 0 ? h + 'h ' + m + 'm' : m + 'm');
    }
    document.getElementById('content-meta').textContent = metaParts.join(' · ');

    if (currentItem.tags) {
      const tags = Array.isArray(currentItem.tags) ? currentItem.tags : [currentItem.tags];
      document.getElementById('content-tags').innerHTML = tags.map(t => '<span class="wz-tag">' + t + '</span>').join('');
    }

    if (currentItem.description) {
      document.getElementById('content-description').textContent = currentItem.description;
    }

    // Audio selector
    const audioSel = document.getElementById('audio-selector');
    if (currentItem.dub) {
      audioSel.style.display = 'flex';
      updateAudioButtons(audioSel, currentAudioType);
      audioSel.querySelectorAll('.wz-btn-option').forEach(btn => {
        btn.addEventListener('click', () => {
          const prev = player ? player.currentTime() : 0;
          currentAudioType = btn.dataset.audio;
          updateAudioButtons(audioSel, currentAudioType);
          const videoUrl = currentAudioType === 'dub' ? currentItem.dub : currentItem.url;
          initializePlayer(videoUrl, prev);
          player.one('loadedmetadata', async () => {
            const subUrl = await findMovieSubtitleUrl(videoUrl);
            await applySubtitles(subUrl);
          });
          updateUrl(null, null, currentAudioType);
        });
      });
    }

    // My List
    const listBtn = document.getElementById('add-to-list');
    const updateListBtn = () => {
      const inList = myList.includes(itemId);
      listBtn.innerHTML = inList ? '<span id="list-icon">✓</span> In My List' : '<span id="list-icon">+</span> Add to My List';
      listBtn.classList.toggle('active', inList);
    };
    updateListBtn();
    listBtn.addEventListener('click', () => {
      if (myList.includes(itemId)) myList = myList.filter(id => id !== itemId);
      else myList.push(itemId);
      saveMyList();
      updateListBtn();
    });

    // Remove Progress
    const removeBtn = document.getElementById('remove-progress');
    if (progress) {
      removeBtn.style.display = 'block';
      removeBtn.addEventListener('click', () => {
        isRemovingProgress = true;
        delete watchProgress[itemId];
        saveWatchProgress();
        removeBtn.style.display = 'none';
        isRemovingProgress = false;
      });
    }

    // Play Video
    const videoUrl = currentAudioType === 'dub' ? currentItem.dub : currentItem.url;
    let seekTo = 0;
    if (playerSettings.resume && progress && progress.time > 5) {
      seekTo = progress.time;
    }

    initializePlayer(videoUrl, seekTo);

    player.one('loadedmetadata', async () => {
      const subUrl = await findMovieSubtitleUrl(videoUrl);
      await applySubtitles(subUrl);
    });
  }

  // ── LOAD CONTENT ──
  async function loadContent() {
    const params = getUrlParams();
    const contentId = params.id;

    if (!contentId) {
      window.location.href = 'index.svg';
      return;
    }

    try {
      const [showsData, moviesData] = await Promise.all([
        fetch(DATA_URL + 'shows.json').then(r => r.json()).catch(() => []),
        fetch(DATA_URL + 'movies.json').then(r => r.json()).catch(() => [])
      ]);

      const show = showsData.find(s => getItemId(s) === contentId);
      if (show) {
        currentItem = show;
        currentType = 'show';
        currentAudioType = params.audio || 'sub';

        if (params.season) {
          const idx = show.seasons.findIndex(s => {
            const sname = typeof s.season === 'string' ? s.season : (s.sname || 'Season ' + s.season);
            return sname === params.season;
          });
          if (idx !== -1) { currentSeasonIndex = idx; currentSeason = show.seasons[idx]; }
        }
        if (!currentSeason) { currentSeason = show.seasons[0]; currentSeasonIndex = 0; }

        if (params.episode) {
          currentEpisode = parseInt(params.episode);
        } else {
          currentEpisode = getSeasonStartEpisode(show.seasons, currentSeasonIndex);
        }

        renderShow();
        return;
      }

      const movie = moviesData.find(m => getItemId(m) === contentId);
      if (movie) {
        currentItem = movie;
        currentType = 'movie';
        currentAudioType = params.audio || 'sub';
        renderMovie();
        return;
      }

      alert('Content not found');
      window.location.href = 'index.html';

    } catch (err) {
      console.error(err);
      window.location.href = 'index.html';
    }
  }

  // ── NAV ──
  document.getElementById('back-btn').addEventListener('click', () => {
    if (player) { try { player.dispose(); } catch {} }
    window.location.href = 'index.html';
  });

  document.getElementById('wz-logo').addEventListener('click', () => {
    if (player) { try { player.dispose(); } catch {} }
    window.location.href = 'index.html';
  });

  // ── PLAYER SETTINGS DROPDOWN ──
  const settingsToggle = document.getElementById('wz-settings-toggle');
  const settingsDropdown = document.getElementById('wz-player-settings');

  settingsToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsDropdown.classList.toggle('open');
    settingsToggle.classList.toggle('active', settingsDropdown.classList.contains('open'));
  });

  document.addEventListener('click', () => {
    settingsDropdown.classList.remove('open');
    settingsToggle.classList.remove('active');
  });

  settingsDropdown.addEventListener('click', e => e.stopPropagation());

  // Sync player settings UI
  const autoplayToggle = document.getElementById('wz-autoplay-toggle');
  const resumeToggle = document.getElementById('wz-resume-toggle');

  if (autoplayToggle) {
    autoplayToggle.checked = playerSettings.autoplay !== false;
    autoplayToggle.addEventListener('change', () => {
      playerSettings.autoplay = autoplayToggle.checked;
      savePlayerSettings();
    });
  }

  if (resumeToggle) {
    resumeToggle.checked = playerSettings.resume !== false;
    resumeToggle.addEventListener('change', () => {
      playerSettings.resume = resumeToggle.checked;
      savePlayerSettings();
    });
  }

  // ── INIT ──
  loadContent();
})();