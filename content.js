// content.js - Fear Filter v2
if (!window.__fearFilterLoaded) {
  window.__fearFilterLoaded = true;
  window.__fearFilterVersion = 2;

const CHECKED_ATTR = 'data-ff-checked';
document.documentElement.setAttribute('data-ff-version', '2');
let isEnabled = true;
let activeFears = [];
let customFears = []; // [{ id, name }] — user-defined fears (Pro only)
let isPro = false;    // Pro license flag — gates custom fears + CLIP
let pendingChecks = new Set();
let observer = null;

const FEAR_LABELS = {
  snakes:      ['🐍', 'Snake'],
  spiders:     ['🕷️', 'Spider'],
  clowns:      ['🤡', 'Clown'],
  needles:     ['💉', 'Needle'],
  blood:       ['🩸', 'Blood'],
  sharks:      ['🦈', 'Shark'],
  rats:        ['🐀', 'Rat / Mouse'],
  cockroaches: ['🪳', 'Cockroach'],
  wasps:       ['🐝', 'Wasp / Bee'],
  dolls:       ['🪆', 'Doll / Puppet'],
  eyes:        ['👁️', 'Eyes close-up'],
};

chrome.storage.sync.get(['enabled', 'activeFears', 'customFears', 'isPro'], (data) => {
  isEnabled = data.enabled !== false;
  activeFears = data.activeFears || ['snakes'];
  customFears = data.customFears || [];
  isPro = data.isPro === true;
  injectStyles();
  if (isEnabled && activeFears.length > 0) {
    scanMedia();
    startObserver();
  }
});

chrome.storage.onChanged.addListener((changes) => {
  const fearsChanged = changes.activeFears !== undefined || changes.customFears !== undefined;
  if (changes.enabled !== undefined) isEnabled = changes.enabled.newValue;
  if (changes.activeFears !== undefined) activeFears = changes.activeFears.newValue;
  if (changes.customFears !== undefined) customFears = changes.customFears.newValue || [];
  if (changes.isPro !== undefined) isPro = changes.isPro.newValue === true;

  if (!isEnabled) {
    uncensorAll(); // also clears data-ff-checked so re-enabling works correctly
  } else {
    // If fears changed, wipe all existing blurs and re-evaluate everything from scratch
    // so removed fears get un-blurred and newly added fears get picked up immediately.
    if (fearsChanged) uncensorAll();
    if (activeFears.length > 0) { scanMedia(); startObserver(); }
  }
});

function injectStyles() {
  if (document.getElementById('ff-styles')) return;
  const s = document.createElement('style');
  s.id = 'ff-styles';
  s.textContent = `
    img[data-ff-fear],video[data-ff-fear]{filter:blur(28px)!important;transition:filter .3s!important}
    .ff-wrapper{position:relative!important;display:inline-block!important}
    .ff-overlay{position:absolute!important;inset:0!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;background:rgba(0,0,0,.88)!important;z-index:2147483647!important;cursor:pointer!important;gap:4px!important;font-family:system-ui,sans-serif!important;user-select:none!important;border-radius:4px!important;padding:8px!important;box-sizing:border-box!important;backdrop-filter:blur(28px)!important;-webkit-backdrop-filter:blur(28px)!important}
    .ff-overlay .ff-icon{font-size:2em;line-height:1}
    .ff-overlay .ff-name{font-size:10px!important;font-weight:800!important;letter-spacing:.07em!important;text-transform:uppercase!important;color:#fff!important;text-align:center!important;max-width:100%!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
    .ff-overlay .ff-hint{font-size:9px!important;font-weight:500!important;color:rgba(255,255,255,.55)!important;text-align:center!important;letter-spacing:.04em!important;white-space:nowrap!important}
    img.ff-checking,video.ff-checking{opacity:.5;transition:opacity .3s}
  `;
  document.head.appendChild(s);
}

function scanMedia() {
  document.querySelectorAll(`img:not([${CHECKED_ATTR}])`).forEach(processImage);
  document.querySelectorAll(`video:not([${CHECKED_ATTR}])`).forEach(processVideo);
}

function startObserver() {
  if (observer) return;
  observer = new MutationObserver((mutations) => {
    if (!isEnabled || !activeFears.length) return;
    mutations.forEach(m => m.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.tagName === 'IMG') processImage(node);
      if (node.tagName === 'VIDEO') processVideo(node);
      node.querySelectorAll?.(`img:not([${CHECKED_ATTR}])`).forEach(processImage);
      node.querySelectorAll?.(`video:not([${CHECKED_ATTR}])`).forEach(processVideo);
    }));
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// Extract HTML metadata from an image or video element and its surroundings.
// This is sent to background.js for the instant keyword check before any ML inference.
function extractHtmlMeta(el) {
  const meta = {};

  // Direct element attributes
  meta.alt       = el.alt || el.title || '';
  meta.title     = el.title || '';
  meta.ariaLabel = el.getAttribute('aria-label') || '';

  // aria-describedby (may point to a separate element with a description)
  const describedById = el.getAttribute('aria-describedby');
  if (describedById) {
    const desc = document.getElementById(describedById);
    if (desc) meta.ariaLabel += ' ' + desc.textContent;
  }

  // Nearest figcaption — search up to 10 ancestor levels (catches deep nesting like Wikipedia)
  let ancestor = el.parentElement;
  for (let i = 0; i < 10; i++) {
    if (!ancestor) break;
    const cap = ancestor.querySelector('figcaption');
    if (cap) { meta.caption = cap.textContent.trim().slice(0, 300); break; }
    ancestor = ancestor.parentElement;
  }

  // Text content of sibling nodes within the immediate parent
  const siblings = [];
  let sib = el.parentElement?.firstChild;
  while (sib) {
    if (sib !== el) {
      if (sib.nodeType === 3) {
        siblings.push(sib.textContent.trim());
      } else if (sib.nodeType === 1 && sib.tagName !== 'IMG' && sib.tagName !== 'VIDEO') {
        siblings.push(sib.textContent?.trim().slice(0, 150));
      }
    }
    sib = sib.nextSibling;
  }

  // If element is inside a table cell, also grab text from sibling <td>/<th> cells
  // (catches Wikipedia-style infoboxes which use tables instead of <figure>)
  let tdAncestor = el.parentElement;
  for (let i = 0; i < 6; i++) {
    if (!tdAncestor) break;
    if (tdAncestor.tagName === 'TD' || tdAncestor.tagName === 'TH') {
      // Also grab text from the containing cell itself (catches infobox captions
      // like "A grey reef shark" that live in the same <td> as the image)
      siblings.push((tdAncestor.innerText || tdAncestor.textContent).trim().slice(0, 400));
      const row = tdAncestor.parentElement; // <tr>
      if (row) {
        row.querySelectorAll('td, th').forEach(cell => {
          if (cell !== tdAncestor) siblings.push((cell.innerText || cell.textContent).trim().slice(0, 150));
        });
        // Also check the row above — collect each cell separately to avoid concatenation
        const prevRow = row.previousElementSibling;
        if (prevRow) {
          prevRow.querySelectorAll('td, th').forEach(cell => {
            siblings.push((cell.innerText || cell.textContent).trim().slice(0, 150));
          });
          // Fallback: if no cells found, use the row text (e.g. plain th spanning cols)
          if (!prevRow.querySelector('td, th')) siblings.push((prevRow.innerText || prevRow.textContent).trim().slice(0, 150));
        }
      }
      break;
    }
    tdAncestor = tdAncestor.parentElement;
  }

  meta.nearby = siblings.filter(Boolean).join(' ').slice(0, 500);

  // Social media post text — always walk up ancestors to find tweet/post text containers
  // and APPEND to nearby so we get both table context AND social context.
  // Twitter: [data-testid="tweetText"]
  // Facebook: [data-ad-comet-preview="message"], [data-testid="post_message"]
  // Instagram: [class*="Caption"], generic article text
  // Depth 30 to handle Twitter's deeply nested DOM.
  {
    let anc = el.parentElement;
    for (let i = 0; i < 30; i++) {
      if (!anc) break;
      const postText = anc.querySelector([
        '[data-testid="tweetText"]',
        '[data-ad-comet-preview="message"]',
        '[data-testid="post_message"]',
        '[data-testid="post-content"]',
        '.userContent',
        '[class*="PostBody"]',
        '[class*="post-body"]',
        '[class*="Caption"]'
      ].join(', '));
      if (postText) {
        // Clone so we can strip our own overlay text before reading
        const postClone = postText.cloneNode(true);
        postClone.querySelectorAll('.ff-overlay, .ff-wrapper').forEach(el => el.remove());
        const postStr = (postClone.innerText || postClone.textContent).trim();
        if (postStr) {
          meta.nearby = (meta.nearby + ' ' + postStr).trim().slice(0, 600);
        }
        break;
      }
      anc = anc.parentElement;
    }
  }

  // URL/src hint (often contains descriptive words like "spider-closeup.jpg")
  const srcUrl = el.src || el.currentSrc || el.getAttribute('poster') || '';
  meta.urlHint = srcUrl.split('?')[0].split('/').pop()
    .replace(/[-_]/g, ' ')
    .replace(/\.[^.]+$/, '')
    .slice(0, 100);

  return meta;
}

async function processImage(img) {
  if (img.hasAttribute(CHECKED_ATTR) || pendingChecks.has(img)) return;
  // Skip images that are inside our own overlays (prevents re-scanning the emoji in overlays)
  if (img.closest('.ff-overlay') || img.closest('.ff-wrapper > .ff-overlay')) return;
  const src = img.src || img.currentSrc;
  if (!src || src.startsWith('data:') || src.startsWith('blob:')) {
    img.setAttribute(CHECKED_ATTR, 'skipped'); return;
  }
  // Skip emoji/icon images from platform emoji CDNs — never blur an emoji
  if (src.includes('/emoji/') || src.includes('emoji/v2/')) {
    img.setAttribute(CHECKED_ATTR, 'skipped'); return;
  }
  await waitForSize(img);
  const w = img.naturalWidth || img.offsetWidth;
  const h = img.naturalHeight || img.offsetHeight;
  if ((w > 0 && w < 80) || (h > 0 && h < 80)) {
    img.setAttribute(CHECKED_ATTR, 'small'); return;
  }
  await checkAndCensor(img, src);
}

async function processVideo(video) {
  if (video.hasAttribute(CHECKED_ATTR) || pendingChecks.has(video)) return;
  if (video.closest('.ff-overlay')) return;
  // Get the video source — try src attribute, currentSrc, or first <source> child
  const src = video.src || video.currentSrc ||
    video.querySelector('source')?.src || '';
  if (!src || src.startsWith('data:') || src.startsWith('blob:')) {
    // For blob/streaming videos we still process using surrounding context
    // (no URL hint, but tweet text / nearby text still works)
  }
  // Wait briefly for video metadata
  await new Promise(resolve => {
    if (video.readyState >= 1) return resolve();
    video.addEventListener('loadedmetadata', resolve, { once: true });
    setTimeout(resolve, 2000);
  });
  await checkAndCensor(video, src);
}

// Shared logic for both images and videos
async function checkAndCensor(el, src) {
  el.setAttribute(CHECKED_ATTR, 'pending');
  pendingChecks.add(el);
  el.classList.add('ff-checking');
  try {
    const htmlMeta = extractHtmlMeta(el);
    const res = await chrome.runtime.sendMessage({
      type: 'CHECK_IMAGE',
      imageUrl: src,
      fears: activeFears,
      customFears: isPro ? customFears : [], // custom fears are Pro-only
      htmlMeta,
      isPro,
    });
    el.classList.remove('ff-checking');
    pendingChecks.delete(el);
    if (res?.success && res.matched) {
      el.setAttribute(CHECKED_ATTR, 'matched');
      el.setAttribute('data-ff-fear', res.matched);
      censorMedia(el, res.matched);
    } else {
      el.setAttribute(CHECKED_ATTR, 'clear');
    }
  } catch (e) {
    el.classList.remove('ff-checking');
    el.setAttribute(CHECKED_ATTR, 'error');
    pendingChecks.delete(el);
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

function censorMedia(el, fear) {
  if (el.parentElement?.classList.contains('ff-wrapper')) { addOverlay(el.parentElement, el, fear); return; }

  // If the element is absolutely positioned (e.g. IMDb, many modern sites), injecting a wrapper
  // breaks the layout: the wrapper becomes the flex/grid child and collapses to zero width
  // while the element becomes positioned relative to a zero-size container.
  // Solution: use the existing positioned parent directly as the overlay container.
  const elPosition = window.getComputedStyle(el).position;
  if (elPosition === 'absolute' || elPosition === 'fixed') {
    const par = el.parentElement;
    if (par && !par.querySelector('.ff-overlay')) {
      addOverlay(par, el, fear);
    }
    return;
  }

  const wrapper = document.createElement('span');
  wrapper.className = 'ff-wrapper';
  const d = window.getComputedStyle(el).display;
  wrapper.style.cssText = `display:${d === 'block' ? 'block' : 'inline-block'};position:relative;`;
  el.parentNode.insertBefore(wrapper, el);
  wrapper.appendChild(el);
  addOverlay(wrapper, el, fear);
}

function addOverlay(wrapper, el, fear) {
  if (wrapper.querySelector('.ff-overlay')) return;

  // Resolve label — built-in or custom fear
  let icon, label;
  if (FEAR_LABELS[fear]) {
    [icon, label] = FEAR_LABELS[fear];
  } else {
    const custom = customFears.find(f => f.id === fear);
    icon  = '🫣';
    label = custom ? custom.name : 'Custom';
  }

  const overlay = document.createElement('div');
  overlay.className = 'ff-overlay';
  overlay.innerHTML = `<span class="ff-icon">${icon}</span><span class="ff-name">${label}</span><span class="ff-hint">click to reveal ✓</span>`;

  let revealed = false;
  overlay.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault(); // keep the click from following any parent <a> link
    revealed = !revealed;
    el.style.filter = revealed ? 'none' : '';
    // Don't use display:none — that causes the browser to re-fire the click
    // on whatever is newly visible underneath (the link). Instead go invisible
    // and non-intercepting so subsequent clicks pass through naturally.
    overlay.style.opacity       = revealed ? '0' : '';
    overlay.style.pointerEvents = revealed ? 'none' : '';
  });
  wrapper.appendChild(overlay);
}

function uncensorAll() {
  document.querySelectorAll('.ff-overlay').forEach(el => el.remove());
  document.querySelectorAll('img[data-ff-fear], video[data-ff-fear]').forEach(el => { el.style.filter = ''; el.removeAttribute('data-ff-fear'); });
  document.querySelectorAll('.ff-wrapper').forEach(w => { const child = w.querySelector('img, video'); if (child) w.replaceWith(child); });
  // Clear checked flags so elements are re-evaluated on the next scan
  document.querySelectorAll(`[${CHECKED_ATTR}]`).forEach(el => el.removeAttribute(CHECKED_ATTR));
  pendingChecks.clear();
}

} // end guard
