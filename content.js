// content.js - Fear Filter
if (!window.__fearFilterLoaded) {
  window.__fearFilterLoaded = true;

const CHECKED_ATTR = 'data-ff-checked';
let isEnabled = true;
let apiKey = '';
let activeFears = [];
let pendingChecks = new Set();
let observer = null;

const FEAR_LABELS = {
  snakes:      ['🐍', 'Snake'],
  spiders:     ['🕷️', 'Spider'],
  clowns:      ['🤡', 'Clown'],
  needles:     ['💉', 'Needle'],
  blood:       ['🩸', 'Blood'],
  heights:     ['🏔️', 'Heights'],
  sharks:      ['🦈', 'Shark'],
  rats:        ['🐀', 'Rat / Mouse'],
  cockroaches: ['🪳', 'Cockroach'],
  wasps:       ['🐝', 'Wasp / Bee'],
  dolls:       ['🪆', 'Doll / Puppet'],
  eyes:        ['👁️', 'Eyes close-up'],
};

chrome.storage.sync.get(['enabled', 'apiKey', 'activeFears'], (data) => {
  isEnabled = data.enabled !== false;
  apiKey = data.apiKey || '';
  activeFears = data.activeFears || ['snakes'];
  injectStyles();
  if (isEnabled && apiKey && activeFears.length > 0) {
    scanImages();
    startObserver();
  }
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.enabled !== undefined) isEnabled = changes.enabled.newValue;
  if (changes.apiKey !== undefined) apiKey = changes.apiKey.newValue;
  if (changes.activeFears !== undefined) activeFears = changes.activeFears.newValue;
  if (!isEnabled) { uncensorAll(); }
  else if (apiKey && activeFears.length > 0) { scanImages(); startObserver(); }
});

function injectStyles() {
  if (document.getElementById('ff-styles')) return;
  const s = document.createElement('style');
  s.id = 'ff-styles';
  s.textContent = `
    img[data-ff-fear]{filter:blur(28px)!important;transition:filter .3s!important}
    .ff-wrapper{position:relative!important;display:inline-block!important}
    .ff-overlay{position:absolute!important;inset:0!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;background:rgba(0,0,0,.45)!important;z-index:9999!important;cursor:pointer!important;gap:5px!important;font-family:system-ui,sans-serif!important;user-select:none!important;border-radius:4px!important}
    .ff-overlay .ff-icon{font-size:2em;line-height:1}
    .ff-overlay .ff-label{font-size:10px!important;font-weight:700!important;letter-spacing:.06em!important;text-transform:uppercase!important;color:#fff!important;background:rgba(0,0,0,.65)!important;padding:2px 8px!important;border-radius:20px!important}
    img.ff-checking{opacity:.5;transition:opacity .3s}
  `;
  document.head.appendChild(s);
}

function scanImages() {
  document.querySelectorAll(`img:not([${CHECKED_ATTR}])`).forEach(processImage);
}

function startObserver() {
  if (observer) return;
  observer = new MutationObserver((mutations) => {
    if (!isEnabled || !apiKey || !activeFears.length) return;
    mutations.forEach(m => m.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.tagName === 'IMG') processImage(node);
      node.querySelectorAll?.(`img:not([${CHECKED_ATTR}])`).forEach(processImage);
    }));
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

async function processImage(img) {
  if (img.hasAttribute(CHECKED_ATTR) || pendingChecks.has(img)) return;
  const src = img.src || img.currentSrc;
  if (!src || src.startsWith('data:') || src.startsWith('blob:')) {
    img.setAttribute(CHECKED_ATTR, 'skipped'); return;
  }
  await waitForSize(img);
  const w = img.naturalWidth || img.offsetWidth;
  const h = img.naturalHeight || img.offsetHeight;
  if ((w > 0 && w < 80) || (h > 0 && h < 80)) {
    img.setAttribute(CHECKED_ATTR, 'small'); return;
  }
  img.setAttribute(CHECKED_ATTR, 'pending');
  pendingChecks.add(img);
  img.classList.add('ff-checking');
  try {
    const res = await chrome.runtime.sendMessage({ type: 'CHECK_IMAGE', imageUrl: src, apiKey, fears: activeFears });
    img.classList.remove('ff-checking');
    pendingChecks.delete(img);
    if (res?.success && res.matched) {
      img.setAttribute(CHECKED_ATTR, 'matched');
      img.setAttribute('data-ff-fear', res.matched);
      censorImage(img, res.matched);
    } else {
      img.setAttribute(CHECKED_ATTR, 'clear');
    }
  } catch (e) {
    img.classList.remove('ff-checking');
    img.setAttribute(CHECKED_ATTR, 'error');
    pendingChecks.delete(img);
  }
}

function waitForSize(img) {
  return new Promise(resolve => {
    if (img.naturalWidth > 0 || img.complete) return resolve();
    img.addEventListener('load', resolve, { once: true });
    img.addEventListener('error', resolve, { once: true });
    setTimeout(resolve, 3000);
  });
}

function censorImage(img, fear) {
  if (img.parentElement?.classList.contains('ff-wrapper')) { addOverlay(img.parentElement, img, fear); return; }
  const wrapper = document.createElement('span');
  wrapper.className = 'ff-wrapper';
  const d = window.getComputedStyle(img).display;
  wrapper.style.cssText = `display:${d === 'block' ? 'block' : 'inline-block'};position:relative;`;
  img.parentNode.insertBefore(wrapper, img);
  wrapper.appendChild(img);
  addOverlay(wrapper, img, fear);
}

function addOverlay(wrapper, img, fear) {
  if (wrapper.querySelector('.ff-overlay')) return;
  const [icon, label] = FEAR_LABELS[fear] || ['⚠️', 'Filtered'];
  const overlay = document.createElement('div');
  overlay.className = 'ff-overlay';
  overlay.innerHTML = `<span class="ff-icon">${icon}</span><span class="ff-label">${label} — click to reveal</span>`;
  let revealed = false;
  overlay.addEventListener('click', (e) => {
    e.stopPropagation();
    revealed = !revealed;
    img.style.filter = revealed ? 'none' : '';
    overlay.style.display = revealed ? 'none' : '';
  });
  wrapper.appendChild(overlay);
}

function uncensorAll() {
  document.querySelectorAll('.ff-overlay').forEach(el => el.remove());
  document.querySelectorAll('img[data-ff-fear]').forEach(img => { img.style.filter = ''; img.removeAttribute('data-ff-fear'); });
  document.querySelectorAll('.ff-wrapper').forEach(w => { const img = w.querySelector('img'); if (img) w.replaceWith(img); });
}

} // end guard
