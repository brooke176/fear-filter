// background.js - Fear Filter
// Open-source image detection: no API key required.
//
// Detection runs in two layers:
//   1. Instant HTML metadata check (alt text, captions, etc.) — free, zero latency
//   2. Transformers.js CLIP model running locally in the browser — private, no server
//
// The CLIP model (~170MB) is downloaded once from Hugging Face and cached by the browser.
// NOTE: For production builds, bundle Transformers.js locally instead of using the CDN.
//       Run: npm install @huggingface/transformers  then bundle with vite/rollup/webpack.

// ── Keyword lists for instant HTML metadata matching ──────────────────────────
const FEAR_KEYWORDS = {
  snakes:      ['snake', 'serpent', 'cobra', 'viper', 'boa', 'anaconda', 'rattlesnake', 'mamba', 'asp', 'python snake',
                'squamata', 'colubridae', 'elapidae', 'viperidae'],  // scientific family names
  spiders:     ['spider', 'tarantula', 'arachnid', 'black widow', 'brown recluse', 'wolf spider',
                'araneae', 'araneomorphae', 'mygalomorphae', 'theraphosidae'],  // scientific order/families
  clowns:      ['clown', 'jester', 'pennywise', 'coulrophobia'],
  needles:     ['needle', 'syringe', 'injection', 'vaccine', 'hypodermic', 'inoculation', 'venipuncture', 'phlebotomy'],
  blood:       ['blood', 'bloody', 'gore', 'gory', 'bleeding', 'hemorrhage', 'haemorrhage', 'hematoma', 'wound'],
  sharks:      ['shark', 'sharks', 'great white', 'hammerhead', 'bull shark', 'tiger shark',
                'whale shark', 'selachii', 'carcharodon', 'lamniformes', 'selachimorpha'],
  rats:        ['rat', 'rats', 'mice', 'rodent', 'vermin', 'field mouse', 'house mouse',
                'muridae', 'rattus', 'mus musculus'],  // scientific names
  cockroaches: ['cockroach', 'cockroaches', 'roach', 'roaches', 'blattodea', 'blattella'],
  wasps:       ['wasp', 'wasps', 'hornet', 'hornets', 'yellowjacket', 'yellow jacket', 'vespidae', 'vespula'],
  dolls:       ['doll', 'puppet', 'mannequin', 'ventriloquist', 'marionette', 'automaton', 'effigy'],
  eyes:        ['close-up eye', 'closeup eye', 'eye macro', 'macro eye', 'iris close', 'pupil close',
                'cornea', 'iris photograph', 'human eye close', 'eye close-up', 'extreme close'],
};

// ── CLIP text labels for visual detection ─────────────────────────────────────
const FEAR_CLIP_LABELS = {
  snakes:      'a photo of a snake or serpent',
  spiders:     'a photo of a spider or tarantula',
  clowns:      'a photo of a clown with face paint',
  needles:     'a photo of a hypodermic needle or syringe',
  blood:       'a photo containing blood or gore',
  sharks:      'a photo of a shark',
  rats:        'a photo of a rat or mouse',
  cockroaches: 'a photo of a cockroach',
  wasps:       'a photo of a wasp, hornet, or bee',
  dolls:       'a photo of a creepy doll, puppet, or mannequin',
  eyes:        'an extreme close-up photograph of a human eye',
};

// ── CLIP pipeline singleton ───────────────────────────────────────────────────
// Lazy-loaded and cached for the lifetime of the service worker.
// If the CDN is unavailable or CSP blocks it, CLIP silently falls back to null
// and the extension continues to work using HTML metadata detection only.
let _classifier = null;
let _classifierPromise = null;

async function getClassifier() {
  if (_classifier) return _classifier;
  if (_classifierPromise) return _classifierPromise;

  _classifierPromise = (async () => {
    try {
      // Locally bundled — generate with: npm install && npm run build
      // (Chrome extensions cannot load scripts from external URLs)
      const { pipeline, env } = await import(
        chrome.runtime.getURL('transformers.bundle.js')
      );
      env.useBrowserCache = true;
      env.allowLocalModels = false;
      const clf = await pipeline(
        'zero-shot-image-classification',
        'Xenova/clip-vit-base-patch32',
        { dtype: 'q8' } // quantized: ~85MB vs ~340MB, minimal accuracy trade-off
      );
      _classifier = clf;
      return clf;
    } catch (err) {
      console.warn('[FearFilter] AI model unavailable, using text-only detection:', err.message);
      _classifierPromise = null; // allow retry on next check
      return null;
    }
  })();

  return _classifierPromise;
}

// ── Onboarding ────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  }
});

// ── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHECK_IMAGE') {
    const isPro = message.isPro === true;
    checkImage(message.imageUrl, message.fears, message.htmlMeta, message.customFears, isPro)
      .then(matched => {
        chrome.storage.sync.get(['totalChecked', 'totalFiltered'], (data) => {
          const updates = { totalChecked: (data.totalChecked || 0) + 1 };
          if (matched) updates.totalFiltered = (data.totalFiltered || 0) + 1;
          chrome.storage.sync.set(updates);
        });
        sendResponse({ success: true, matched });
      })
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // keep message channel open for async response
  }
});

// ── Layer 1: HTML metadata keyword check (instant, zero network cost) ─────────
function checkHtmlMeta(htmlMeta, fears, customFears = []) {
  if (!htmlMeta) return null;
  const text = [htmlMeta.alt, htmlMeta.title, htmlMeta.ariaLabel, htmlMeta.caption, htmlMeta.nearby, htmlMeta.urlHint]
    .filter(Boolean)
    .join(' ');
  if (!text.trim()) return null;

  for (const fear of fears) {
    // Built-in fear: use keyword list
    const keywords = FEAR_KEYWORDS[fear];
    if (keywords) {
      for (const kw of keywords) {
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`\\b${escaped}\\b`, 'i').test(text)) return fear;
      }
    } else {
      // Custom fear: match the fear name itself as a keyword
      const custom = customFears.find(f => f.id === fear);
      if (custom) {
        const escaped = custom.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`\\b${escaped}\\b`, 'i').test(text)) return fear;
      }
    }
  }
  return null;
}

// ── Layer 2: CLIP visual classification (local, private, no server) ───────────
async function checkImageWithClip(imageData, mediaType, fears, customFears = []) {
  // Build label list: built-in fears use their pre-written labels;
  // custom fears get a generated label from the fear name.
  const fearLabels = fears.map(f => {
    if (FEAR_CLIP_LABELS[f]) return FEAR_CLIP_LABELS[f];
    const custom = customFears.find(c => c.id === f);
    return custom ? `a photo of ${custom.name.toLowerCase()}` : null;
  }).filter(Boolean);
  if (fearLabels.length === 0) return null;

  const classifier = await getClassifier();
  if (!classifier) return null; // model unavailable, skip gracefully

  const neutralLabel = 'a normal everyday photo with none of those things';
  const allLabels = [...fearLabels, neutralLabel];
  const dataUrl = `data:${mediaType};base64,${imageData}`;

  // Results are sorted by score descending.
  // If neutral wins, or all scores are below threshold, return null.
  const THRESHOLD = 0.25;
  const results = await classifier(dataUrl, allLabels);

  for (const { label, score } of results) {
    if (label === neutralLabel || score < THRESHOLD) break;
    // Match back to fear ID — check built-in first, then custom
    const matchedFear = fears.find(f => {
      if (FEAR_CLIP_LABELS[f] === label) return true;
      const custom = customFears.find(c => c.id === f);
      return custom ? `a photo of ${custom.name.toLowerCase()}` === label : false;
    });
    if (matchedFear) return matchedFear;
  }
  return null;
}

// ── Main entry point ──────────────────────────────────────────────────────────
async function checkImage(imageUrl, fears, htmlMeta, customFears = [], isPro = false) {
  if (!fears || fears.length === 0) return null;

  // Free users: strip out custom fear IDs so they don't get matched
  const activeCustomFears = isPro ? customFears : [];
  const activeFearsFiltered = isPro
    ? fears
    : fears.filter(f => !f.startsWith('custom_'));

  // Layer 1: instant HTML metadata check (free + pro)
  const metaMatch = checkHtmlMeta(htmlMeta, activeFearsFiltered, activeCustomFears);
  if (metaMatch) return metaMatch;

  // Layer 2: CLIP visual classification — Pro only
  if (!isPro) return null;

  let imageData, mediaType;
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    const blob = await response.blob();
    mediaType = guessMediaType(imageUrl, blob.type);
    if (blob.size > 4 * 1024 * 1024) return null; // skip images over 4MB

    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const chunkSize = 8192;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    imageData = btoa(binary);
  } catch {
    return null;
  }

  try {
    return await checkImageWithClip(imageData, mediaType, activeFearsFiltered, activeCustomFears);
  } catch {
    return null; // graceful fallback
  }
}

function guessMediaType(url, blobType) {
  const valid = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (blobType && valid.includes(blobType)) return blobType;
  const ext = url.split('?')[0].split('.').pop().toLowerCase();
  const map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
  return map[ext] || 'image/jpeg';
}
