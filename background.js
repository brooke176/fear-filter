// background.js - Fear Filter

const FEAR_PROMPTS = {
  snakes:      'Does this image contain a snake or serpent?',
  spiders:     'Does this image contain a spider or tarantula?',
  clowns:      'Does this image contain a clown?',
  needles:     'Does this image contain a needle, syringe, or injection?',
  blood:       'Does this image contain blood or visible gore/wounds?',
  heights:     'Does this image show a scene from a dangerous height such as a rooftop edge, cliff edge, or tall ladder?',
  sharks:      'Does this image contain a shark?',
  rats:        'Does this image contain a rat or mouse?',
  cockroaches: 'Does this image contain a cockroach or similar large insect pest?',
  wasps:       'Does this image contain a wasp, hornet, or bee?',
  dolls:       'Does this image contain a doll, puppet, or mannequin with a human-like face?',
  eyes:        'Does this image contain an extreme close-up of a human eye or eyes?',
};

// Open onboarding page on first install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHECK_IMAGE') {
    checkImage(message.imageUrl, message.apiKey, message.fears)
      .then(matched => {
        // Update stats
        chrome.storage.sync.get(['totalChecked', 'totalFiltered'], (data) => {
          const updates = { totalChecked: (data.totalChecked || 0) + 1 };
          if (matched) updates.totalFiltered = (data.totalFiltered || 0) + 1;
          chrome.storage.sync.set(updates);
        });
        sendResponse({ success: true, matched });
      })
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

function guessMediaType(url, blobType) {
  const valid = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (blobType && valid.includes(blobType)) return blobType;
  const ext = url.split('?')[0].split('.').pop().toLowerCase();
  const map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
  return map[ext] || 'image/jpeg';
}

async function checkImage(imageUrl, apiKey, fears) {
  if (!fears || fears.length === 0) return null;

  let imageData, mediaType;
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    const blob = await response.blob();
    mediaType = guessMediaType(imageUrl, blob.type);
    if (blob.size > 4 * 1024 * 1024) return null;

    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const chunkSize = 8192;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    imageData = btoa(binary);
  } catch (e) {
    return null;
  }

  const checks = fears.map(f => FEAR_PROMPTS[f]).filter(Boolean);
  if (checks.length === 0) return null;

  const prompt = `Analyze this image and answer each question with only YES or NO, one per line, in order:\n${checks.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;

  const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageData } },
          { type: 'text', text: prompt }
        ]
      }]
    })
  });

  if (!apiResponse.ok) {
    const errBody = await apiResponse.json().catch(() => ({}));
    throw new Error(errBody.error?.message || `API error ${apiResponse.status}`);
  }

  const data = await apiResponse.json();
  const lines = data.content?.[0]?.text?.trim().split('\n') || [];

  for (let i = 0; i < fears.length; i++) {
    if ((lines[i] || '').toUpperCase().includes('YES')) return fears[i];
  }
  return null;
}
