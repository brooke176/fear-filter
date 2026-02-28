// ── State ──────────────────────────────────────────────────────────────────────
let _isPro = false;

// ── show() — called by Swift once the page loads ───────────────────────────────
// isPro is read from App Group UserDefaults and passed in by ViewController.
function show(platform, enabled, useSettingsInsteadOfPreferences, isPro) {
    document.body.classList.add(`platform-${platform}`);

    if (useSettingsInsteadOfPreferences) {
        document.querySelector('button.open-preferences').textContent = 'Open Safari Settings…';
    }

    if (typeof enabled === 'boolean') {
        document.body.classList.toggle('state-on', enabled);
        document.body.classList.toggle('state-off', !enabled);
    }

    _isPro = !!isPro;
    updateProState();
}

// ── Pro state ──────────────────────────────────────────────────────────────────
function updateProState() {
    document.body.classList.toggle('state-pro', _isPro);
}

// ── IAP result callback — called by Swift ──────────────────────────────────────
function onIAPResult(success, errorMsg) {
    const btn  = document.getElementById('buyBtn');
    const rBtn = document.getElementById('restoreBtn');
    const err  = document.getElementById('iapError');

    // Re-enable buttons
    if (btn)  { btn.disabled  = false; btn.textContent  = 'Get Fear Filter Pro  ✦'; }
    if (rBtn) { rBtn.disabled = false; rBtn.textContent = 'Restore Purchase'; }

    if (success) {
        _isPro = true;
        updateProState();
    } else if (errorMsg === 'no_purchases') {
        if (err) { err.textContent = 'No previous purchase found for this Apple ID.'; err.hidden = false; }
    } else if (errorMsg) {
        if (err) { err.textContent = errorMsg; err.hidden = false; }
    }
    // errorMsg === null with success===false means user cancelled — show nothing
}

// ── Button handlers ────────────────────────────────────────────────────────────
function openPreferences() {
    webkit.messageHandlers.controller.postMessage({ action: 'open-preferences' });
}

function buyPro() {
    const btn = document.getElementById('buyBtn');
    const err = document.getElementById('iapError');
    if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
    if (err) { err.hidden = true; err.textContent = ''; }
    webkit.messageHandlers.controller.postMessage({ action: 'buy' });
}

function restorePurchases() {
    const btn = document.getElementById('restoreBtn');
    const err = document.getElementById('iapError');
    if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
    if (err) { err.hidden = true; err.textContent = ''; }
    webkit.messageHandlers.controller.postMessage({ action: 'restorePurchases' });
}

// ── Wire up buttons ────────────────────────────────────────────────────────────
document.querySelector('button.open-preferences')
    .addEventListener('click', openPreferences);

const buyBtn = document.getElementById('buyBtn');
if (buyBtn) buyBtn.addEventListener('click', buyPro);

const restoreBtn = document.getElementById('restoreBtn');
if (restoreBtn) restoreBtn.addEventListener('click', restorePurchases);

