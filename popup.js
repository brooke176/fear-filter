// popup.js - Fear Filter

// ── Gumroad store config ───────────────────────────────────────────────────────
const BUY_URL = 'https://brookemarie.gumroad.com/l/fearfilter';
const GUMROAD_PRODUCT_ID = 'MIY8TTEMoq1YF0UOSXTPXQ==';
// ─────────────────────────────────────────────────────────────────────────────

const FEARS = [
  { id: 'snakes',      icon: '🐍', name: 'Snakes' },
  { id: 'spiders',     icon: '🕷️', name: 'Spiders' },
  { id: 'clowns',      icon: '🤡', name: 'Clowns' },
  { id: 'needles',     icon: '💉', name: 'Needles' },
  { id: 'blood',       icon: '🩸', name: 'Blood' },
  { id: 'sharks',      icon: '🦈', name: 'Sharks' },
  { id: 'rats',        icon: '🐀', name: 'Rats & Mice' },
  { id: 'cockroaches', icon: '🪳', name: 'Cockroaches' },
  { id: 'wasps',       icon: '🐝', name: 'Wasps & Bees' },
  { id: 'dolls',       icon: '🪆', name: 'Dolls/Puppets' },
  { id: 'eyes',        icon: '👁️', name: 'Eyes Close-up' },
];

// ── DOM references ────────────────────────────────────────────────────────────
const toggleEnabled    = document.getElementById('toggleEnabled');
const fearGrid         = document.getElementById('fearGrid');
const addFearBtn       = document.getElementById('addFearBtn');
const customFearInput  = document.getElementById('customFearInput');
const saveBtn          = document.getElementById('saveBtn');
const scanBtn          = document.getElementById('scanBtn');
const statusEl         = document.getElementById('status');
const statChecked      = document.getElementById('statChecked');
const statFiltered     = document.getElementById('statFiltered');

// Pro UI elements
const proBadge          = document.getElementById('proBadge');
const customLockOverlay = document.getElementById('customLockOverlay');
const proUpgrade        = document.getElementById('proUpgrade');
const proActive         = document.getElementById('proActive');
const licenseKeyInput   = document.getElementById('licenseKeyInput');
const activateBtn       = document.getElementById('activateBtn');
const deactivateBtn     = document.getElementById('deactivateBtn');

// ── State ─────────────────────────────────────────────────────────────────────
let activeFears       = new Set(['snakes']);
let customFears       = []; // [{ id: string, name: string }]
let isPro             = false;
let licenseKey        = '';
let licenseInstanceId = '';

// ── Build built-in fear chips ─────────────────────────────────────────────────
FEARS.forEach(fear => {
  const chip = document.createElement('div');
  chip.className = 'fear-chip';
  chip.dataset.id = fear.id;
  chip.innerHTML = `<span class="chip-icon">${fear.icon}</span><span class="chip-name">${fear.name}</span><span class="chip-check">✓</span>`;
  chip.addEventListener('click', () => {
    activeFears.has(fear.id) ? activeFears.delete(fear.id) : activeFears.add(fear.id);
    chip.classList.toggle('active', activeFears.has(fear.id));
  });
  fearGrid.appendChild(chip);
});

// ── Render a custom fear chip ─────────────────────────────────────────────────
function renderCustomChip(cf, isActive = true) {
  if (document.querySelector(`.fear-chip[data-id="${cf.id}"]`)) return;
  if (isActive) activeFears.add(cf.id);

  const chip = document.createElement('div');
  chip.className = 'fear-chip custom-chip' + (isActive ? ' active' : '');
  chip.dataset.id = cf.id;
  const safeName = cf.name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  chip.innerHTML = `
    <span class="chip-icon">🫣</span>
    <span class="chip-name">${safeName}</span>
    <span class="chip-check">✓</span>
    <button class="chip-remove" title="Remove this fear" tabindex="-1">✕</button>
  `;
  chip.addEventListener('click', (e) => {
    if (e.target.closest('.chip-remove')) return;
    activeFears.has(cf.id) ? activeFears.delete(cf.id) : activeFears.add(cf.id);
    chip.classList.toggle('active', activeFears.has(cf.id));
  });
  chip.querySelector('.chip-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    customFears = customFears.filter(f => f.id !== cf.id);
    activeFears.delete(cf.id);
    chip.remove();
  });
  fearGrid.appendChild(chip);
}

// ── Load saved settings ───────────────────────────────────────────────────────
chrome.storage.sync.get(
  ['enabled', 'activeFears', 'customFears', 'totalChecked', 'totalFiltered',
   'isPro', 'licenseKey', 'licenseInstanceId'],
  (data) => {
    toggleEnabled.checked = data.enabled !== false;
    statChecked.textContent  = (data.totalChecked  || 0).toLocaleString();
    statFiltered.textContent = (data.totalFiltered || 0).toLocaleString();

    if (data.activeFears?.length) activeFears = new Set(data.activeFears);
    document.querySelectorAll('.fear-chip').forEach(chip => {
      chip.classList.toggle('active', activeFears.has(chip.dataset.id));
    });

    customFears = data.customFears || [];
    customFears.forEach(cf => renderCustomChip(cf, activeFears.has(cf.id)));

    isPro             = data.isPro === true;
    licenseKey        = data.licenseKey || '';
    licenseInstanceId = data.licenseInstanceId || '';
    updateProUI();
  }
);

// ── Pro UI state ──────────────────────────────────────────────────────────────
function updateProUI() {
  if (isPro) {
    proBadge.style.display          = 'inline-block';
    customLockOverlay.style.display = 'none';
    customFearInput.disabled        = false;
    addFearBtn.disabled             = false;
    proUpgrade.style.display        = 'none';
    proActive.style.display         = 'flex';
  } else {
    proBadge.style.display          = 'none';
    customLockOverlay.style.display = 'flex';
    customFearInput.disabled        = true;
    addFearBtn.disabled             = true;
    proUpgrade.style.display        = 'flex';
    proActive.style.display         = 'none';
  }
}

// ── Add a custom fear (Pro only) ──────────────────────────────────────────────
function addCustomFear() {
  if (!isPro) { showStatus('Custom fears require Fear Filter Pro', 'err'); return; }
  const name = customFearInput.value.trim();
  if (!name) return;
  if (name.length > 30) { showStatus('Keep it under 30 characters', 'err'); return; }
  const lower = name.toLowerCase();
  const alreadyExists = [
    ...FEARS.map(f => f.name.toLowerCase()),
    ...customFears.map(f => f.name.toLowerCase()),
  ].some(n => n === lower);
  if (alreadyExists) { showStatus('Already in your list!', 'err'); return; }
  const cf = { id: 'custom_' + Date.now(), name };
  customFears.push(cf);
  renderCustomChip(cf, true);
  customFearInput.value = '';
  customFearInput.focus();
  showStatus(`"${name}" added`, 'ok');
}

addFearBtn.addEventListener('click', addCustomFear);
customFearInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addCustomFear();
});

// ── Save settings ─────────────────────────────────────────────────────────────
saveBtn.addEventListener('click', () => {
  const enabled = toggleEnabled.checked;
  const fears = [...activeFears];
  if (enabled && fears.length === 0) { showStatus('Select at least one fear to filter', 'err'); return; }
  chrome.storage.sync.set({ enabled, activeFears: fears, customFears }, () => {
    showStatus('Saved! Reload the page to apply.', 'ok');
  });
});

// ── Scan current tab ──────────────────────────────────────────────────────────
scanBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab) return;
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        window.__fearFilterLoaded = false;
        document.querySelectorAll('img[data-ff-checked]').forEach(img => img.removeAttribute('data-ff-checked'));
      }
    }).then(() => chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }))
      .then(() => showStatus('Scanning page...', 'ok'))
      .catch(() => showStatus("Can't scan this page type", 'err'));
  });
});

// ── License: activate ─────────────────────────────────────────────────────────
activateBtn.addEventListener('click', async () => {
  const key = licenseKeyInput.value.trim();
  if (!key) { showStatus('Paste your license key first', 'err'); return; }

  activateBtn.disabled    = true;
  activateBtn.textContent = 'Checking…';

  try {
    const result = await activateLicenseKey(key);
    if (result.success) {
      isPro             = true;
      licenseKey        = key;
      licenseInstanceId = result.instanceId;
      chrome.storage.sync.set({ isPro: true, licenseKey: key, licenseInstanceId: result.instanceId });
      updateProUI();
      showStatus('Pro activated — thank you! 🎉', 'ok');
    } else {
      showStatus(result.error || 'Invalid license key', 'err');
    }
  } catch {
    showStatus('Could not verify — check your connection', 'err');
  } finally {
    activateBtn.disabled    = false;
    activateBtn.textContent = 'Activate';
  }
});

// ── License: deactivate ───────────────────────────────────────────────────────
deactivateBtn.addEventListener('click', async () => {
  if (!confirm('Deactivate Fear Filter Pro on this device?')) return;
  try {
    await deactivateLicenseKey(licenseKey, licenseInstanceId);
  } catch {
    // best-effort — clear local state regardless
  }
  isPro             = false;
  licenseKey        = '';
  licenseInstanceId = '';
  chrome.storage.sync.set({ isPro: false, licenseKey: '', licenseInstanceId: '' });
  updateProUI();
  showStatus('Pro deactivated', 'ok');
});

// ── Safari vs Chrome ──────────────────────────────────────────────────────────
// Safari: use Apple IAP — check status via native message to SafariWebExtensionHandler.
// Chrome: use Gumroad license key flow.
const isSafari = typeof browser !== 'undefined' &&
                 /Version\/[\d.]+.*Safari/.test(navigator.userAgent) &&
                 !navigator.userAgent.includes('Chrome');

if (isSafari) {
  // Replace upgrade section with a simple message — purchase happens in the Mac app
  const proUpgradeSection = document.getElementById('proUpgrade');
  if (proUpgradeSection) {
    proUpgradeSection.innerHTML = `
      <p style="font-size:12px;color:#555;text-align:center;line-height:1.5">
        Open the <b style="color:#888">Fear Filter app</b> on your Mac to purchase Pro.
      </p>`;
  }
  // Check IAP status from the native app
  try {
    browser.runtime.sendNativeMessage('com.brookeskinner.fearfilter',
      { action: 'checkIAPStatus' },
      (response) => {
        if (response && response.isPro && !isPro) {
          isPro = true;
          chrome.storage.sync.set({ isPro: true, licenseKey: 'iap', licenseInstanceId: 'iap' });
          updateProUI();
        }
      }
    );
  } catch (e) { /* not in Safari native context */ }

} else {
  // Chrome: show Gumroad buy link
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) {
    const buyLink = document.getElementById('buyLink');
    if (buyLink) buyLink.style.display = 'none';
    const buyRow = document.querySelector('.pro-buy-row');
    if (buyRow) buyRow.innerHTML = '<span style="color:#444">Purchase at fearfilter.app on Mac or desktop</span>';
  }
  const buyLink = document.getElementById('buyLink');
  if (buyLink) {
    buyLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: BUY_URL });
    });
  }
}

// ── Gumroad license API ───────────────────────────────────────────────────────
// Gumroad's /v2/licenses/verify endpoint is unauthenticated.
// It takes the product permalink and license key, and increments the use count
// on first activation so you can track seats.
async function activateLicenseKey(key) {
  const resp = await fetch('https://api.gumroad.com/v2/licenses/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      product_id: GUMROAD_PRODUCT_ID,
      license_key: key,
      increment_uses_count: 'true',
    }),
  });
  const data = await resp.json();
  if (data.success) {
    return { success: true, instanceId: key }; // Gumroad has no instance IDs, reuse key
  }
  return { success: false, error: data.message || 'Activation failed' };
}

async function deactivateLicenseKey(key, instanceId) {
  // Gumroad has no deactivation endpoint — nothing to do on sign-out.
  // The use count stays incremented, which is fine for a single-user extension.
  return;
}

// ── Footer links ──────────────────────────────────────────────────────────────
document.getElementById('onboardingLink').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
});
document.getElementById('privacyLink').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('privacy.html') });
});

function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
  setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'status'; }, 3500);
}
