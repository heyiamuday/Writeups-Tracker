// script.js - frontend logic
(async function(){
  const $ = sel => document.querySelector(sel);
  const $all = sel => Array.from(document.querySelectorAll(sel));

  // DOM refs
  const listEl = $('#list');
  const searchEl = $('#search');
  const sortEl = $('#sortSelect');
  const onlyUnreadEl = $('#onlyUnread');
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

  // Sidebar Filter Refs
  const filterBtn = $('#filterBtn');
  const sidebarEl = $('#filter-sidebar');
  const closeSidebarBtn = $('#closeSidebarBtn');
  const sidebarOverlay = $('#sidebar-overlay');
  const applyFiltersBtn = $('#applyFiltersBtn');
  const resetFiltersBtn = $('#resetFiltersBtn');
  
  // Custom Filter Containers
  const authorContainer = $('#authorFilterContainer');
  const programContainer = $('#programFilterContainer');
  const bugContainer = $('#bugFilterContainer');
  
  const minBountyEl = $('#minBounty');
  const maxBountyEl = $('#maxBounty');
  const minDateEl = $('#minDate');
  const maxDateEl = $('#maxDate');

  // Comment Modal Refs
  const commentModal = $('#commentModal');
  const commentModalTitle = $('#commentWriteupTitle');
  const commentInput = $('#commentInput');
  const commentModalClose = $('#commentModalClose');
  const commentModalCancel = $('#commentModalCancel');
  const commentModalSave = $('#commentModalSave');
  let currentCommentItem = null; 

  // State
  let writeups = [];
  let userdata = null;
  let filtersState = {
    authors: [], programs: [], tags: [],
    minBounty: null, maxBounty: null,
    minDate: null, maxDate: null,
    dateType: 'publication', 
  };
  const PAGE_SIZE = 25;
  let currentPage = 0;

  // --- Utilities ---
  function isoNow(){ return new Date().toISOString(); }
  function isSameWeek(isoTs) {
    if(!isoTs) return false;
    const d = new Date(isoTs);
    const now = new Date();
    const getWeek = (date) => {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    };
    return now.getFullYear()===d.getFullYear() && getWeek(now)===getWeek(d);
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
      userdata.comments = userdata.comments || {};
      userdata.settings = userdata.settings || {dark:false, sort:'date_desc', weekly_goal:10, showOpen:true};
      if(typeof userdata.settings.showOpen === 'undefined') userdata.settings.showOpen = true;
      return userdata;
    }).catch(e=>{
      console.error('Could not load userdata', e);
      userdata = {read:{}, comments:{}, settings:{dark:false, sort:'date_desc', weekly_goal:10, showOpen:true}};
      return userdata;
    });
  }

  function parseBounty(raw){
    if(raw === null || typeof raw === 'undefined') return null;
    raw = String(raw).trim();
    if(raw === '-' || raw === '' || /free|unknown|n\/a|no bounty/i.test(raw)) return null;
    let s = raw.replace(/\s+/g,'').replace(/[$€£₹,]/g,'').toLowerCase();
    const mK = s.match(/^([\d\.]+)k$/);
    if(mK) return Math.round(parseFloat(mK[1]) * 1000);
    if(s.includes('-')){
      const parts = s.split('-').map(p => Number(p.replace(/[^\d\.]/g,''))).filter(n=>!isNaN(n));
      if(parts.length) return Math.max(...parts);
    }
    const num = Number(s.replace(/[^\d\.]/g,''));
    if(isNaN(num) || num === 0) return null;
    return Math.round(num);
  }

  function formatBounty(num){
    if(typeof num !== 'number' || num <= 0) return '';
    return '$' + num.toLocaleString();
  }

  async function loadWriteups(){
    try {
      const res = await fetch('/api/writeups');
      let data = await res.json();
      if(!Array.isArray(data) && typeof data === 'object' && Array.isArray(data.data)) data = data.data;
      if(!Array.isArray(data)) data = [];

      writeups = data.map(item => {
        let firstLink = null;
        if(Array.isArray(item.Links) && item.Links.length) firstLink = item.Links[0];
        let tags = (Array.isArray(item.Bugs) ? item.Bugs : Array.isArray(item.tags) ? item.tags : []).map(t => String(t).trim()).filter(Boolean);
        let authors = Array.isArray(item.Authors) && item.Authors.length ? item.Authors : (item.author ? [item.author] : []);
        
        // FIX: Handle Programs as an array for filtering
        let programs = Array.isArray(item.Programs) ? item.Programs : (item.Program ? [item.Program] : []);
        programs = programs.filter(p => p !== '-' && p !== '').map(p => String(p).trim()); // Clean up empty/dummy entries

        const bountyRaw = item.Bounty || item.bounty || "";
        const bountyNum = parseBounty(bountyRaw);
        
        const addedDate = item.AddedDate || item.date || item.PublicationDate || "";
        const publicationDate = item.PublicationDate || item.date || addedDate;

        return {
          title: item.Name || item.title || (firstLink && firstLink.Title) || item.Subject || (item.Links && item.Links[0] && item.Links[0].Title) || "Untitled",
          url: (firstLink && firstLink.Link) || item.Link || item.url || "",
          tags: tags,
          author: authors.join(', '),
          authorsList: authors, 
          program: programs.join(', '), // Used for display summary
          programsList: programs, // Used for multi-select filtering
          date: publicationDate, 
          addedDate: addedDate,
          source: item.Source || guessSource((firstLink && firstLink.Link) || item.Link || item.url),
          desc: item.Summary || item.Description || item.desc || "",
          bountyRaw: bountyRaw ? String(bountyRaw) : "",
          bountyNum: bountyNum,
          bountyFormatted: formatBounty(bountyNum)
        };
      });

      buildFilterOptions();
    } catch(e){
      console.error("Failed to load writeups", e);
      writeups = [];
    }
  }

  // --- Searchable Checkbox Filter Logic ---

  function buildSearchableList(containerEl, options, groupName) {
    const searchInput = containerEl.querySelector('.filter-search-box');
    const listContainer = containerEl.querySelector('.checkbox-list-container');
    listContainer.innerHTML = '';
    
    // Sort options alphabetically
    options.sort((a,b) => a.localeCompare(b));

    options.forEach(optVal => {
      const label = document.createElement('label');
      label.className = 'checkbox-item';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = optVal;
      checkbox.name = groupName; // helps with grouping
      
      const span = document.createElement('span');
      span.textContent = optVal;
      
      label.appendChild(checkbox);
      label.appendChild(span);
      listContainer.appendChild(label);
    });

    // Attach Search Event
    searchInput.oninput = (e) => {
      const term = e.target.value.toLowerCase();
      const items = listContainer.querySelectorAll('.checkbox-item');
      items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(term) ? 'flex' : 'none';
      });
    };
  }

  function getCheckedValues(containerEl) {
    const checkboxes = containerEl.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
  }

  function setCheckedValues(containerEl, values) {
    const checkboxes = containerEl.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
      cb.checked = values.includes(cb.value);
    });
  }

  function buildFilterOptions(){
    const authorsSet = new Set();
    const programsSet = new Set();
    const tagsSet = new Set();

    writeups.forEach(w => {
      (w.authorsList || []).forEach(a => authorsSet.add(a));
      // FIX: Use programsList here
      (w.programsList || []).forEach(p => programsSet.add(p)); 
      (w.tags || []).forEach(t => tagsSet.add(t));
    });
    
    // Ensure common tags
    ['rce','xss','sqli'].forEach(t => tagsSet.add(t));

    // Build Lists
    buildSearchableList(authorContainer, Array.from(authorsSet).filter(Boolean), 'author');
    buildSearchableList(programContainer, Array.from(programsSet).filter(Boolean), 'program');
    buildSearchableList(bugContainer, Array.from(tagsSet).filter(Boolean), 'tag');

    syncFiltersUI();
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
    return item.url && item.url.length ? item.url : ("title:" + (item.title || ""));
  }

  function openCommentModal(item){
    currentCommentItem = item;
    const key = identifyKey(item);
    commentModalTitle.textContent = item.title;
    commentInput.value = userdata.comments[key] || '';
    commentModal.setAttribute('aria-hidden', 'false');
  }

  function setComment(item, text){
    const key = identifyKey(item);
    if(!text) delete userdata.comments[key];
    else userdata.comments[key] = text;
    return saveUserdata().then(()=>renderList());
  }
  
  function saveCommentFromModal(){
    if(!currentCommentItem) return;
    const text = commentInput.value.trim();
    setComment(currentCommentItem, text).then(()=>{
      closeCommentModal();
      currentCommentItem = null;
    });
  }

  function closeCommentModal(){
    commentModal.setAttribute('aria-hidden', 'true');
    commentInput.value = '';
    currentCommentItem = null;
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
  
  /* --- Filter Logic --- */

  function openSidebar(){
    sidebarEl.setAttribute('aria-hidden', 'false');
    sidebarOverlay.setAttribute('aria-hidden', 'false');
  }

  function closeSidebar(){
    sidebarEl.setAttribute('aria-hidden', 'true');
    sidebarOverlay.setAttribute('aria-hidden', 'true');
  }

  function loadFiltersFromUI(){
    filtersState.authors = getCheckedValues(authorContainer);
    filtersState.programs = getCheckedValues(programContainer);
    filtersState.tags = getCheckedValues(bugContainer);
    
    filtersState.minBounty = Number(minBountyEl.value) || null;
    filtersState.maxBounty = Number(maxBountyEl.value) || null;
    filtersState.minDate = minDateEl.value || null;
    filtersState.maxDate = maxDateEl.value || null;
    filtersState.dateType = $all('input[name="dateType"]:checked')[0]?.value || 'publication';
  }

  function syncFiltersUI(){
    setCheckedValues(authorContainer, filtersState.authors);
    setCheckedValues(programContainer, filtersState.programs);
    setCheckedValues(bugContainer, filtersState.tags);
    
    minBountyEl.value = filtersState.minBounty || '';
    maxBountyEl.value = filtersState.maxBounty || '';
    minDateEl.value = filtersState.minDate || '';
    maxDateEl.value = filtersState.maxDate || '';
    $all(`input[name="dateType"][value="${filtersState.dateType}"]`).forEach(radio => radio.checked = true);
  }
  
  function resetFilters(){
    filtersState = {
      authors: [], programs: [], tags: [],
      minBounty: null, maxBounty: null,
      minDate: null, maxDate: null,
      dateType: 'publication',
    };
    // Clear search boxes too
    $all('.filter-search-box').forEach(i => { i.value = ''; i.dispatchEvent(new Event('input')); });
    syncFiltersUI();
    currentPage = 0;
    renderList();
    closeSidebar();
  }

  function applyFiltersToStateAndRender(){
    loadFiltersFromUI();
    currentPage = 0;
    renderList();
    closeSidebar();
  }

  function applyFilters(ws){
    const term = (searchEl.value || "").trim().toLowerCase();
    const onlyUnread = onlyUnreadEl.checked;
    const { authors, programs, tags, minBounty, maxBounty, minDate, maxDate, dateType } = filtersState;

    let filtered = ws.filter(w=>{
      if(onlyUnread && isRead(identifyKey(w))) return false;

      // Multi-select Check
      if(authors.length && !w.authorsList.some(a => authors.includes(a))) return false;
      // FIX: Use programsList for filtering
      if(programs.length && !w.programsList.some(p => programs.includes(p))) return false;
      if(tags.length && !w.tags.some(t => tags.includes(t))) return false;

      // Bounty
      const bounty = w.bountyNum || 0;
      if(minBounty !== null && bounty < minBounty) return false;
      if(maxBounty !== null && bounty > maxBounty) return false;

      // Date
      const dateKey = dateType === 'publication' ? w.date : w.addedDate;
      if(dateKey){
        if(minDate && new Date(dateKey) < new Date(minDate)) return false;
        if(maxDate && new Date(dateKey) > new Date(maxDate)) return false;
      }
      
      // Search
      if(term){
        const hay = ((w.title||"") + " " + (w.author||"") + " " + (w.programsList||[]).join(" ") + " " + (w.tags||[]).join(" ") + " " + (w.desc||"") + " " + (w.bountyRaw||"") + " " + (w.program||"")).toLowerCase();
        return hay.includes(term);
      }
      return true;
    });

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
      filtered.sort((a,b)=> (b.bountyNum||0) - (a.bountyNum||0));
    } else if(sort === 'bounty_asc'){
      filtered.sort((a,b)=> (a.bountyNum||0) - (b.bountyNum||0));
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
    
    if(total === 0 || pages <= 1){
      paginationTop.innerHTML = '';
      paginationBottom.innerHTML = '';
      return;
    }
    
    const rangeText = `<span class="range-text">${start}–${end} of ${total}</span>`;
    const makeButtons = () => {
      let html = '';
      html += `<button class="page-btn" data-action="prev" ${currentPage === 0 ? 'disabled' : ''}>&lt;</button>`;
      const win = 9;
      let from = Math.max(0, currentPage - Math.floor(win/2));
      let to = Math.min(pages-1, from + win -1);
      if(to - from < win -1) from = Math.max(0, to - win + 1);
      
      for(let i=from;i<=to;i++){
        html += `<button class="page-btn ${i===currentPage ? 'active' : ''}" data-page="${i}">${i+1}</button>`;
      }
      html += `<button class="page-btn" data-action="next" ${currentPage === pages - 1 ? 'disabled' : ''}>&gt;</button>`;
      return html;
    };
    
    const buttonsHtml = makeButtons();
    paginationTop.innerHTML = rangeText + buttonsHtml;
    paginationBottom.innerHTML = rangeText + buttonsHtml;

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
    ensureCurrentPage(total);
    const startIdx = currentPage * PAGE_SIZE;
    const pageItems = itemsFiltered.slice(startIdx, startIdx + PAGE_SIZE);

    listEl.innerHTML = '';
    if(pageItems.length === 0){
      listEl.innerHTML = `<li class="writeup-item"><div>No writeups matched your filters and search term.</div></li>`;
      return;
    }

    pageItems.forEach((w) => {
      const li = document.createElement('li');
      li.className = 'writeup-item ' + (isRead(identifyKey(w)) ? 'read' : 'unread');

      const left = document.createElement('div');
      left.className = 'leftmeta';
      left.innerHTML = `
        <div style="font-size:12px;color:var(--muted)">${escapeHtml(w.source || 'Unknown')}</div>
        <div style="font-size:14px;font-weight:600">${formatDate(w.date)}</div>
        <div class="bounty">${w.bountyFormatted || '<span style="color:var(--muted);font-size:14px;font-weight:400">No Bounty</span>'}</div>
      `;

      const body = document.createElement('div');
      body.style.flex = '1';
      body.innerHTML = `
        <div class="title"><a href="${escapeHtml(w.url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${escapeHtml(w.title)}</a></div>
        <div class="meta">
          <div class="meta-row">
            ${w.author ? `<strong>${escapeHtml(w.author)}</strong>` : '<span style="color:var(--muted)">Unknown Author</span>'}
            ${w.program ? `<span style="margin-left:8px">• ${escapeHtml(w.program)}</span>` : ''}
          </div>
          ${w.tags && w.tags.length ? '<div class="meta-row">' + w.tags.map(t=>`<span class="badge">${escapeHtml(t)}</span>`).join(' ') + '</div>' : ''}
          <div style="margin-top:10px;font-size:14px">${escapeHtml(w.desc || '')}</div>
        </div>
      `;

      const actions = document.createElement('div');
      actions.className = 'actions';

      const readBtn = document.createElement('button');
      readBtn.className = 'btn ' + (isRead(identifyKey(w)) ? 'read' : 'unread');
      readBtn.textContent = isRead(identifyKey(w)) ? 'Mark Unread' : 'Mark Read';
      readBtn.onclick = (ev)=>{ ev.stopPropagation(); toggleRead(w); };

      const commentBtn = document.createElement('button');
      commentBtn.className = 'btn secondary-btn';
      commentBtn.textContent = 'Note';
      commentBtn.onclick = (ev)=>{ ev.stopPropagation(); openCommentModal(w); };

      const openBtn = document.createElement('button');
      openBtn.className = 'btn accent-btn';
      openBtn.textContent = 'Open';
      openBtn.onclick = (ev)=>{
        ev.stopPropagation();
        if(w.url) window.open(w.url, '_blank');
        else alert('No URL available.');
      };

      actions.appendChild(readBtn);
      actions.appendChild(commentBtn);
      if(userdata.settings.showOpen) actions.appendChild(openBtn);

      li.appendChild(left);
      li.appendChild(body);
      li.appendChild(actions);

      const key = identifyKey(w);
      if(userdata.comments && userdata.comments[key]){
        const c = document.createElement('div');
        c.className = 'commentBox';
        c.textContent = userdata.comments[key];
        li.appendChild(c);
      }

      li.onclick = ()=> { toggleRead(w); };
      listEl.appendChild(li);
    });
  }

  function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }
  function guessSource(url){
    try { return url ? new URL(url).hostname.replace('www.','') : ''; } catch(e){ return ''; }
  }
  function formatDate(s){
    if(!s) return '';
    const d = new Date(s);
    if(isNaN(d)) return s;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // --- Heatmap Logic (52 Weeks + 2 Future Weeks) ---

function getReadItemsByDate(dateStr){
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
    const list = document.createElement('div');
    list.style.display = 'grid';
    list.style.gap = '10px';
    reads.forEach(r => {
      const key = identifyKey(r.item);
      const comment = (userdata.comments && userdata.comments[key]) || '';
      const card = document.createElement('div');
      card.className = 'card';
      card.style.padding = '12px';
      card.innerHTML = `
        <div style="font-weight:700">${escapeHtml(r.item.title || '(untitled)')}</div>
        <div style="font-size:13px;color:var(--muted);margin-top:6px">
          ${r.item.url ? `<a href="${escapeHtml(r.item.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);" onclick="event.stopPropagation()">${escapeHtml(r.item.url)}</a>` : '<span style="opacity:.8">no url</span>'}
        </div>
        ${comment ? `<div style="margin-top:8px;font-style:italic;font-size:13px;color:var(--text)">"${escapeHtml(comment)}"</div>` : ''}
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

function renderHeatmap(){
  // Logic: Show 52 weeks back + current week + 2 weeks future = ~54/55 weeks total
  // We want the grid to end 2 weeks from now.
  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + 14); // 2 weeks in future
  
  // To keep grid aligned to weeks, find the Saturday of that future week (or Sat of this week + 14 days)
  // But standard heatmaps (GitHub) usually fill columns.
  // We will generate exactly 54 weeks backwards from that future date.
  const totalWeeks = 54;
  
  // Calculate Start Date
  // 54 * 7 days ago from endDate
  const start = new Date(endDate);
  start.setDate(start.getDate() - (totalWeeks * 7));
  
  // Align start to nearest previous Sunday? Or just fill days?
  // GitHub starts on Sunday.
  const dayOfWeek = start.getDay(); // 0(Sun)..6(Sat)
  // Shift start back to Sunday
  start.setDate(start.getDate() - dayOfWeek);

  const weeks = [];
  // Generate weeks until we pass endDate
  let cur = new Date(start);
  while(cur <= endDate || weeks.length < 54){
    const week = [];
    for(let d=0; d<7; d++){
      week.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }

  const counts = {};
  for(const [k, ts] of Object.entries(userdata.read || {})){
    try {
      const d = new Date(ts);
      if(isNaN(d)) continue;
      const key = d.toISOString().slice(0,10);
      counts[key] = (counts[key] || 0) + 1;
    } catch(e){}
  }

  let maxCount = 0;
  for(const v of Object.values(counts)) if(v > maxCount) maxCount = v;
  const t1 = Math.max(1, Math.ceil(maxCount * 0.25));
  const t2 = Math.max(2, Math.ceil(maxCount * 0.5));
  const t3 = Math.max(3, Math.ceil(maxCount * 0.75));

  const isDark = document.body.classList.contains('dark');
  const palette = [
    isDark ? '#161b22' : '#ebedf0',
    isDark ? '#0e4429' : '#9be9a8',
    isDark ? '#006d32' : '#40c463', 
    isDark ? '#26a65b' : '#30a14e',
    isDark ? '#3dd27f' : '#216e39' 
  ];

  // Labels
  const monthLabels = [];
  let lastMonth = null;
  weeks.forEach((week, idx) => {
    const mon = week[0];
    const monMonth = mon.getMonth();
    if(lastMonth === null || monMonth !== lastMonth){
      const name = mon.toLocaleString(undefined, { month: 'short' });
      monthLabels.push({ name, index: idx });
      lastMonth = monMonth;
    }
  });

  const monthLabelsEl = document.getElementById('heatmapMonthLabels');
  monthLabelsEl.innerHTML = '';
  if(monthLabels.length){
    monthLabelsEl.style.position = 'relative';
    monthLabels.forEach(lbl => {
        const span = document.createElement('div');
        span.textContent = lbl.name;
        span.style.position = 'absolute';
        span.style.left = (lbl.index * 20) + 'px'; // (14+6)
        monthLabelsEl.appendChild(span);
    });
  }

  const weeksContainer = document.getElementById('heatmapWeeks');
  weeksContainer.innerHTML = '';
  
  weeks.forEach((week) => {
    const col = document.createElement('div');
    col.className = 'week-col';
    week.forEach((d) => {
      const dateKey = d.toISOString().slice(0,10);
      const count = counts[dateKey] || 0;
      const cell = document.createElement('div');
      
      // Determine level
      let level = 0;
      if(count > 0) level = (count >= t3 ? 4 : (count >= t2 ? 3 : (count >= t1 ? 2 : 1)));
      
      cell.className = 'day-cell' + (count === 0 ? ' empty' : '');
      
      // If date is in future, maybe style differently? 
      // Standard heatmap just shows empty.
      
      cell.style.background = palette[level];
      cell.dataset.date = dateKey;
      
      // Tooltip
      cell.addEventListener('mouseenter', (ev) => {
        const tt = document.getElementById('heatmapTooltip');
        const idxItems = getReadItemsByDate(dateKey);
        tt.innerHTML = `<span class="date">${dateKey}</span>
                        <div class="count">${count} read${count !== 1 ? 's' : ''}</div>`;
        tt.style.display = 'block';
        const rect = ev.target.getBoundingClientRect();
        let left = rect.right + 10;
        let top = rect.top - 6;
        if(left + 170 > window.innerWidth) left = rect.left - 170;
        tt.style.left = left + 'px';
        tt.style.top = top + 'px';
      });
      cell.addEventListener('mouseleave', ()=> {
        document.getElementById('heatmapTooltip').style.display = 'none';
      });
      cell.addEventListener('click', ()=> openDayModal(dateKey));

      col.appendChild(cell);
    });
    weeksContainer.appendChild(col);
  });

  const legendBoxes = document.getElementById('heatmapLegendBoxes');
  legendBoxes.innerHTML = '';
  for(let i=0;i<palette.length;i++){
    const b = document.createElement('div');
    b.className = 'legend-box';
    b.style.background = palette[i];
    legendBoxes.appendChild(b);
  }
}

  // --- Initial Load & Event Handlers ---
  
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

  searchEl.addEventListener('input', ()=>{ currentPage = 0; renderList(); });
  onlyUnreadEl.addEventListener('change', ()=>{ currentPage = 0; renderList(); });
  sortEl.addEventListener('change', ()=>{
    userdata.settings.sort = sortEl.value;
    saveUserdata().then(()=>{ currentPage = 0; renderList(); });
  });

  filterBtn.addEventListener('click', openSidebar);
  closeSidebarBtn.addEventListener('click', closeSidebar);
  sidebarOverlay.addEventListener('click', closeSidebar);
  
  applyFiltersBtn.addEventListener('click', applyFiltersToStateAndRender);
  resetFiltersBtn.addEventListener('click', resetFilters);
  
  darkToggle.addEventListener('change', ()=>{
    userdata.settings.dark = !!darkToggle.checked;
    saveUserdata().then(()=>{
      document.body.classList.toggle('dark', userdata.settings.dark);
      renderHeatmap();
    });
  });

  showOpenBtnEl.addEventListener('change', ()=>{
    userdata.settings.showOpen = !!showOpenBtnEl.checked;
    saveUserdata().then(()=>renderList());
  });

  weeklyGoalEl.addEventListener('change', ()=>{
    userdata.settings.weekly_goal = Number(weeklyGoalEl.value || 0);
    saveUserdata().then(()=>renderProgress());
  });
  
  commentModalClose.addEventListener('click', closeCommentModal);
  commentModalCancel.addEventListener('click', closeCommentModal);
  commentModalSave.addEventListener('click', saveCommentFromModal);
  
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
        alert('Writeups refreshed.');
      } else {
        alert('Failed: ' + (j.message||'unknown'));
      }
    } catch(e){
      alert('Error updating: ' + e);
    } finally {
      updateWriteupsBtn.disabled = false;
      updateWriteupsBtn.textContent = 'Update';
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (ev)=>{
    const tag = ev.target.tagName.toLowerCase();
    const isInput = tag === 'input' || tag === 'textarea' || tag === 'select';
    
    if(ev.key === '/' && !isInput){
      ev.preventDefault();
      searchEl.focus();
    } 
    else if(!isInput) {
      if(ev.key === 'u'){
        onlyUnreadEl.checked = !onlyUnreadEl.checked;
        currentPage = 0; renderList();
      } else if(ev.key === 'f'){
        ev.preventDefault();
        if(sidebarEl.getAttribute('aria-hidden') === 'true') openSidebar();
        else closeSidebar();
      }
    }
  });

  await loadAndRender();

})();