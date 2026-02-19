// popup.js - Fear Filter

const FEARS = [
  { id: 'snakes',      icon: '🐍', name: 'Snakes' },
  { id: 'spiders',     icon: '🕷️', name: 'Spiders' },
  { id: 'clowns',      icon: '🤡', name: 'Clowns' },
  { id: 'needles',     icon: '💉', name: 'Needles' },
  { id: 'blood',       icon: '🩸', name: 'Blood' },
  { id: 'heights',     icon: '🏔️', name: 'Heights' },
  { id: 'sharks',      icon: '🦈', name: 'Sharks' },
  { id: 'rats',        icon: '🐀', name: 'Rats & Mice' },
  { id: 'cockroaches', icon: '🪳', name: 'Cockroaches' },
  { id: 'wasps',       icon: '🐝', name: 'Wasps & Bees' },
  { id: 'dolls',       icon: '🪆', name: 'Dolls/Puppets' },
  { id: 'eyes',        icon: '👁️', name: 'Eyes Close-up' },
];

const toggleEnabled = document.getElementById('toggleEnabled');
const fearGrid      = document.getElementById('fearGrid');
const apiKeyInput   = document.getElementById('apiKey');
const showKeyBtn    = document.getElementById('showKey');
const saveBtn       = document.getElementById('saveBtn');
const scanBtn       = document.getElementById('scanBtn');
const statusEl      = document.getElementById('status');
const statChecked   = document.getElementById('statChecked');
const statFiltered  = document.getElementById('statFiltered');

let activeFears = new Set(['snakes']);

// Build fear chips
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

// Load saved settings
chrome.storage.sync.get(['enabled', 'apiKey', 'activeFears', 'totalChecked', 'totalFiltered'], (data) => {
  toggleEnabled.checked = data.enabled !== false;
  apiKeyInput.value = data.apiKey || '';
  statChecked.textContent = (data.totalChecked || 0).toLocaleString();
  statFiltered.textContent = (data.totalFiltered || 0).toLocaleString();
  if (data.activeFears?.length) activeFears = new Set(data.activeFears);
  document.querySelectorAll('.fear-chip').forEach(chip => {
    chip.classList.toggle('active', activeFears.has(chip.dataset.id));
  });
});

// Show/hide key
showKeyBtn.addEventListener('click', () => {
  apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
});

// Save
saveBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  const enabled = toggleEnabled.checked;
  const fears = [...activeFears];
  if (enabled && !key) { showStatus('Please enter an API key', 'err'); return; }
  if (key && !key.startsWith('sk-ant-')) { showStatus('Key should start with sk-ant-...', 'err'); return; }
  if (enabled && fears.length === 0) { showStatus('Select at least one fear to filter', 'err'); return; }
  chrome.storage.sync.set({ enabled, apiKey: key, activeFears: fears }, () => {
    showStatus('Saved! Reload the page to apply.', 'ok');
  });
});

// Scan current tab
scanBtn.addEventListener('click', () => {
  if (!apiKeyInput.value.trim()) { showStatus('Save your API key first', 'err'); return; }
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

// Footer links
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
  setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'status'; }, 3000);
}
