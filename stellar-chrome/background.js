// ── STELLAR — Unified Background (Chrome SW + Firefox background page) ────────
// Works in both browsers via the chrome.* compatibility layer.
// Firefox MV2: persistent background page (script)
// Chrome MV3:  service worker

const tabData = {};          // { [tabId]: { url, title, calls[], capturing } }
const pendingRequests = {};  // { [requestId]: pending info }

function isInternalUrl(url) {
  if (!url) return true;
  return (
    url.startsWith('chrome-extension://') ||
    url.startsWith('moz-extension://') ||
    url.startsWith('chrome://') ||
    url.startsWith('about:') ||
    url.startsWith('moz://') ||
    url.startsWith('resource://')
  );
}

function getTabData(tabId) {
  if (!tabData[tabId]) {
    tabData[tabId] = { url: '', title: '', calls: [], capturing: true };
  }
  return tabData[tabId];
}

function addCall(tabId, call) {
  if (!tabId || tabId < 0) return;
  const data = getTabData(tabId);
  if (!data.capturing) return;
  // Deduplicate by method + url
  const exists = data.calls.some(c => c.url === call.url && c.method === call.method);
  if (!exists) {
    data.calls.push(call);
    // Notify open dashboards (fire-and-forget, ignore errors)
    try {
      chrome.runtime.sendMessage({ type: 'CALL_ADDED', tabId, call }, () => {
        void chrome.runtime.lastError; // suppress "no receiver" errors
      });
    } catch (_) {}
  }
}

// ── webRequest: intercept XHR/Fetch at network level ─────────────────────────
// `xmlhttprequest` covers both XHR and fetch() in both browsers.

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.type !== 'xmlhttprequest') return;
    if (details.tabId < 0) return;
    if (isInternalUrl(details.url)) return;

    pendingRequests[details.requestId] = {
      tabId:     details.tabId,
      method:    (details.method || 'GET').toUpperCase(),
      url:       details.url,
      timestamp: new Date().toISOString(),
    };
  },
  { urls: ['<all_urls>'] },
  ['requestBody']
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.type !== 'xmlhttprequest') return;
    const p = pendingRequests[details.requestId];
    if (!p) return;
    delete pendingRequests[details.requestId];

    addCall(p.tabId, {
      id:        `${details.requestId}_${Date.now()}`,
      url:       p.url,
      method:    p.method,
      type:      'XHR/Fetch',
      status:    details.statusCode,
      timestamp: p.timestamp,
    });
  },
  { urls: ['<all_urls>'] }
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    if (details.type !== 'xmlhttprequest') return;
    const p = pendingRequests[details.requestId];
    if (!p) return;
    delete pendingRequests[details.requestId];

    addCall(p.tabId, {
      id:        `${details.requestId}_${Date.now()}`,
      url:       p.url,
      method:    p.method,
      type:      'XHR/Fetch',
      status:    0,
      error:     details.error || 'Network error',
      timestamp: p.timestamp,
    });
  },
  { urls: ['<all_urls>'] }
);

// ── Tab tracking ──────────────────────────────────────────────────────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (isInternalUrl(tab.url || '')) return;
  const data = getTabData(tabId);
  if (changeInfo.url)   data.url   = changeInfo.url;
  if (tab.title)        data.title = tab.title;
  if (changeInfo.title) data.title = changeInfo.title;
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    if (!tab || isInternalUrl(tab.url || '')) return;
    const data = getTabData(tabId);
    data.url   = tab.url   || '';
    data.title = tab.title || '';
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabData[tabId];
});

// ── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

  if (message.type === 'GET_CALLS') {
    const d = tabData[message.tabId];
    sendResponse({ calls: d ? d.calls : [] });
    return true;
  }

  if (message.type === 'GET_ALL_TABS') {
    const tabs = Object.entries(tabData)
      .filter(([, d]) => d.url && !isInternalUrl(d.url))
      .map(([id, d]) => ({
        tabId:      parseInt(id),
        url:        d.url,
        title:      d.title || d.url,
        count:      d.calls.length,
        capturing:  d.capturing,
      }));
    sendResponse({ tabs });
    return true;
  }

  if (message.type === 'CLEAR_CALLS') {
    if (tabData[message.tabId]) tabData[message.tabId].calls = [];
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'CLEAR_ALL') {
    Object.values(tabData).forEach(d => { d.calls = []; });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'TOGGLE_CAPTURE') {
    const d = getTabData(message.tabId);
    d.capturing = !d.capturing;
    sendResponse({ capturing: d.capturing });
    return true;
  }

  if (message.type === 'GET_STATUS') {
    const d = getTabData(message.tabId);
    sendResponse({ capturing: d.capturing, count: d.calls.length });
    return true;
  }

  return true;
});
