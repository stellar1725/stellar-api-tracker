// ── STELLAR Popup ─────────────────────────────────────────────────────────────
// Works in Chrome (MV3 service worker) and Firefox (MV2 background page).
// Uses chrome.* API — Firefox exposes this via its compat layer.

// Starfield
const starsEl = document.getElementById('stars');
for (let i = 0; i < 45; i++) {
  const s = document.createElement('div');
  s.className = 'star';
  s.style.cssText = `
    left:${Math.random()*100}%;
    top:${Math.random()*100}%;
    --dur:${2 + Math.random()*3}s;
    --delay:${Math.random()*3}s;
    width:${Math.random()>0.8?2:1}px;
    height:${Math.random()>0.8?2:1}px;
  `;
  starsEl.appendChild(s);
}

let allTabs = [];
let selectedTabId = null;

function getHost(url) { try { return new URL(url).hostname; } catch { return url; } }
function trunc(s, n)  { return s.length > n ? s.slice(0,n)+'…' : s; }

function renderTabs(tabs) {
  const list = document.getElementById('tabList');
  if (!tabs || tabs.length === 0) {
    list.innerHTML = '<div class="no-tabs">Browse any web app to begin capturing signals.</div>';
    return;
  }
  list.innerHTML = tabs.map(t => `
    <div class="tab-item ${selectedTabId===t.tabId?'selected':''}" data-id="${t.tabId}">
      <div class="tab-favicon">🌐</div>
      <div class="tab-info">
        <div class="tab-title">${trunc(t.title||getHost(t.url), 28)}</div>
        <div class="tab-url">${trunc(t.url||'', 36)}</div>
      </div>
      <div class="tab-count ${t.count>0?'has-data':''}">${t.count}</div>
    </div>
  `).join('');

  list.querySelectorAll('.tab-item').forEach(el => {
    el.addEventListener('click', () => {
      selectedTabId = parseInt(el.dataset.id);
      renderTabs(allTabs);
      updateToggleBtn();
    });
  });
}

function updateToggleBtn() {
  const btn = document.getElementById('toggleBtn');
  const dot = document.getElementById('liveDot');
  const txt = document.getElementById('liveText');
  if (!selectedTabId) return;
  const tab = allTabs.find(t => t.tabId === selectedTabId);
  const capturing = tab ? tab.capturing !== false : true;
  if (capturing) {
    btn.textContent = '⏸ Pause';
    btn.className = 'btn btn-toggle';
    dot.className = 'live-dot';
    txt.textContent = 'LIVE';
  } else {
    btn.textContent = '▶ Resume';
    btn.className = 'btn btn-toggle paused';
    dot.className = 'live-dot paused';
    txt.textContent = 'PAUSED';
  }
}

function loadData() {
  chrome.runtime.sendMessage({ type: 'GET_ALL_TABS' }, (response) => {
    if (chrome.runtime.lastError || !response) return;
    allTabs = response.tabs || [];
    if (!selectedTabId && allTabs.length > 0) selectedTabId = allTabs[0].tabId;
    const total = allTabs.reduce((s,t) => s+t.count, 0);
    document.getElementById('totalCalls').textContent = total;
    document.getElementById('totalTabs').textContent  = allTabs.filter(t=>t.count>0).length;
    renderTabs(allTabs);
    updateToggleBtn();
  });
}

document.getElementById('toggleBtn').addEventListener('click', () => {
  if (!selectedTabId) return;
  chrome.runtime.sendMessage({ type: 'TOGGLE_CAPTURE', tabId: selectedTabId }, () => loadData());
});

document.getElementById('clearBtn').addEventListener('click', () => {
  if (!selectedTabId) return;
  chrome.runtime.sendMessage({ type: 'CLEAR_CALLS', tabId: selectedTabId }, () => loadData());
});

document.getElementById('dashBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
});

loadData();
setInterval(loadData, 2000);
