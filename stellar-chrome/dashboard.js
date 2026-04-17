// ── STELLAR Dashboard ─────────────────────────────────────────────────────────
// Unified for Chrome MV3 (service worker) and Firefox MV2 (background page).
// Uses chrome.* API — Firefox exposes this natively via compat shim.

// Starfield
const sf = document.getElementById('starfield');
for (let i = 0; i < 80; i++) {
  const s = document.createElement('div');
  s.className = 'star';
  const sz = Math.random() > 0.85 ? 2 : 1;
  s.style.cssText = `left:${Math.random()*100}%;top:${Math.random()*100}%;width:${sz}px;height:${sz}px;--d:${2+Math.random()*4}s;--dl:${Math.random()*4}s`;
  sf.appendChild(s);
}

// ── State ─────────────────────────────────────────────────────────────────────
let allCalls      = [];
let filtered      = [];
let allTabs       = [];
let selectedTabId = null;
let isCapturing   = true;
let sortCol       = 'timestamp';
let sortDir       = 'desc';
let statusFilter  = null;
let activeView    = 'table';

// ── Utils ─────────────────────────────────────────────────────────────────────
function host(url)   { try { return new URL(url).hostname;                     } catch { return url; } }
function urlPath(url){ try { const u=new URL(url); return u.pathname+(u.search||''); } catch { return url; } }
function trunc(s,n)  { return s.length>n ? s.slice(0,n)+'…' : s; }

function scClass(s) {
  if (!s||s===0) return 's0';
  if (s>=500) return 's5';
  if (s>=400) return 's4';
  if (s>=300) return 's3';
  return 's2';
}

function mClass(m) {
  const k=(m||'GET').toUpperCase();
  return ['GET','POST','PUT','DELETE','PATCH'].includes(k) ? `m-${k}` : 'm-OTHER';
}

function fmt(ts) {
  if (!ts) return '—';
  try {
    const d=new Date(ts);
    return d.toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'})
      +'.'+String(d.getMilliseconds()).padStart(3,'0');
  } catch { return ts; }
}

function toast(msg, icon='✓') {
  const t=document.getElementById('toast');
  document.getElementById('toastMsg').textContent  = msg;
  document.getElementById('toastIcon').textContent = icon;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2200);
}

function copy(text) {
  navigator.clipboard.writeText(text).then(()=>toast('Copied!','⧉'));
}

// ── Data ──────────────────────────────────────────────────────────────────────
function loadTabs() {
  chrome.runtime.sendMessage({ type: 'GET_ALL_TABS' }, (res) => {
    if (chrome.runtime.lastError || !res) return;
    allTabs = res.tabs || [];
    if (!selectedTabId && allTabs.length > 0) selectedTabId = allTabs[0].tabId;
    renderTabPicker();
    if (selectedTabId) loadCalls();
  });
}

function loadCalls() {
  if (!selectedTabId) return;
  chrome.runtime.sendMessage({ type: 'GET_CALLS', tabId: selectedTabId }, (res) => {
    if (chrome.runtime.lastError || !res) return;
    allCalls = res.calls || [];
    applyFilters();
    renderSidebar();
  });
  chrome.runtime.sendMessage({ type: 'GET_STATUS', tabId: selectedTabId }, (res) => {
    if (chrome.runtime.lastError || !res) return;
    isCapturing = res.capturing;
    updateCaptureUI();
  });
}

// ── Tab picker ────────────────────────────────────────────────────────────────
function renderTabPicker() {
  const picker = document.getElementById('tabPicker');
  if (allTabs.length === 0) {
    picker.innerHTML = '<span style="color:var(--muted);font-size:10px;">No targets yet — browse a web app</span>';
    return;
  }
  picker.innerHTML = allTabs.map(t => `
    <div class="tab-chip ${t.tabId===selectedTabId?'active':''}" data-id="${t.tabId}">
      <span class="tab-chip-title">${trunc(t.title||host(t.url), 22)}</span>
      <span class="tab-chip-count">${t.count}</span>
    </div>
  `).join('');
  picker.querySelectorAll('.tab-chip').forEach(el => {
    el.addEventListener('click', () => {
      selectedTabId = parseInt(el.dataset.id);
      renderTabPicker();
      loadCalls();
    });
  });
}

// ── Filters ───────────────────────────────────────────────────────────────────
function applyFilters() {
  const q  = document.getElementById('searchInput').value.toLowerCase();
  const m  = document.getElementById('mFilter').value;
  const sv = document.getElementById('sFilter').value;

  filtered = allCalls.filter(c => {
    if (q && !c.url.toLowerCase().includes(q) &&
        !(c.method||'').toLowerCase().includes(q) &&
        !String(c.status||'').includes(q)) return false;
    if (m && c.method !== m) return false;
    if (sv !== '') {
      const f=parseInt(sv), s=c.status||0;
      if (f===0 && s!==0) return false;
      if (f===2 && (s<200||s>=300)) return false;
      if (f===3 && (s<300||s>=400)) return false;
      if (f===4 && (s<400||s>=500)) return false;
      if (f===5 && s<500) return false;
    }
    if (statusFilter !== null) {
      const s=c.status||0;
      if (statusFilter===0 && s!==0) return false;
      if (statusFilter===2 && (s<200||s>=300)) return false;
      if (statusFilter===3 && (s<300||s>=400)) return false;
      if (statusFilter===4 && (s<400||s>=500)) return false;
      if (statusFilter===5 && s<500) return false;
    }
    return true;
  });

  filtered.sort((a,b) => {
    let av=a[sortCol]||'', bv=b[sortCol]||'';
    if (typeof av==='number'&&typeof bv==='number') return sortDir==='asc'?av-bv:bv-av;
    return sortDir==='asc'?String(av).localeCompare(String(bv)):String(bv).localeCompare(String(av));
  });

  updateCounts();
  renderCurrentView();
}

function updateCounts() {
  const epSet = new Set(filtered.map(c=>`${c.method}::${urlPath(c.url)}`));
  document.getElementById('cntTable').textContent     = filtered.length;
  document.getElementById('cntTimeline').textContent  = filtered.length;
  document.getElementById('cntEndpoints').textContent = epSet.size;
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function renderSidebar() {
  document.getElementById('sTotalCalls').textContent = allCalls.length;
  document.getElementById('sUniqueUrls').textContent = new Set(allCalls.map(c=>c.url)).size;
  document.getElementById('sHosts').textContent      = new Set(allCalls.map(c=>host(c.url))).size;
  document.getElementById('sErrors').textContent     = allCalls.filter(c=>!c.status||c.status===0||c.status>=400).length;

  const mc={};
  allCalls.forEach(c=>{ const m=c.method||'GET'; mc[m]=(mc[m]||0)+1; });
  const maxM=Math.max(...Object.values(mc),1);
  const barCls={GET:'bar-get',POST:'bar-post',PUT:'bar-put',DELETE:'bar-delete',PATCH:'bar-patch'};

  document.getElementById('methodBreakdown').innerHTML=Object.entries(mc)
    .sort((a,b)=>b[1]-a[1])
    .map(([m,n])=>`
      <div class="method-row">
        <span class="method-tag ${mClass(m)}">${m}</span>
        <div class="bar-wrap"><div class="bar ${barCls[m]||'bar-other'}" style="width:${(n/maxM*100).toFixed(1)}%"></div></div>
        <span class="bar-count">${n}</span>
      </div>`).join('');

  const sg={'2xx':0,'3xx':0,'4xx':0,'5xx':0,'N/A':0};
  allCalls.forEach(c=>{ const s=c.status||0;
    if(!s) sg['N/A']++; else if(s>=500) sg['5xx']++;
    else if(s>=400) sg['4xx']++; else if(s>=300) sg['3xx']++; else sg['2xx']++;
  });
  const chipCls={'2xx':'sc-2xx','3xx':'sc-3xx','4xx':'sc-4xx','5xx':'sc-5xx','N/A':'sc-0'};
  const chipF={'2xx':2,'3xx':3,'4xx':4,'5xx':5,'N/A':0};

  document.getElementById('statusChips').innerHTML=Object.entries(sg)
    .filter(([,n])=>n>0)
    .map(([lbl,n])=>`
      <span class="sc ${chipCls[lbl]} ${statusFilter===chipF[lbl]?'active-filter':''}"
            data-f="${chipF[lbl]}">${lbl} <strong>${n}</strong></span>`).join('');

  document.querySelectorAll('.sc').forEach(el=>{
    el.addEventListener('click',()=>{
      const f=parseInt(el.dataset.f);
      statusFilter = statusFilter===f ? null : f;
      renderSidebar(); applyFilters();
    });
  });

  const hc={};
  allCalls.forEach(c=>{ const h=host(c.url); hc[h]=(hc[h]||0)+1; });
  document.getElementById('hostList').innerHTML=Object.entries(hc)
    .sort((a,b)=>b[1]-a[1]).slice(0,6)
    .map(([h,n])=>`<div class="host-row"><span class="host-name">${h}</span><span class="host-cnt">${n}</span></div>`).join('');
}

// ── Table ─────────────────────────────────────────────────────────────────────
function renderTable() {
  const tbody=document.getElementById('tbody');
  const empty=document.getElementById('emptyTable');
  if (filtered.length===0) { tbody.innerHTML=''; empty.style.display='flex'; return; }
  empty.style.display='none';
  tbody.innerHTML=filtered.map((c,i)=>`
    <tr class="call-row" data-i="${i}">
      <td class="td-idx">${i+1}</td>
      <td class="td-method"><span class="method-tag ${mClass(c.method)}">${c.method||'GET'}</span></td>
      <td class="td-status"><span class="status-val ${scClass(c.status)}">${c.status||'—'}</span></td>
      <td class="td-url">
        <span class="url-path" title="${c.url}">${urlPath(c.url)}</span>
        <span class="url-host">${host(c.url)}</span>
      </td>
      <td class="td-time"><span class="ts">${fmt(c.timestamp)}</span></td>
      <td class="td-act"><button class="copy-btn" data-url="${c.url.replace(/"/g,'&quot;')}" title="Copy URL">⧉</button></td>
    </tr>`).join('');

  tbody.querySelectorAll('.call-row').forEach(row=>{
    row.addEventListener('click',e=>{
      if (e.target.classList.contains('copy-btn')) return;
      showDetail(filtered[parseInt(row.dataset.i)]);
    });
  });
  tbody.querySelectorAll('.copy-btn').forEach(btn=>{
    btn.addEventListener('click',e=>{ e.stopPropagation(); copy(btn.dataset.url); });
  });
}

// ── Timeline ──────────────────────────────────────────────────────────────────
function renderTimeline() {
  const wrap=document.getElementById('tlList');
  if (!filtered.length) { wrap.innerHTML='<div class="empty"><div class="empty-icon">◷</div><div>No signals.</div></div>'; return; }
  const sorted=[...filtered].sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp));
  wrap.innerHTML=sorted.map(c=>`
    <div class="tl-item">
      <span class="tl-ts">${fmt(c.timestamp)}</span>
      <span class="method-tag ${mClass(c.method)}">${c.method||'GET'}</span>
      <span class="status-val ${scClass(c.status)}" style="min-width:30px;text-align:center;font-size:10px">${c.status||'—'}</span>
      <span class="tl-url" title="${c.url}">${c.url}</span>
    </div>`).join('');
}

// ── Endpoints ─────────────────────────────────────────────────────────────────
function renderEndpoints() {
  const wrap=document.getElementById('epList');
  if (!filtered.length) { wrap.innerHTML='<div class="empty"><div class="empty-icon">◎</div><div>No endpoints.</div></div>'; return; }
  const epMap={};
  filtered.forEach(c=>{
    const key=`${c.method||'GET'}::${urlPath(c.url)}`;
    if (!epMap[key]) epMap[key]={method:c.method||'GET',path:urlPath(c.url),host:host(c.url),url:c.url,count:0,statuses:new Set()};
    epMap[key].count++;
    if (c.status) epMap[key].statuses.add(c.status);
  });
  wrap.innerHTML=Object.values(epMap).sort((a,b)=>b.count-a.count).map(ep=>`
    <div class="ep-item" data-url="${ep.url.replace(/"/g,'&quot;')}">
      <div class="ep-meta"><span class="method-tag ${mClass(ep.method)}">${ep.method}</span></div>
      <div class="ep-paths">
        <div class="ep-path" title="${ep.url}">${ep.path}</div>
        <div class="ep-host">${ep.host}</div>
      </div>
      <div class="ep-statuses">
        ${[...ep.statuses].map(s=>`<span class="status-val ${scClass(s)}" style="font-size:9px">${s}</span>`).join('')}
        <span class="ep-cnt">${ep.count}×</span>
      </div>
    </div>`).join('');
  wrap.querySelectorAll('.ep-item').forEach(el=>{
    el.addEventListener('click',()=>copy(el.dataset.url));
  });
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function showDetail(c) {
  const colors={GET:'#4ade80',POST:'#818cf8',PUT:'#fb923c',DELETE:'#e879f9',PATCH:'#38bdf8'};
  const m=c.method||'GET';
  document.getElementById('dtMethod').textContent   = m;
  document.getElementById('dtMethod').style.color   = colors[m]||'#94a3b8';
  document.getElementById('dtPath').textContent     = urlPath(c.url);
  const urlEl=document.getElementById('dtFullUrl');
  urlEl.innerHTML='<button class="copy-url-btn" id="copyUrlBtn">copy</button>'+c.url;
  document.getElementById('copyUrlBtn').addEventListener('click',()=>copy(c.url));
  document.getElementById('dtKv').innerHTML=[
    ['Method',m],['Status',c.status||'—'],['Timestamp',c.timestamp||'—'],['Error',c.error||'—'],
  ].map(([k,v])=>`<div class="kv-row"><span class="kv-k">${k}</span><span class="kv-v ${k==='Status'?scClass(c.status):''}">${v}</span></div>`).join('');
  let paramsHtml='';
  try {
    const u=new URL(c.url);
    const params=[...u.searchParams.entries()];
    paramsHtml=`
      <div class="kv-row"><span class="kv-k">Host</span><span class="kv-v">${u.hostname}</span></div>
      <div class="kv-row"><span class="kv-k">Path</span><span class="kv-v">${u.pathname}</span></div>
      ${params.length>0?params.map(([k,v])=>`<div class="kv-row"><span class="kv-k">${k}</span><span class="kv-v">${v}</span></div>`).join('')
        :'<div style="color:var(--muted);font-size:10px;padding:4px 0">No query parameters</div>'}`;
  } catch { paramsHtml='<div style="color:var(--muted);font-size:10px;">Could not parse URL</div>'; }
  document.getElementById('dtParams').innerHTML=paramsHtml;
  document.getElementById('detail').classList.add('open');
}
document.getElementById('closeDetail').addEventListener('click',()=>document.getElementById('detail').classList.remove('open'));

// ── View switching ─────────────────────────────────────────────────────────────
function renderCurrentView() {
  if (activeView==='table')     renderTable();
  if (activeView==='timeline')  renderTimeline();
  if (activeView==='endpoints') renderEndpoints();
}
document.querySelectorAll('.vt').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.vt').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.view-page').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    activeView=btn.dataset.v;
    document.getElementById(`view-${activeView}`).classList.add('active');
    renderCurrentView();
  });
});

// ── Sorting ────────────────────────────────────────────────────────────────────
document.querySelectorAll('th[data-sort]').forEach(th=>{
  th.addEventListener('click',()=>{
    sortDir=(sortCol===th.dataset.sort&&sortDir==='asc')?'desc':'asc';
    sortCol=th.dataset.sort;
    document.querySelectorAll('th').forEach(t=>t.classList.remove('sorted'));
    th.classList.add('sorted');
    applyFilters();
  });
});

document.getElementById('searchInput').addEventListener('input', applyFilters);
document.getElementById('mFilter').addEventListener('change', applyFilters);
document.getElementById('sFilter').addEventListener('change', applyFilters);

// ── Capture ────────────────────────────────────────────────────────────────────
function updateCaptureUI() {
  const btn=document.getElementById('pauseBtn');
  const dot=document.getElementById('liveDot');
  const txt=document.getElementById('liveText');
  if (isCapturing) { btn.textContent='⏸ Pause'; btn.className='btn btn-pause'; dot.className='live-dot'; txt.textContent='LIVE'; }
  else             { btn.textContent='▶ Resume';btn.className='btn btn-pause paused';dot.className='live-dot off';txt.textContent='PAUSED'; }
}
document.getElementById('pauseBtn').addEventListener('click',()=>{
  if (!selectedTabId) return;
  chrome.runtime.sendMessage({type:'TOGGLE_CAPTURE',tabId:selectedTabId},()=>{ isCapturing=!isCapturing; updateCaptureUI(); });
});

document.getElementById('clearBtn').addEventListener('click',()=>{
  if (!selectedTabId||!confirm('Clear all captured signals for this target?')) return;
  chrome.runtime.sendMessage({type:'CLEAR_CALLS',tabId:selectedTabId},()=>{
    allCalls=[]; filtered=[];
    renderCurrentView(); renderSidebar(); updateCounts();
    toast('Signals cleared.','✦');
  });
});

// ── Export ─────────────────────────────────────────────────────────────────────
document.getElementById('exportCsvBtn').addEventListener('click',()=>{
  if (!allCalls.length) { toast('No data.','⚠'); return; }
  const rows=allCalls.map(c=>`"${c.method||''}","${c.status||''}","${c.url}","${c.timestamp||''}"`);
  const a=Object.assign(document.createElement('a'),{
    href:URL.createObjectURL(new Blob(['Method,Status,URL,Timestamp\n'+rows.join('\n')],{type:'text/csv'})),
    download:`stellar-${Date.now()}.csv`
  });
  a.click(); toast('CSV exported!','↓');
});
document.getElementById('exportJsonBtn').addEventListener('click',()=>{
  if (!allCalls.length) { toast('No data.','⚠'); return; }
  const a=Object.assign(document.createElement('a'),{
    href:URL.createObjectURL(new Blob([JSON.stringify(allCalls,null,2)],{type:'application/json'})),
    download:`stellar-${Date.now()}.json`
  });
  a.click(); toast('JSON exported!','↓');
});

// ── Live push ──────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg)=>{
  if (msg.type==='CALL_ADDED'&&msg.tabId===selectedTabId) loadCalls();
});

// ── Init ───────────────────────────────────────────────────────────────────────
loadTabs();
setInterval(loadTabs, 3000);
