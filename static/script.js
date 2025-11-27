// script.js - frontend logic (with pagination, bounty sort, comments, heatmap)
(async function(){
  const $ = sel => document.querySelector(sel);
  const $all = sel => Array.from(document.querySelectorAll(sel));

  // DOM refs
  const listEl = $('#list');
  const searchEl = $('#search');
  const tagFilterEl = $('#tagFilter');
  const onlyUnreadEl = $('#onlyUnread');
  const sortEl = $('#sortSelect');
  const exportBtn = $('#exportBtn');
  const importBtn = $('#importBtn');
  const importFile = $('#importFile');
  const darkToggle = $('#darkToggle');
  const weeklyGoalEl = $('#weeklyGoal');
  const overallProgressBar = $('#overallProgress');
  const overallText = $('#overallText');
  const weeklyProgressBar = $('#weeklyProgress');
  const weeklyText = $('#weeklyText');
  const updateWriteupsBtn = $('#updateWriteupsBtn');
  const showOpenBtnEl = $('#showOpenBtn');
  const paginationTop = $('#paginationTop');
  const paginationBottom = $('#paginationBottom');
  const heatmapEl = $('#heatmap');
  const heatmapLegendEl = $('#heatmapLegend');

  // State
  let writeups = [];
  let userdata = null;
  let tagsSet = new Set();
  const PAGE_SIZE = 25;
  let currentPage = 0;

  // Utilities
  function isoNow(){ return new Date().toISOString(); }
  function isSameWeek(isoTs) {
    if(!isoTs) return false;
    const d = new Date(isoTs);
    const now = new Date();
    const onejan = new Date(now.getFullYear(),0,1);
    const weekNow = Math.ceil((((now - onejan) / 86400000) + onejan.getDay()+1)/7);
    const weekThen = Math.ceil((((d - onejan) / 86400000) + onejan.getDay()+1)/7);
    return now.getFullYear()===d.getFullYear() && weekNow===weekThen;
  }

  function saveUserdata(){
    return fetch('/api/data', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(userdata)
    }).then(r=>r.json());
  }

  function loadUserdata(){
    return fetch('/api/data').then(r=>r.json()).then(d=>{
      userdata = d || {};
      userdata.read = userdata.read || {};
      userdata.comments = userdata.comments || {}; // url/title -> text
      userdata.settings = userdata.settings || {dark:false, sort:'date_desc', weekly_goal:10, showOpen:true};
      // ensure backward compatibility
      if(typeof userdata.settings.showOpen === 'undefined') userdata.settings.showOpen = true;
      return userdata;
    }).catch(e=>{
      console.error('Could not load userdata', e);
      userdata = {read:{}, comments:{}, settings:{dark:false, sort:'date_desc', weekly_goal:10, showOpen:true}};
      return userdata;
    });
  }

  // parse bounty string into numeric value (returns null if no number)
  function parseBounty(raw){
    if(raw === null || typeof raw === 'undefined') return null;
    raw = String(raw).trim();
    if(raw === '-' || raw === '' || /free|unknown|n\/a/i.test(raw)) return null;
    // remove currency symbols and letters, keep digits and separators
    // handle values like "2,500", "$2,500", "€1,200", "1 200", "2.5k"
    let s = raw.replace(/\s+/g,'').replace(/[$€£₹,]/g,'').toLowerCase();
    // handle "2.5k" or "2k"
    const mK = s.match(/^([\d\.]+)k$/);
    if(mK) return Math.round(parseFloat(mK[1]) * 1000);
    // handle ranges like "1,000-2,000" -> take max
    if(s.includes('-')){
      const parts = s.split('-').map(p => Number(p.replace(/[^\d\.]/g,''))).filter(n=>!isNaN(n));
      if(parts.length) return Math.max(...parts);
    }
    // take numeric part
    const num = Number(s.replace(/[^\d\.]/g,''));
    if(isNaN(num)) return null;
    return Math.round(num);
  }

  // Load writeups from backend and normalize structure for the UI.
  async function loadWriteups(){
    try {
      const res = await fetch('/api/writeups');
      let data = await res.json();

      // Unwrap if server returned { data: [...] }
      if(!Array.isArray(data) && typeof data === 'object' && Array.isArray(data.data)){
        data = data.data;
      }
      if(!Array.isArray(data)) data = [];

      writeups = data.map(item => {
        let firstLink = null;
        if(Array.isArray(item.Links) && item.Links.length) firstLink = item.Links[0];
        // tags come from Bugs array
        let tags = [];
        if(Array.isArray(item.Bugs)) tags = item.Bugs.map(t => String(t).trim()).filter(Boolean);
        else if(Array.isArray(item.tags)) tags = item.tags.map(t => String(t).trim()).filter(Boolean);

        const bountyRaw = item.Bounty || item.bounty || "";
        const bountyNum = parseBounty(bountyRaw);

        return {
          // pick title: Link Title -> fallback to firstLink.Title -> fallback to combined
          title: item.Name || item.title || (firstLink && firstLink.Title) || item.Subject || (item.Links && item.Links[0] && item.Links[0].Title) || "Untitled",
          url: (firstLink && firstLink.Link) || item.Link || item.url || "",
          tags: tags,
          author: Array.isArray(item.Authors) && item.Authors.length ? item.Authors.join(', ') : (item.author || ""),
          date: item.PublicationDate || item.AddedDate || item.date || "",
          source: item.Source || guessSource((firstLink && firstLink.Link) || item.Link || item.url),
          desc: item.Summary || item.Description || item.desc || "",
          bountyRaw: bountyRaw ? String(bountyRaw) : "",
          bountyNum: bountyNum // numeric or null
        };
      });

      buildTags();
    } catch(e){
      console.error("Failed to load writeups", e);
      writeups = [];
    }
  }

  function buildTags(){
    tagsSet = new Set();
    writeups.forEach(w => (w.tags || []).forEach(t => tagsSet.add(t)));
    ['web','pwn','rev','mobile','cve','cloud','forensics','crypto','rce','xss','sqli'].forEach(t => tagsSet.add(t));
    renderTagOptions();
  }

  function renderTagOptions(){
    tagFilterEl.innerHTML = '<option value="">— Filter by bug class —</option>';
    Array.from(tagsSet).sort((a,b)=>a.localeCompare(b)).forEach(tag=>{
      const opt = document.createElement('option');
      opt.value = tag; opt.textContent = tag;
      tagFilterEl.appendChild(opt);
    });
  }

  function isRead(urlOrKey){
    return !!userdata.read[urlOrKey];
  }

  function toggleRead(item){
    const key = identifyKey(item);
    if(isRead(key)) delete userdata.read[key];
    else userdata.read[key] = isoNow();
    return saveUserdata().then(()=>{ renderList(); renderHeatmap(); });
  }

  function identifyKey(item){
    // primary key: URL, fallback to title key
    return item.url && item.url.length ? item.url : ("title:" + (item.title || ""));
  }

  function setComment(item, text){
    const key = identifyKey(item);
    if(!text) delete userdata.comments[key];
    else userdata.comments[key] = text;
    return saveUserdata().then(()=>renderList());
  }

  function mergeImported(imported){
    imported = imported || {};
    const importedRead = imported.read || {};
    for(const [k,v] of Object.entries(importedRead)){
      if(!userdata.read[k]) userdata.read[k] = v;
      else {
        if(new Date(v) > new Date(userdata.read[k])) userdata.read[k] = v;
      }
    }
    const importedComments = imported.comments || {};
    for(const [k,v] of Object.entries(importedComments)){
      if(!userdata.comments[k]) userdata.comments[k] = v;
    }
    if(imported.settings) userdata.settings = {...userdata.settings, ...imported.settings};
    return saveUserdata().then(()=>loadAndRender());
  }

  function renderProgress(){
    const total = writeups.length;
    const readCount = Object.keys(userdata.read).filter(u => writeups.some(w=> (w.url && w.url === u) || ("title:" + (w.title||"")) === u)).length;
    const pct = total===0 ? 0 : Math.round((readCount/total)*100);
    overallProgressBar.style.width = pct + '%';
    overallText.textContent = `${readCount} / ${total} read (${pct}%)`;

    const weeklyGoal = (userdata.settings && userdata.settings.weekly_goal) || 10;
    const thisWeekCount = Object.entries(userdata.read).filter(([url,ts]) => isSameWeek(ts) && writeups.some(w=> (w.url && w.url === url) || ("title:" + (w.title||"")) === url)).length;
    const weekPct = weeklyGoal===0 ? 0 : Math.min(100, Math.round((thisWeekCount/weeklyGoal)*100));
    weeklyProgressBar.style.width = weekPct + '%';
    weeklyText.textContent = `${thisWeekCount} this week of ${weeklyGoal} (${weekPct}%)`;
    weeklyGoalEl.value = weeklyGoal;
  }

  function applyFilters(ws){
    const term = (searchEl.value || "").trim().toLowerCase();
    const selectedTag = tagFilterEl.value;
    const onlyUnread = onlyUnreadEl.checked;

    let filtered = ws.filter(w=>{
      if(selectedTag && !((w.tags||[]).some(t => String(t).toLowerCase() === String(selectedTag).toLowerCase()))) return false;
      if(onlyUnread && isRead(identifyKey(w))) return false;
      if(!term) return true;
      const hay = ((w.title||"") + " " + (w.author||"") + " " + (w.tags||[]).join(" ") + " " + (w.desc||"") + " " + (w.bountyRaw||"")).toLowerCase();
      return hay.includes(term);
    });

    // Sorting
    const sort = userdata.settings.sort || 'date_desc';
    if(sort === 'date_desc'){
      filtered.sort((a,b)=> new Date(b.date || 0) - new Date(a.date || 0));
    } else if(sort === 'date_asc'){
      filtered.sort((a,b)=> new Date(a.date || 0) - new Date(b.date || 0));
    } else if(sort === 'title'){
      filtered.sort((a,b)=> (a.title||"").localeCompare(b.title||""));
    } else if(sort === 'author'){
      filtered.sort((a,b)=> (a.author||"").localeCompare(b.author||""));
    } else if(sort === 'bounty_desc'){
      filtered.sort((a,b)=>{
        const A = a.bountyNum || 0;
        const B = b.bountyNum || 0;
        return B - A;
      });
    } else if(sort === 'bounty_asc'){
      filtered.sort((a,b)=>{
        const A = a.bountyNum || 0;
        const B = b.bountyNum || 0;
        return A - B;
      });
    }
    return filtered;
  }

  // Pagination helpers
  function pageCount(total){ return Math.max(1, Math.ceil(total / PAGE_SIZE)); }
  function ensureCurrentPage(total){
    const pages = pageCount(total);
    if(currentPage >= pages) currentPage = pages - 1;
    if(currentPage < 0) currentPage = 0;
  }

  function renderPaginationControls(total){
    const pages = pageCount(total);
    ensureCurrentPage(total);
    const start = currentPage * PAGE_SIZE + 1;
    const end = Math.min(total, (currentPage+1)*PAGE_SIZE);
    const rangeText = `<span class="range-text">${start}-${end} of ${total}</span>`;
    const makeButtons = (idPrefix) => {
      let html = '';
      html += `<button class="page-btn" data-action="prev">&lt;</button>`;
      // show limited page window (max 9 numbers)
      const win = 9;
      let from = Math.max(0, currentPage - Math.floor(win/2));
      let to = Math.min(pages-1, from + win -1);
      if(to - from < win -1) from = Math.max(0, to - win + 1);
      for(let i=from;i<=to;i++){
        html += `<button class="page-btn ${i===currentPage ? 'active' : ''}" data-page="${i}">${i+1}</button>`;
      }
      html += `<button class="page-btn" data-action="next">&gt;</button>`;
      return html;
    };
    const topHtml = rangeText + makeButtons('top');
    paginationTop.innerHTML = topHtml;
    paginationBottom.innerHTML = rangeText + makeButtons('bottom');

    // attach handlers
    [paginationTop, paginationBottom].forEach(container=>{
      container.querySelectorAll('.page-btn').forEach(btn=>{
        btn.onclick = ()=>{
          const action = btn.getAttribute('data-action');
          const pageAttr = btn.getAttribute('data-page');
          if(action === 'prev') currentPage = Math.max(0, currentPage-1);
          else if(action === 'next') currentPage = Math.min(pages-1, currentPage+1);
          else if(pageAttr !== null) currentPage = Number(pageAttr);
          renderList();
        };
      });
    });
  }

  function renderList(){
    renderProgress();
    const itemsFiltered = applyFilters(writeups);
    const total = itemsFiltered.length;
    renderPaginationControls(total);

    // get items for current page
    ensureCurrentPage(total);
    const startIdx = currentPage * PAGE_SIZE;
    const pageItems = itemsFiltered.slice(startIdx, startIdx + PAGE_SIZE);

    listEl.innerHTML = '';
    if(pageItems.length === 0){
      listEl.innerHTML = `<li class="writeup-item"><div>No writeups matched.</div></li>`;
      return;
    }

    pageItems.forEach((w, idx) => {
      const li = document.createElement('li');
      li.className = 'writeup-item ' + (isRead(identifyKey(w)) ? 'read' : 'unread');

      const left = document.createElement('div');
      left.className = 'leftmeta';
      left.innerHTML = `
        <div style="font-size:12px;color:var(--muted)">${escapeHtml(w.source || '')}</div>
        <div style="font-size:12px;color:var(--muted)">${formatDate(w.date)}</div>
        <div class="bounty">${w.bountyRaw ? escapeHtml(w.bountyRaw) : '<span style="color:var(--muted)">—</span>'}</div>
      `;

      const body = document.createElement('div');
      body.style.flex = '1';
      body.innerHTML = `
        <div class="title"><a href="${escapeHtml(w.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(w.title)}</a></div>
        <div class="meta">
          ${w.author ? `<span class="meta-item">• ${escapeHtml(w.author)}</span>` : ''}
          ${w.tags && w.tags.length ? ' • ' + w.tags.map(t=>`<span class="badge">${escapeHtml(t)}</span>`).join(' ') : ''}
          <div style="margin-top:6px;color:var(--muted);font-size:13px">${escapeHtml(w.desc || '')}</div>
        </div>
      `;

      const actions = document.createElement('div');
      actions.className = 'actions';

      const readBtn = document.createElement('button');
      readBtn.className = 'btn small ' + (isRead(identifyKey(w)) ? 'read' : 'unread');
      readBtn.textContent = isRead(identifyKey(w)) ? 'Mark unread' : 'Mark read';
      readBtn.onclick = (ev)=>{
        ev.stopPropagation();
        toggleRead(w);
      };

      const commentBtn = document.createElement('button');
      commentBtn.className = 'btn small';
      commentBtn.textContent = 'Comment';
      commentBtn.onclick = (ev)=>{
        ev.stopPropagation();
        const key = identifyKey(w);
        const prev = userdata.comments[key] || '';
        const txt = prompt('Comment / Note for this writeup (empty to remove):', prev);
        if(txt === null) return;
        setComment(w, txt.trim());
      };

      // optionally show Open button depending on setting
      const openBtn = document.createElement('button');
      openBtn.className = 'btn small';
      openBtn.textContent = 'Open';
      openBtn.onclick = (ev)=>{
        ev.stopPropagation();
        if(w.url) window.open(w.url, '_blank');
        else alert('No URL available for this writeup.');
      };

      actions.appendChild(readBtn);
      actions.appendChild(commentBtn);
      if(userdata.settings.showOpen) actions.appendChild(openBtn);

      li.appendChild(left);
      li.appendChild(body);
      li.appendChild(actions);

      // show comment text if present
      const key = identifyKey(w);
      if(userdata.comments && userdata.comments[key]){
        const c = document.createElement('div');
        c.className = 'commentBox';
        c.textContent = userdata.comments[key];
        li.appendChild(c);
      }

      li.onclick = ()=> {
        // clicking item toggles read
        toggleRead(w);
      };

      listEl.appendChild(li);
    });
  }

  // small utils
  function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }
  function guessSource(url){
    try { return url ? new URL(url).hostname.replace('www.','') : ''; } catch(e){ return ''; }
  }
  function formatDate(s){
    if(!s) return '';
    const d = new Date(s);
    if(isNaN(d)) return s;
    return d.toLocaleDateString();
  }

  // heatmap rendering (last 52 weeks)

/* ======= Heatmap: modern GitHub-style calendar ======= */
function getReadItemsByDate(dateStr){
  // returns array of {item, readTs} for reads that happened on dateStr (YYYY-MM-DD)
  const results = [];
  for(const item of writeups){
    const key = identifyKey(item);
    const ts = userdata.read && userdata.read[key];
    if(!ts) continue;
    const d = new Date(ts);
    if(isNaN(d)) continue;
    const day = d.toISOString().slice(0,10);
    if(day === dateStr) results.push({ item, readTs: ts });
  }
  return results;
}

function openDayModal(dateStr){
  const modal = document.getElementById('heatmapModal');
  const modalDate = document.getElementById('modalDate');
  const modalBody = document.getElementById('modalBody');
  modalDate.textContent = dateStr;
  const reads = getReadItemsByDate(dateStr);
  if(reads.length === 0){
    modalBody.innerHTML = `<div style="color:var(--muted);padding:12px 6px">No reads recorded on ${dateStr}</div>`;
  } else {
    // build list
    const list = document.createElement('div');
    list.style.display = 'grid';
    list.style.gap = '10px';
    reads.forEach(r => {
      const card = document.createElement('div');
      card.style.padding = '10px';
      card.style.borderRadius = '8px';
      card.style.background = 'rgba(0,0,0,0.03)';
      card.innerHTML = `
        <div style="font-weight:700">${escapeHtml(r.item.title || '(untitled)')}</div>
        <div style="font-size:13px;color:var(--muted);margin-top:6px">
          ${r.item.url ? `<a href="${escapeHtml(r.item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.item.url)}</a>` : '<span style="opacity:.8">no url</span>'}
        </div>
        <div style="margin-top:8px;color:var(--muted);font-size:13px">
          ${escapeHtml((userdata.comments && userdata.comments[identifyKey(r.item)]) || '')}
        </div>
      `;
      list.appendChild(card);
    });
    modalBody.innerHTML = '';
    modalBody.appendChild(list);
  }

  const closeBtn = document.getElementById('heatmapModalClose');
  closeBtn.onclick = () => {
    modal.setAttribute('aria-hidden','true');
  };
  modal.setAttribute('aria-hidden','false');
}

/* Main renderHeatmap function */
function renderHeatmap(){
  // 52 weeks, 7 days each (Monday-first)
  const today = new Date();
  // compute start date which is Monday at (today - (52*7 -1) days)
  const totalDays = 52 * 7;
  const start = new Date(today);
  start.setDate(start.getDate() - (totalDays - 1));
  // adjust start back to Monday (0=Sun, 1=Mon...)
  const dayOfWeek = start.getDay(); // 0-6 (Sun..Sat)
  // convert to Monday-based: if dayOfWeek==0 (Sun) -> back 6 days to previous Mon
  const offsetToMon = (dayOfWeek === 0) ? 6 : (dayOfWeek - 1);
  start.setDate(start.getDate() - offsetToMon);

  // build weeks array: weeks[weekIdx][0..6] where 0=Mon ... 6=Sun
  const weeks = [];
  for(let w=0; w<52; w++){
    const week = [];
    for(let d=0; d<7; d++){
      const dt = new Date(start);
      dt.setDate(start.getDate() + (w * 7) + d);
      week.push(dt);
    }
    weeks.push(week);
  }

  // counts per day (YYYY-MM-DD) based on userdata.read timestamps
  const counts = {};
  for(const [k, ts] of Object.entries(userdata.read || {})){
    try {
      const d = new Date(ts);
      if(isNaN(d)) continue;
      const key = d.toISOString().slice(0,10);
      counts[key] = (counts[key] || 0) + 1;
    } catch(e){}
  }

  // compute max and thresholds (adaptive)
  let maxCount = 0;
  for(const v of Object.values(counts)) if(v > maxCount) maxCount = v;
  // thresholds — create 4 increasing buckets
  const t1 = Math.max(1, Math.ceil(maxCount * 0.25));
  const t2 = Math.max(2, Math.ceil(maxCount * 0.5));
  const t3 = Math.max(3, Math.ceil(maxCount * 0.75));

  // color palette (level 0..4)
  const palette = [
    '#ebedf0', // 0
    '#c6e48b', // 1
    '#7bc96f', // 2
    '#239a3b', // 3
    '#196127'  // 4
  ];

  // build month labels: choose week index where month label should appear
  const monthLabels = [];
  let lastMonth = null;
  weeks.forEach((week, idx) => {
    // use the Monday of this week (week[0])
    const mon = week[0];
    const monMonth = mon.getMonth(); // 0..11
    if(lastMonth === null || monMonth !== lastMonth){
      // push label at this week idx
      const name = mon.toLocaleString(undefined, { month: 'short' });
      monthLabels.push({ name, index: idx });
      lastMonth = monMonth;
    }
  });

  // render month labels
  const monthLabelsEl = document.getElementById('heatmapMonthLabels');
  monthLabelsEl.innerHTML = '';
  if(monthLabels.length){
    // compute left positions as (week_index * (cell + gap)) where cell=14px gap=6px plus left offset
    const cellSize = 14;
    const gap = 6;
    const leftOffset = 0; // margin-left already in CSS via month-labels container
    monthLabels.forEach((lbl, i) => {
      const span = document.createElement('span');
      span.className = 'month-label';
      // compute margin-left in px relative to previous label using index difference
      if(i === 0){
        span.style.marginLeft = (lbl.index * (cellSize + gap)) + 'px';
      } else {
        const prev = monthLabels[i-1];
        const diff = lbl.index - prev.index;
        span.style.marginLeft = (diff * (cellSize + gap)) + 'px';
      }
      span.textContent = lbl.name;
      monthLabelsEl.appendChild(span);
    });
  }

  // render weeks grid
  const weeksContainer = document.getElementById('heatmapWeeks');
  weeksContainer.innerHTML = '';
  for(let wi=0; wi<weeks.length; wi++){
    const week = weeks[wi];
    const col = document.createElement('div');
    col.className = 'week-col';
    week.forEach((d, di) => {
      const dateKey = d.toISOString().slice(0,10);
      const count = counts[dateKey] || 0;
      const cell = document.createElement('div');
      const level = count === 0 ? 0 : (count >= t3 ? 4 : (count >= t2 ? 3 : (count >= t1 ? 2 : 1)));
      cell.className = 'day-cell' + (count === 0 ? ' empty' : '');
      cell.style.background = palette[level];
      cell.dataset.date = dateKey;
      cell.dataset.count = String(count);
      cell.title = `${dateKey}: ${count} read${count!==1?'s':''}`;

      // hover tooltip
      cell.addEventListener('mouseenter', (ev) => {
        const tt = document.getElementById('heatmapTooltip');
        const idxItems = getReadItemsByDate(dateKey);
        tt.innerHTML = `<span class="date">${dateKey}</span>
                        <div class="count">${count} read${count !== 1 ? 's' : ''}</div>
                        <div style="margin-top:6px;color:var(--muted);font-size:13px">${idxItems.length ? idxItems.length + ' item(s)' : 'No reads'}</div>`;
        tt.style.display = 'block';
        // position near cursor but keep within window
        const rect = ev.target.getBoundingClientRect();
        let left = rect.right + 10;
        let top = rect.top - 6;
        if(left + 220 > window.innerWidth) left = rect.left - 230;
        if(top < 8) top = rect.bottom + 6;
        tt.style.left = left + 'px';
        tt.style.top = top + 'px';
      });
      cell.addEventListener('mouseleave', ()=> {
        const tt = document.getElementById('heatmapTooltip');
        tt.style.display = 'none';
      });

      // click => open modal with day details
      cell.addEventListener('click', (ev)=>{
        // only respond if there is at least zero (we still allow click for empty days to see "no reads")
        openDayModal(dateKey);
      });

      col.appendChild(cell);
    });
    weeksContainer.appendChild(col);
  }

  // legend boxes
  const legendBoxes = document.getElementById('heatmapLegendBoxes');
  legendBoxes.innerHTML = '';
  for(let i=0;i<palette.length;i++){
    const b = document.createElement('div');
    b.className = 'legend-box';
    b.style.background = palette[i];
    legendBoxes.appendChild(b);
  }
}

/* hook: call renderHeatmap() when initial UI loads and whenever userdata updates */




  // load + render
  async function loadAndRender(){
    await loadWriteups();
    await loadUserdata();
    applySettingsToUI();
    renderList();
    renderHeatmap();
  }

  function applySettingsToUI(){
    document.body.classList.toggle('dark', !!userdata.settings.dark);
    darkToggle.checked = !!userdata.settings.dark;
    sortEl.value = userdata.settings.sort || 'date_desc';
    onlyUnreadEl.checked = false;
    showOpenBtnEl.checked = !!userdata.settings.showOpen;
    renderProgress();
  }

  // events
  searchEl.addEventListener('input', ()=>{ currentPage = 0; renderList(); });
  tagFilterEl.addEventListener('change', ()=>{ currentPage = 0; renderList(); });
  onlyUnreadEl.addEventListener('change', ()=>{ currentPage = 0; renderList(); });
  sortEl.addEventListener('change', ()=>{
    userdata.settings.sort = sortEl.value;
    saveUserdata().then(()=>{ currentPage = 0; renderList(); });
  });

  darkToggle.addEventListener('change', ()=>{
    userdata.settings.dark = !!darkToggle.checked;
    saveUserdata().then(()=>{ document.body.classList.toggle('dark', userdata.settings.dark); });
  });

  showOpenBtnEl.addEventListener('change', ()=>{
    userdata.settings.showOpen = !!showOpenBtnEl.checked;
    saveUserdata().then(()=>renderList());
  });

  weeklyGoalEl.addEventListener('change', ()=>{
    userdata.settings.weekly_goal = Number(weeklyGoalEl.value || 0);
    saveUserdata().then(()=>renderProgress());
  });

  exportBtn.addEventListener('click', ()=>{
    const blob = new Blob([JSON.stringify(userdata, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'userdata-export.json'; a.click();
    URL.revokeObjectURL(url);
  });

  importBtn.addEventListener('click', ()=> importFile.click());
  importFile.addEventListener('change', (ev)=>{
    const f = ev.target.files[0];
    if(!f) return;
    const reader = new FileReader();
    reader.onload = ()=> {
      try {
        const parsed = JSON.parse(reader.result);
        mergeImported(parsed);
      } catch(e){
        alert('Invalid JSON');
      }
    };
    reader.readAsText(f);
    importFile.value = '';
  });

  updateWriteupsBtn.addEventListener('click', async ()=>{
    updateWriteupsBtn.disabled = true;
    updateWriteupsBtn.textContent = 'Updating...';
    try {
      const res = await fetch('/api/update_writeups', {method:'POST'});
      const j = await res.json();
      if(j.ok){
        await loadWriteups();
        renderList();
        renderHeatmap();
        alert('Writeups refreshed (if online).');
      } else {
        alert('Failed: ' + (j.message||'unknown'));
      }
    } catch(e){
      alert('Error updating: ' + e);
    } finally {
      updateWriteupsBtn.disabled = false;
      updateWriteupsBtn.textContent = 'Update writeups';
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (ev)=>{
    const tag = ev.target.tagName.toLowerCase();
    if(tag === 'input' || tag === 'textarea') {
      if(ev.key === '/' && tag !== 'input') ev.preventDefault();
    }
    if(ev.key === '/'){
      ev.preventDefault();
      searchEl.focus();
    } else if(ev.key === 'u'){
      onlyUnreadEl.checked = !onlyUnreadEl.checked;
      currentPage = 0; renderList();
    } else if(ev.key === 'r'){
      const first = document.querySelector('#list .writeup-item');
      if(first){
        first.click();
      }
    }
  });

  await loadAndRender();

})();
