const themes = {
  blue: {
    color1: '#01AEFD',
    color2: '#015AFD',
    img1: 'assets/themes/main/Current.png',
    img2: 'assets/themes/main/Previous.png',
    waves: ['#63baff', '#3ea7f7', '#298ee0'],
    bg: '#234'
  },
  pink: {
    color1: '#fc57e6ff',
    color2: '#ff008cff',
    img1: 'assets/themes/pink/Current.png',
    img2: 'assets/themes/pink/Previous.png',
    waves: ['#ff00c8ff', '#e645cbff', '#f571d4ff'],
    bg: '#3D1B41'
  },
  green: {
    color1: '#63fd01',
    color2: '#25fd01',
    img1: 'assets/themes/green/Current.jpg',
    img2: 'assets/themes/green/Previous.png',
    waves: ['#87ff63ff', '#72f73eff', '#3ee029ff'],
    bg: '#234'
  },
  orange: {
    color1: '#f7ab1dff',
    color2: '#eb6c04ff',
    img1: 'assets/themes/halloween/Current.png',
    img2: 'assets/themes/halloween/Previous.png',
    waves: ['#fdba01ff', '#f77e1dff', '#e26817ff'],
    bg: '#234'
  },
  red: {
    color1: '#ff6363ff',
    color2: '#e03e3eff',
    img1: 'assets/themes/red/Current.png',
    img2: 'assets/themes/red/Previous.png',
    waves: ['#ff6363ff', '#e03e3eff', '#b31515ff'],
    bg: '#234'
  },
  purple: {
    color1: '#b463ffff',
    color2: '#8d3ee0ff',
    img1: 'assets/themes/purple/Current.png',
    img2: 'assets/themes/purple/Previous.png',
    waves: ['#b463ffff', '#8d3ee0ff', '#5a15b3ff'],
    bg: '#234'
  },
  christmas: {
    color1: '#00ff2aff',
    color2: '#ff0000ff',
    img1: 'assets/themes/christmas/Current.png',
    img2: 'assets/themes/christmas/Previous.png',
    waves: ['#e0dbdbff', '#f0f0f0ff', '#fdfdfdff'],
    bg: '#234'
  }
};

let settings = {
  defaultOption: 'games',
  theme: 'blue'
};

let newsPages = getNewsPages();

function loadSettings() {
  const saved = localStorage.getItem('zephwareSettings');
  if (saved) {
    settings = { ...settings, ...JSON.parse(saved) };
  }
}

function saveSettings() {
  localStorage.setItem('zephwareSettings', JSON.stringify(settings));
}

function applyTheme(themeName) {
  const theme = themes[themeName] || themes.blue;
  document.documentElement.style.setProperty('--color1', normalizeHex(theme.color1));
  document.documentElement.style.setProperty('--color2', normalizeHex(theme.color2));
  document.documentElement.style.setProperty('--wave1', theme.waves[0]);
  document.documentElement.style.setProperty('--wave2', theme.waves[1]);
  document.documentElement.style.setProperty('--wave3', theme.waves[2]);
  document.documentElement.style.setProperty('--bg', theme.bg);

  document.querySelectorAll('.theme-option').forEach(opt => {
    const tName = opt.dataset.theme;
    const t = themes[tName];
    const c1 = normalizeHex(t.color1);
    const c2 = normalizeHex(t.color2);

    opt.style.background = `linear-gradient(
      to bottom,
      ${c1}80,
      ${c2}80
    )`;
  });
} 

loadSettings();
renderThemeOptions();
applyTheme(settings.theme);
newsPages = getNewsPages();

const select = document.getElementById('selector');
const goButton = document.getElementById('go-button');
const settingsButton = document.getElementById('settings-button');

select.value = settings.defaultOption;

function normalizeHex(hex) {
  if (!hex) return hex;

  if (hex.length === 9) {
    return hex.slice(0, 7);
  }

  return hex;
}

function getNewsPages() {
  const theme = themes[settings.theme];
  return [
  {
    title: "What's New?",
    desc: "v1.11.1 : Week of May 25th, 2026",
    images: [
      { src: theme.img1, alt: "" }
    ],
    changes: [
      { text: "Library Update is Here! (Sports & 1000+ New Animes)", desc: "The long-awaited library update has dropped! Shows, movies, and manga have been delayed a day or two. Some animes may be missing due to an NSFW filter. If you believe an anime is missing, please make a suggestion. Do note that with this new update, video loading may be slow at first but as more people start watching, the server will improve and load faster." }
    ]
  },
  {
    title: "What's New?",
    desc: "v1.10.2 : Week of May 3rd, 2026",
    images: [
      { src: theme.img2, alt: "" }
    ],
    changes: [
      { text: "library maintenance", desc: "hello, I have temporarily disabled library to the public for maintenance on the update, this may take a few hours or a day. Sorry for the inconvenience!" },
      { text: "huge update on monday (sorry for the delay)", desc: "so i know i said stuff this week but it took longer than expected however i promise it'll be worth the wait come monday morning. I've been reading ALL of your suggestions and expect some crazy stuff on monday <3 (again, sorry for the delay, i really appreciate you guys being patient)" },
      { text: "Monochrome Music!", desc: "since a whopping TWO PEOPLE asked I've ported monochrome music! (not made by me) It's really cool and has a lot of features, you could compare it to Spotify." }
    ]
  },
  {
    title: "What's Next?",
    desc: "Possible Additions Next Week!",
    images: [
      { src: "https://placehold.co/560x200/222/fff.png?text=Coming+Soon", alt: "Coming Soon" }
    ],
    changes: [
      { text: "Learning Tools Completion", desc: "Added Calculator, Marker Tool, Ect." },
      { text: "IXL+ Hacks"},
      { text: "Gimkit Hacks"},
      { text: "TinyTask Ripoff"},
      { text: "Messages Revive"},
      { text: "Marketplace"}
          ]
    }
  ];
}
showNewsPanel();

settingsButton.addEventListener('click', () => {
  document.getElementById('settings-overlay').style.display = 'flex';
  document.getElementById('default-select').value = settings.defaultOption;
});

document.getElementById('settings-save').addEventListener('click', () => {
  settings.defaultOption = document.getElementById('default-select').value;
  saveSettings();
  select.value = settings.defaultOption;
  document.getElementById('settings-overlay').style.display = 'none';
});

document.getElementById('settings-close').addEventListener('click', () => {
  document.getElementById('settings-overlay').style.display = 'none';
});

document.querySelectorAll('.theme-option').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('.theme-option').forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
    settings.theme = opt.dataset.theme;
    applyTheme(opt.dataset.theme);
    saveSettings();
  });
});

goButton.addEventListener('click', () => {
  const val = select.value.toLowerCase();
  
  if (val === 'webtools') {
    showInstructionsOverlay('webtools/webtools.min.js');
    return;
  }

  if (val === 'messages') {
    showInstructionsOverlay('bridge.js');
    return;
  }

  if (val === 'games' || val === 'library') {
    window.location.href = `/${val}/index.html`;
  }

    if (val === 'connect' || val === 'music') {
    window.location.href = `/${val}.html`;
  }
});

select.onchange = () => {
  const val = select.value.toLowerCase();
  if (val === 'gimkit hacks') {
    setButtonStatus('wip');
  } else {
    setButtonStatus('open');
  }
};

function setButtonStatus(status) {
  const theme = themes[settings.theme];
  const gradientOpen = `linear-gradient(to bottom, var(--color1), var(--color2))`;
  const gradientWIP = 'linear-gradient(to bottom, #002D62, #001B44)';
  
  switch (status.toLowerCase()) {
    case 'wip':
      goButton.textContent = 'WIP/Maintenance!';
      goButton.disabled = true;
      goButton.style.background = gradientWIP;
      break;
    case 'locked':
    case 'open':
    default:
      goButton.textContent = 'Go';
      goButton.disabled = false;
      goButton.style.background = gradientOpen;
      break;
  }
}

function renderThemeOptions() {
  const container = document.getElementById('theme-preview');
  container.innerHTML = '';

  Object.keys(themes).forEach(name => {
    const theme = themes[name];

    const div = document.createElement('div');
    div.className = 'theme-option';
    div.dataset.theme = name;

    div.innerHTML = `
      <img src="${theme.img1}" alt="${name}">
      <span style="
        background: linear-gradient(
          to bottom,
          ${normalizeHex(theme.color1)},
          ${normalizeHex(theme.color2)}
        );
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        font-weight: 600;
      ">${name}</span>
    `;

    if (name === settings.theme) {
      div.classList.add('selected');
    }

    div.addEventListener('click', () => {
      document.querySelectorAll('.theme-option').forEach(o => o.classList.remove('selected'));
      div.classList.add('selected');

      settings.theme = name;
      applyTheme(name);
      saveSettings();
    });

    container.appendChild(div);
  });
}

function showNewsPanel() {
  let pageIdx = 0;
  let imgIdx = 0;

  const overlay = document.getElementById('news-overlay');
  const newsTitle = document.querySelector('.news-title');
  const pageDesc = document.querySelector('.page-desc');
  const newsImg = document.querySelector('.news-img');
  const changesList = document.querySelector('.changes-list');
  const leftArrow = document.querySelector('.left-arrow');
  const rightArrow = document.querySelector('.right-arrow');
  const closeBtn = document.getElementById('news-close');

  overlay.style.display = 'flex';
  overlay.tabIndex = 0;
  overlay.focus();

  function render() {
    newsTitle.textContent = newsPages[pageIdx].title;
    pageDesc.textContent = newsPages[pageIdx].desc || '';
    pageDesc.style.display = newsPages[pageIdx].desc ? '' : 'none';
    
    const imgs = newsPages[pageIdx].images;
    imgIdx = (imgIdx + imgs.length) % imgs.length;
    newsImg.src = imgs[imgIdx].src;
    newsImg.alt = imgs[imgIdx].alt || '';
    
    changesList.innerHTML = '';
    newsPages[pageIdx].changes.forEach(change => {
      const li = document.createElement('li');
      
      const main = document.createElement('span');
      main.className = 'main-text';
      main.textContent = '• ' + change.text;
      li.appendChild(main);

      if (change.desc) {
        const desc = document.createElement('span');
        desc.className = 'desc-text';
        desc.textContent = change.desc;
        li.appendChild(desc);
      }
      changesList.appendChild(li);
    });
  }

  rightArrow.onclick = () => {
    pageIdx = (pageIdx - 1 + newsPages.length) % newsPages.length;
    imgIdx = 0;
    render();
  };
  
  leftArrow.onclick = () => {
    pageIdx = (pageIdx + 1) % newsPages.length;
    imgIdx = 0;
    render();
  };

  closeBtn.onclick = () => {
    overlay.style.display = 'none';
    showSuggestionTeaser();
  };

  overlay.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') leftArrow.onclick();
    if (e.key === 'ArrowRight') rightArrow.onclick();
    if (e.key === 'Escape') { overlay.style.display = 'none'; showSuggestionTeaser(); }
  });

  render();
}

function showInstructionsOverlay(customLink) {
  const overlay = document.getElementById('instructions-overlay');
  const copyBtn = document.getElementById('copy-btn');
  const closeBtn = document.getElementById('instructions-close');
  const toCopy = document.getElementById('to-copy');

  overlay.style.display = 'flex';

  if (customLink) {
    fetch(customLink)
      .then(res => res.text())
      .then(code => {
        toCopy.textContent = code;
        copyBtn.onclick = () => {
          prompt("", code)
        };
      });
  }

  closeBtn.onclick = () => {
    overlay.style.display = 'none';
    toCopy.textContent = '';
  };
}
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1498273223547289622/pc10KTqw1EaYvMnbm_I0tVL63Vb5cOAE6Cw7srD3VeQpNrKpuPVuxstVAbixBz9RVcmX';

function showSuggestionTeaser() {
  const teaser = document.getElementById('suggestion-teaser-overlay');
  teaser.style.display = 'flex';

  document.getElementById('suggestion-teaser-skip').onclick = () => {
    teaser.style.display = 'none';
  };

  document.getElementById('suggestion-teaser-ok').onclick = () => {
    teaser.style.display = 'none';
    showSuggestionForm();
  };
}

function showSuggestionForm() {
  const overlay = document.getElementById('suggestion-form-overlay');
  const typeSelect = document.getElementById('suggestion-type');
  const textarea = document.getElementById('suggestion-text');
  const charNum = document.getElementById('char-num');
  const feedback = document.getElementById('suggestion-feedback');
  const submitBtn = document.getElementById('suggestion-submit');

  textarea.value = '';
  charNum.textContent = '0';
  feedback.style.display = 'none';
  feedback.className = 'suggestion-feedback';
  submitBtn.disabled = false;
  submitBtn.textContent = 'Send';

  overlay.style.display = 'flex';

  textarea.oninput = () => {
    charNum.textContent = textarea.value.length;
  };

  document.getElementById('suggestion-form-close').onclick = () => {
    overlay.style.display = 'none';
  };

  document.getElementById('suggestion-form-cancel').onclick = () => {
    overlay.style.display = 'none';
  };

  submitBtn.onclick = async () => {
    const type = typeSelect.value;
    const text = textarea.value.trim();

    if (!text) {
      feedback.textContent = 'Please enter some details before sending.';
      feedback.className = 'suggestion-feedback error';
      feedback.style.display = 'block';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';
    feedback.style.display = 'none';

    const payload = {
      embeds: [{
        title: `${type}`,
        description: text,
        color: parseInt(
          (themes[settings.theme]?.color1 || '#01AEFD').replace('#', '').slice(0, 6),
          16
        ),
        footer: { text: 'Zephware Feedback' },
        timestamp: new Date().toISOString()
      }]
    };

    try {
      const res = await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok || res.status === 204) {
        feedback.textContent = '✓ Sent! Thanks for the feedback.';
        feedback.className = 'suggestion-feedback success';
        feedback.style.display = 'block';
        textarea.value = '';
        charNum.textContent = '0';
        setTimeout(() => { overlay.style.display = 'none'; }, 1800);
      } else {
        throw new Error('bad status');
      }
    } catch {
      feedback.textContent = 'Something went wrong. Try again later.';
      feedback.className = 'suggestion-feedback error';
      feedback.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send';
    }
  };
}