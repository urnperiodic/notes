/* ============================================================
   NoteForge — client-side document editor
   Vanilla JS. State persisted in LocalStorage.
   Sections:
     1. State model & persistence
     2. Utilities
     3. Rendering (sidebar, folders, notes, tabs)
     4. Editor lifecycle (open/save/autosave)
     5. Rich text commands & toolbar
     6. Insert features
     7. Import / Export
     8. Panels: outline, find/replace, versions, settings
     9. Bonus: preview, zoom, focus, shortcuts
    10. Init
   ============================================================ */
(function () {
'use strict';

/* ============================================================
   1. STATE MODEL & PERSISTENCE
   ============================================================ */
const STORE_KEY = 'noteforge_v1';
const uid = () => 'id_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const now = () => Date.now();

const DEFAULT_STATE = {
  notes: {},          // id -> note
  folders: {},        // id -> {id,name,parent,collapsed,order}
  settings: {
    theme: 'light', accent: '#4f7cff', fullWidth: false,
    spellcheck: true, autosave: true, sidebarWidth: 280,
    zoom: 100, toolbarCollapsed: false,
    showAll: false, showRecent: false, showPinned: false, showTags: false,
    showArchive: false, showTrash: false, showFolders: false,
    migratedDeleteAllThs: true,
  },
  ui: { openTabs: [], activeNote: null, view: 'all', activeFolder: null, sort: 'edited', recent: [] },
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Ensure migratedDeleteAllThs exists
      if (parsed.settings && parsed.settings.migratedDeleteAllThs === undefined) {
        parsed.settings.showAll = false;
        parsed.settings.showRecent = false;
        parsed.settings.showPinned = false;
        parsed.settings.showTags = false;
        parsed.settings.showArchive = false;
        parsed.settings.showTrash = false;
        parsed.settings.showFolders = false;
        parsed.settings.migratedDeleteAllThs = true;
      }
      // deep-merge defaults so new fields are present
      parsed.settings = Object.assign({}, DEFAULT_STATE.settings, parsed.settings);
      parsed.ui = Object.assign({}, DEFAULT_STATE.ui, parsed.ui);
      parsed.notes = parsed.notes || {};
      parsed.folders = parsed.folders || {};

      // Cleanup: remove the welcome note if it exists
      let welcomeNoteId = null;
      for (const id in parsed.notes) {
        if (parsed.notes[id] && parsed.notes[id].title === 'Welcome to NoteForge ✨') {
          welcomeNoteId = id;
          delete parsed.notes[id];
        }
      }
      if (welcomeNoteId) {
        // Also remove from activeNote, openTabs, recent
        if (parsed.ui.activeNote === welcomeNoteId) {
          parsed.ui.activeNote = null;
        }
        parsed.ui.openTabs = (parsed.ui.openTabs || []).filter(id => id !== welcomeNoteId);
        parsed.ui.recent = (parsed.ui.recent || []).filter(id => id !== welcomeNoteId);

        // Remove folder "Getting Started" if it's empty
        for (const fId in parsed.folders) {
          if (parsed.folders[fId] && parsed.folders[fId].name === 'Getting Started') {
            const hasOtherNotes = Object.values(parsed.notes).some(n => n.folder === fId);
            if (!hasOtherNotes) {
              delete parsed.folders[fId];
              if (parsed.ui.activeFolder === fId) {
                parsed.ui.activeFolder = null;
                parsed.ui.view = 'all';
              }
            }
          }
        }

        // Persist cleaned up state immediately
        try {
          localStorage.setItem(STORE_KEY, JSON.stringify(parsed));
        } catch (e) {}
      }

      return parsed;
    }
  } catch (e) { console.warn('Load failed, starting fresh', e); }
  return seed();
}

// First-run seed content
function seed() {
  const s = JSON.parse(JSON.stringify(DEFAULT_STATE));
  return s;
}

function newNoteObj(title, folder) {
  const t = now();
  return {
    id: uid(), title: title || 'Untitled', content: '',
    folder: folder || null, pinned: false, archived: false, trashed: false,
    tags: [], color: '', created: t, updated: t,
    versions: [],
  };
}

let saveTimer = null, saveStatusTimer = null;
function persist(showStatus) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    if (showStatus) setSaveStatus('saved');
    updateStorageUsed();
  } catch (e) {
    setSaveStatus('error');
    toast('Storage full — export a backup!', 'error');
  }
}
function scheduleSave() {
  if (!state.settings.autosave) return;
  setSaveStatus('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persist(true), 1200);
}

/* ============================================================
   2. UTILITIES
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (str) => String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stripHtml = (html) => { const d = el('div', null, html); return d.textContent || ''; };
const fmtDate = (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const fmtTime = (ts) => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const relTime = (ts) => {
  const d = (now() - ts) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return Math.floor(d / 60) + 'm ago';
  if (d < 86400) return Math.floor(d / 3600) + 'h ago';
  if (d < 604800) return Math.floor(d / 86400) + 'd ago';
  return fmtDate(ts);
};

function toast(msg, type = '') {
  const t = el('div', 'toast ' + type, `<i class="fa-solid fa-${type === 'success' ? 'circle-check' : type === 'error' ? 'circle-exclamation' : 'circle-info'}"></i><span>${esc(msg)}</span>`);
  $('#toastWrap').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(10px)'; setTimeout(() => t.remove(), 250); }, 2600);
}

function setSaveStatus(kind) {
  const s = $('#saveStatus');
  s.className = 'save-status ' + kind;
  const map = {
    saving: ['fa-spinner', 'Saving…'], saved: ['fa-circle-check', 'Saved'],
    error: ['fa-circle-exclamation', 'Error'],
  };
  const [ic, txt] = map[kind] || map.saved;
  s.innerHTML = `<i class="fa-solid ${ic}"></i><span>${txt}</span>`;
}

function updateStorageUsed() {
  try {
    const bytes = new Blob([localStorage.getItem(STORE_KEY) || '']).size;
    const kb = bytes / 1024;
    $('#storageUsed').textContent = kb > 1024 ? (kb / 1024).toFixed(2) + ' MB' : kb.toFixed(1) + ' KB';
  } catch (e) {}
}

/* ============================================================
   3. RENDERING
   ============================================================ */
const QUICK_VIEWS = [
  { id: 'all', icon: 'fa-note-sticky', label: 'All Notes' },
  { id: 'recent', icon: 'fa-clock', label: 'Recent' },
  { id: 'pinned', icon: 'fa-thumbtack', label: 'Pinned' },
  { id: 'tags', icon: 'fa-tags', label: 'Tags' },
  { id: 'archive', icon: 'fa-box-archive', label: 'Archive' },
  { id: 'trash', icon: 'fa-trash', label: 'Trash' },
];

function renderQuickViews() {
  const c = $('#quickViews'); c.innerHTML = '';
  let countVisible = 0;
  QUICK_VIEWS.forEach(v => {
    // Check if view is configured to show
    const settingKey = 'show' + v.id.charAt(0).toUpperCase() + v.id.slice(1);
    if (state.settings[settingKey] === false) return;

    countVisible++;
    const count = countForView(v.id);
    const item = el('div', 'nav-item' + (state.ui.view === v.id && !state.ui.activeFolder ? ' active' : ''));
    item.innerHTML = `<i class="fa-solid fa-fw ${v.icon}"></i><span>${v.label}</span>` +
      (count != null ? `<span class="count">${count}</span>` : '');
    item.onclick = () => { state.ui.view = v.id; state.ui.activeFolder = null; renderAll(); };
    item.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      openCtx(e.clientX, e.clientY, [
        { icon: 'fa-eye-slash', label: 'Hide from sidebar', action: () => {
          state.settings[settingKey] = false;
          if (state.ui.view === v.id) state.ui.view = 'all';
          persist();
          renderAll();
          if (window._applySettingsCheckboxes) window._applySettingsCheckboxes();
          toast(v.label + ' hidden. Re-enable in Settings.', 'info');
        }}
      ]);
    };
    c.appendChild(item);
  });
  c.style.display = countVisible > 0 ? 'block' : 'none';
}

function countForView(view) {
  const all = Object.values(state.notes);
  switch (view) {
    case 'all': return all.filter(n => !n.trashed && !n.archived).length;
    case 'pinned': return all.filter(n => n.pinned && !n.trashed && !n.archived).length;
    case 'archive': return all.filter(n => n.archived && !n.trashed).length;
    case 'trash': return all.filter(n => n.trashed).length;
    case 'recent': return null;
    case 'tags': return null;
  }
}

// Recursive folder tree
function renderFolderTree() {
  const root = $('#folderTree'); root.innerHTML = '';
  const foldersSection = $('#foldersSection');
  if (foldersSection) {
    foldersSection.style.display = state.settings.showFolders ? 'block' : 'none';
  }
  const foldersLabel = $('#foldersLabel');
  if (foldersLabel) {
    foldersLabel.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      openCtx(e.clientX, e.clientY, [
        { icon: 'fa-eye-slash', label: 'Hide from sidebar', action: () => {
          state.settings.showFolders = false;
          persist();
          renderAll();
          if (window._applySettingsCheckboxes) window._applySettingsCheckboxes();
          toast('Folders hidden. Re-enable in Settings.', 'info');
        }}
      ]);
    };
  }
  const build = (parentId, container) => {
    Object.values(state.folders)
      .filter(f => f.parent === parentId)
      .sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name))
      .forEach(f => {
        const item = el('div', 'tree-item');
        const noteCount = Object.values(state.notes).filter(n => n.folder === f.id && !n.trashed && !n.archived).length;
        const hasChildren = Object.values(state.folders).some(x => x.parent === f.id);
        const row = el('div', 'tree-row' + (state.ui.activeFolder === f.id ? ' active' : ''));
        row.dataset.folder = f.id;
        row.innerHTML =
          `<span class="tree-caret ${f.collapsed ? '' : 'open'}"><i class="fa-solid fa-chevron-right"></i></span>` +
          `<i class="fa-solid fa-folder folder-ico" style="color:${f.color || 'var(--accent)'}"></i>` +
          `<span class="tree-title">${esc(f.name)}</span>` +
          `<span class="count">${noteCount}</span>` +
          `<span class="tree-actions">
             <button class="tf-add" title="Add subfolder"><i class="fa-solid fa-plus"></i></button>
             <button class="tf-more" title="More"><i class="fa-solid fa-ellipsis"></i></button>
           </span>`;
        row.onclick = (e) => {
          if (e.target.closest('.tf-add')) { e.stopPropagation(); promptFolder(f.id); return; }
          if (e.target.closest('.tf-more')) { e.stopPropagation(); folderMenu(e, f); return; }
          if (e.target.closest('.tree-caret')) { f.collapsed = !f.collapsed; persist(); renderFolderTree(); return; }
          state.ui.activeFolder = f.id; state.ui.view = 'folder'; renderAll();
        };
        // drag-to-folder drop target
        row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('drop-target'); });
        row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
        row.addEventListener('drop', (e) => {
          e.preventDefault(); row.classList.remove('drop-target');
          const nid = e.dataTransfer.getData('note-id');
          if (nid && state.notes[nid]) { state.notes[nid].folder = f.id; persist(); toast('Moved to ' + f.name, 'success'); renderAll(); }
        });
        item.appendChild(row);
        if (!f.collapsed && hasChildren) {
          const kids = el('div', 'tree-children');
          build(f.id, kids);
          item.appendChild(kids);
        }
        container.appendChild(item);
      });
  };
  build(null, root);
  if (!Object.keys(state.folders).length) root.innerHTML = '<div class="empty-hint">No folders yet</div>';
}

// The note list depends on current view / search / sort
function getVisibleNotes() {
  let list = Object.values(state.notes);
  const q = ($('#searchInput').value || '').trim().toLowerCase();
  const v = state.ui.view;

  if (state.ui.activeFolder) list = list.filter(n => n.folder === state.ui.activeFolder && !n.trashed && !n.archived);
  else if (v === 'all') list = list.filter(n => !n.trashed && !n.archived);
  else if (v === 'pinned') list = list.filter(n => n.pinned && !n.trashed && !n.archived);
  else if (v === 'archive') list = list.filter(n => n.archived && !n.trashed);
  else if (v === 'trash') list = list.filter(n => n.trashed);
  else if (v === 'recent') { list = state.ui.recent.map(id => state.notes[id]).filter(n => n && !n.trashed); return list; }
  else if (v === 'tags') list = list.filter(n => !n.trashed && !n.archived);

  if (q) list = list.filter(n => n.title.toLowerCase().includes(q) || stripHtml(n.content).toLowerCase().includes(q));

  const sort = state.ui.sort;
  list.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (sort === 'name') return a.title.localeCompare(b.title);
    if (sort === 'created') return b.created - a.created;
    if (sort === 'edited') return b.updated - a.updated;
    return 0;
  });
  return list;
}

function renderNoteList() {
  const c = $('#noteList'); c.innerHTML = '';
  const heading = $('#notesHeading');
  if (state.ui.activeFolder) heading.textContent = state.folders[state.ui.activeFolder]?.name || 'Folder';
  else heading.textContent = (QUICK_VIEWS.find(v => v.id === state.ui.view) || {}).label || 'Notes';

  if (state.ui.view === 'tags' && !state.ui.activeFolder) { renderTagsView(c); return; }

  const list = getVisibleNotes();
  if (!list.length) { c.innerHTML = '<div class="empty-hint">No notes here yet.<br>Click “New Note” to begin.</div>'; return; }

  list.forEach((n, idx) => {
    const row = el('div', 'note-row' + (state.ui.activeNote === n.id ? ' active' : ''));
    row.dataset.note = n.id;
    row.draggable = true;
    row.innerHTML =
      (n.color ? `<span class="note-color-dot" style="background:${n.color}"></span>` : '') +
      `<span class="note-name">${esc(n.title || 'Untitled')}</span>` +
      (n.pinned ? '<i class="fa-solid fa-thumbtack pin-ico"></i>' : '') +
      `<button class="note-menu" title="More"><i class="fa-solid fa-ellipsis-vertical"></i></button>`;
    row.onclick = (e) => {
      if (e.target.closest('.note-menu')) { e.stopPropagation(); noteMenu(e, n); return; }
      openNote(n.id);
      if (window.innerWidth <= 900) closeMobileSidebar();
    };
    row.oncontextmenu = (e) => { e.preventDefault(); noteMenu(e, n); };
    // drag reorder + move to folder
    row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('note-id', n.id); row.style.opacity = '0.4'; });
    row.addEventListener('dragend', () => { row.style.opacity = ''; });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      row.classList.toggle('drag-over-top', before);
      row.classList.toggle('drag-over-bottom', !before);
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over-top', 'drag-over-bottom'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('drag-over-top', 'drag-over-bottom');
      const nid = e.dataTransfer.getData('note-id');
      if (nid && nid !== n.id) reorderNote(nid, n.id, (e.clientY - row.getBoundingClientRect().top) < row.getBoundingClientRect().height / 2);
    });
    c.appendChild(row);
  });
}

// Simple manual ordering by writing an "order" field on notes within same view
function reorderNote(dragId, targetId, before) {
  const list = getVisibleNotes();
  const ids = list.map(n => n.id).filter(id => id !== dragId);
  const ti = ids.indexOf(targetId);
  ids.splice(before ? ti : ti + 1, 0, dragId);
  ids.forEach((id, i) => { state.notes[id].order = i; });
  // ensure sort respects order for edited default: keep as-is but nudge updated within group
  persist(); renderNoteList();
}

function renderTagsView(container) {
  const tagMap = {};
  Object.values(state.notes).filter(n => !n.trashed).forEach(n => (n.tags || []).forEach(t => {
    tagMap[t] = tagMap[t] || []; tagMap[t].push(n);
  }));
  const tags = Object.keys(tagMap).sort();
  if (!tags.length) { container.innerHTML = '<div class="empty-hint">No tags yet.<br>Add tags from a note’s menu.</div>'; return; }
  tags.forEach(t => {
    const head = el('div', 'nav-item', `<i class="fa-solid fa-fw fa-hashtag"></i><span>${esc(t)}</span><span class="count">${tagMap[t].length}</span>`);
    container.appendChild(head);
    tagMap[t].forEach(n => {
      const row = el('div', 'note-row' + (state.ui.activeNote === n.id ? ' active' : ''));
      row.style.marginLeft = '14px';
      row.innerHTML = `<span class="note-name">${esc(n.title)}</span>`;
      row.onclick = () => openNote(n.id);
      container.appendChild(row);
    });
  });
}

/* ---------- Tabs ---------- */
function renderTabs() {
  const bar = $('#tabsBar'); bar.innerHTML = '';
  state.ui.openTabs = state.ui.openTabs.filter(id => state.notes[id]);
  if (state.ui.openTabs.length <= 1) { bar.classList.add('hidden'); }
  else bar.classList.remove('hidden');
  state.ui.openTabs.forEach(id => {
    const n = state.notes[id]; if (!n) return;
    const tab = el('div', 'tab' + (state.ui.activeNote === id ? ' active' : ''));
    tab.innerHTML = `<span class="tab-title">${esc(n.title || 'Untitled')}</span><span class="tab-close"><i class="fa-solid fa-xmark"></i></span>`;
    tab.onclick = (e) => { if (e.target.closest('.tab-close')) { closeTab(id); return; } openNote(id); };
    bar.appendChild(tab);
  });
}

function closeTab(id) {
  const i = state.ui.openTabs.indexOf(id);
  state.ui.openTabs.splice(i, 1);
  if (state.ui.activeNote === id) {
    const next = state.ui.openTabs[Math.max(0, i - 1)];
    if (next) openNote(next); else { state.ui.activeNote = null; clearEditor(); }
  }
  persist(); renderTabs();
}

function renderAll() {
  renderQuickViews();
  renderFolderTree();
  renderNoteList();
  renderTabs();
}

/* ============================================================
   4. EDITOR LIFECYCLE
   ============================================================ */
const editor = $('#editor');
let currentNoteId = null;

function openNote(id) {
  const n = state.notes[id]; if (!n) return;
  // save current before switching
  if (currentNoteId && currentNoteId !== id) captureContent();
  currentNoteId = id;
  state.ui.activeNote = id;
  if (!state.ui.openTabs.includes(id)) state.ui.openTabs.push(id);
  // recents
  state.ui.recent = [id, ...state.ui.recent.filter(x => x !== id)].slice(0, 15);
  editor.innerHTML = n.content || '';
  $('#docTitle').value = n.title || '';
  persist();
  renderAll();
  updateStats();
  buildOutline();
  updatePreview();
  bindChecklistItems();
  setSaveStatus('saved');
}

function clearEditor() { editor.innerHTML = ''; $('#docTitle').value = ''; updateStats(); }

// pull DOM content into current note object
function captureContent() {
  if (!currentNoteId) return;
  const n = state.notes[currentNoteId]; if (!n) return;
  const html = editor.innerHTML;
  const title = $('#docTitle').value.trim() || 'Untitled';
  if (n.content !== html || n.title !== title) {
    maybeSaveVersion(n, html);
    n.content = html; n.title = title; n.updated = now();
  }
}

// Save a version snapshot at most every 2 minutes of edits
function maybeSaveVersion(n, newHtml) {
  n.versions = n.versions || [];
  const last = n.versions[n.versions.length - 1];
  if (!last || (now() - last.ts > 120000)) {
    n.versions.push({ ts: now(), title: n.title, content: n.content });
    if (n.versions.length > 30) n.versions.shift();
  }
}

function onEditorInput() {
  captureContent();
  scheduleSave();
  updateStats();
  clearTimeout(window._outlineT);
  window._outlineT = setTimeout(() => { buildOutline(); updatePreview(); renderTabs(); }, 400);
}

function createNote(folder) {
  captureContent();
  const n = newNoteObj('Untitled', folder || state.ui.activeFolder || null);
  state.notes[n.id] = n;
  persist();
  openNote(n.id);
  $('#docTitle').focus(); $('#docTitle').select();
  toast('Note created', 'success');
}

/* ---------- Stats ---------- */
function updateStats() {
  const text = editor.textContent || '';
  const words = (text.trim().match(/\S+/g) || []).length;
  const chars = text.length;
  $('#wordCount').textContent = words;
  $('#charCount').textContent = chars;
  $('#readTime').textContent = Math.max(1, Math.ceil(words / 200)) + ' min';
  $('#paraCount').textContent = editor.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre').length;
}

// expose to window for other sections
window.NF = { $, $$, el, esc, stripHtml, state, persist, scheduleSave, toast, openNote, renderAll,
  editor, captureContent, updateStats, fmtTime, relTime, fmtDate, buildOutline: () => buildOutline(),
  currentNote: () => state.notes[currentNoteId], setCurrent: (id) => currentNoteId = id, uid, now, closeTab };

/* placeholders assigned in part 2 */
function buildOutline() { if (window._buildOutline) window._buildOutline(); }
function updatePreview() { if (window._updatePreview) window._updatePreview(); }
function bindChecklistItems() { if (window._bindChecklist) window._bindChecklist(); }
function promptFolder(p) { if (window._promptFolder) window._promptFolder(p); }
function folderMenu(e, f) { if (window._folderMenu) window._folderMenu(e, f); }
function noteMenu(e, n) { if (window._noteMenu) window._noteMenu(e, n); }
function closeMobileSidebar() { $('#app').classList.remove('sidebar-open'); }

/* ============================================================
   Wire up basic events that belong to core
   ============================================================ */
$('#newNoteBtn').onclick = () => createNote();
$('#searchInput').oninput = () => renderNoteList();
$('#docTitle').oninput = () => { captureContent(); scheduleSave(); renderTabs(); };
editor.addEventListener('input', onEditorInput);
$('#addFolderBtn').onclick = () => promptFolder(null);

$('#sortBtn').onclick = (e) => {
  const menu = [
    ['edited', 'fa-clock', 'Last edited'],
    ['created', 'fa-calendar-plus', 'Date created'],
    ['name', 'fa-arrow-down-a-z', 'Name'],
  ];
  openCtx(e.clientX, e.clientY, menu.map(([k, ic, label]) => ({
    icon: ic, label: label + (state.ui.sort === k ? '  ✓' : ''),
    action: () => { state.ui.sort = k; persist(); renderNoteList(); },
  })));
};

/* expose core render + save on unload (session recovery) */
window.addEventListener('beforeunload', () => { captureContent(); persist(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { captureContent(); persist(); } });

// store references used by later parts
window._core = { renderAll, openNote, createNote, captureContent, currentNoteId: () => currentNoteId, openCtx: null };

/* ============================================================
   Context menu helper (shared)
   ============================================================ */
const ctxMenu = $('#ctxMenu');
function openCtx(x, y, items) {
  ctxMenu.innerHTML = '';
  items.forEach(it => {
    if (it.sep) { ctxMenu.appendChild(el('div', 'ctx-sep')); return; }
    if (it.label && it.custom) { ctxMenu.appendChild(it.custom); return; }
    const row = el('div', 'ctx-item' + (it.danger ? ' danger' : ''), `<i class="fa-solid ${it.icon}"></i><span>${it.label}</span>`);
    row.onclick = () => { closeCtx(); it.action && it.action(); };
    ctxMenu.appendChild(row);
  });
  ctxMenu.style.left = Math.min(x, window.innerWidth - 210) + 'px';
  ctxMenu.style.top = Math.min(y, window.innerHeight - ctxMenu.offsetHeight - 20) + 'px';
  ctxMenu.classList.add('open');
  setTimeout(() => document.addEventListener('mousedown', ctxOutside), 0);
}
function ctxOutside(e) { if (!ctxMenu.contains(e.target)) closeCtx(); }
function closeCtx() { ctxMenu.classList.remove('open'); document.removeEventListener('mousedown', ctxOutside); }
window._openCtx = openCtx;

/* ============================================================
   Folder & note menus
   ============================================================ */
window._promptFolder = function (parent) {
  openModal('New Folder', `<label class="field-label">Folder name</label><input class="field-input" id="mFolderName" placeholder="e.g. Projects">`,
    [{ label: 'Cancel', action: closeModal }, {
      label: 'Create', primary: true, action: () => {
        const name = $('#mFolderName').value.trim(); if (!name) return;
        const f = { id: uid(), name, parent: parent || null, collapsed: false, order: Object.keys(state.folders).length };
        state.folders[f.id] = f; persist(); renderAll(); closeModal(); toast('Folder created', 'success');
      }
    }]);
  setTimeout(() => $('#mFolderName').focus(), 50);
};

window._folderMenu = function (e, f) {
  openCtx(e.clientX, e.clientY, [
    { icon: 'fa-pen', label: 'Rename', action: () => renameFolder(f) },
    { icon: 'fa-folder-plus', label: 'Add subfolder', action: () => promptFolder(f.id) },
    { icon: 'fa-file-circle-plus', label: 'New note here', action: () => createNote(f.id) },
    { sep: true },
    { icon: 'fa-palette', label: 'Color', action: () => colorFolder(f, e) },
    { sep: true },
    { icon: 'fa-trash', label: 'Delete folder', danger: true, action: () => deleteFolder(f) },
  ]);
};
function renameFolder(f) {
  openModal('Rename Folder', `<input class="field-input" id="mRen" value="${esc(f.name)}">`,
    [{ label: 'Cancel', action: closeModal }, { label: 'Save', primary: true, action: () => { f.name = $('#mRen').value.trim() || f.name; persist(); renderAll(); closeModal(); } }]);
  setTimeout(() => { $('#mRen').focus(); $('#mRen').select(); }, 50);
}
function colorFolder(f, e) {
  const colors = ['#4f7cff', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#64748b'];
  const wrap = el('div'); wrap.innerHTML = '<div class="ctx-sub-label">Folder color</div>';
  const choices = el('div', 'color-choices');
  colors.forEach(c => { const s = el('span'); s.style.background = c; s.onclick = () => { f.color = c; persist(); renderAll(); closeCtx(); }; choices.appendChild(s); });
  wrap.appendChild(choices);
  openCtx(e.clientX, e.clientY, [{ custom: wrap, label: 'x' }]);
}
function deleteFolder(f) {
  confirmModal(`Delete folder “${f.name}”?`, 'Notes inside will move to All Notes. Subfolders are removed.', () => {
    Object.values(state.notes).forEach(n => { if (n.folder === f.id) n.folder = null; });
    Object.values(state.folders).forEach(x => { if (x.parent === f.id) x.parent = null; });
    delete state.folders[f.id];
    if (state.ui.activeFolder === f.id) { state.ui.activeFolder = null; state.ui.view = 'all'; }
    persist(); renderAll(); toast('Folder deleted');
  });
}

window._noteMenu = function (e, n) {
  const inTrash = n.trashed;
  const items = inTrash ? [
    { icon: 'fa-rotate-left', label: 'Restore', action: () => { n.trashed = false; persist(); renderAll(); toast('Restored', 'success'); } },
    { icon: 'fa-trash-can', label: 'Delete forever', danger: true, action: () => confirmModal('Delete forever?', 'This cannot be undone.', () => { delete state.notes[n.id]; closeTab(n.id); persist(); renderAll(); }) },
  ] : [
    { icon: n.pinned ? 'fa-thumbtack-slash' : 'fa-thumbtack', label: n.pinned ? 'Unpin' : 'Pin', action: () => { n.pinned = !n.pinned; persist(); renderAll(); } },
    { icon: 'fa-pen', label: 'Rename', action: () => renameNote(n) },
    { icon: 'fa-copy', label: 'Duplicate', action: () => duplicateNote(n) },
    { icon: 'fa-folder-tree', label: 'Move to folder…', action: () => moveNote(n) },
    { icon: 'fa-tags', label: 'Edit tags…', action: () => editTags(n) },
    { icon: 'fa-palette', label: 'Color label', action: () => colorNote(n, e) },
    { sep: true },
    { icon: 'fa-box-archive', label: n.archived ? 'Unarchive' : 'Archive', action: () => { n.archived = !n.archived; persist(); renderAll(); toast(n.archived ? 'Archived' : 'Unarchived'); } },
    { icon: 'fa-trash', label: 'Move to trash', danger: true, action: () => { n.trashed = true; persist(); renderAll(); toast('Moved to trash'); } },
  ];
  openCtx(e.clientX, e.clientY, items);
};

function renameNote(n) {
  openModal('Rename Note', `<input class="field-input" id="mRenN" value="${esc(n.title)}">`,
    [{ label: 'Cancel', action: closeModal }, { label: 'Save', primary: true, action: () => {
      n.title = $('#mRenN').value.trim() || 'Untitled'; n.updated = now(); persist();
      if (n.id === currentNoteId) $('#docTitle').value = n.title; renderAll(); closeModal();
    } }]);
  setTimeout(() => { $('#mRenN').focus(); $('#mRenN').select(); }, 50);
}
function duplicateNote(n) {
  const copy = JSON.parse(JSON.stringify(n));
  copy.id = uid(); copy.title = n.title + ' (copy)'; copy.created = copy.updated = now(); copy.pinned = false; copy.versions = [];
  state.notes[copy.id] = copy; persist(); renderAll(); openNote(copy.id); toast('Duplicated', 'success');
}
function moveNote(n) {
  const opts = ['<option value="">— No folder —</option>'].concat(
    Object.values(state.folders).map(f => `<option value="${f.id}" ${n.folder === f.id ? 'selected' : ''}>${esc(f.name)}</option>`)).join('');
  openModal('Move Note', `<label class="field-label">Choose folder</label><select class="field-input" id="mMove">${opts}</select>`,
    [{ label: 'Cancel', action: closeModal }, { label: 'Move', primary: true, action: () => { n.folder = $('#mMove').value || null; persist(); renderAll(); closeModal(); toast('Moved', 'success'); } }]);
}
function editTags(n) {
  openModal('Edit Tags', `<label class="field-label">Comma-separated tags</label><input class="field-input" id="mTags" value="${esc((n.tags || []).join(', '))}" placeholder="work, ideas, todo">`,
    [{ label: 'Cancel', action: closeModal }, { label: 'Save', primary: true, action: () => {
      n.tags = $('#mTags').value.split(',').map(t => t.trim()).filter(Boolean); persist(); renderAll(); closeModal();
    } }]);
  setTimeout(() => $('#mTags').focus(), 50);
}
function colorNote(n, e) {
  const colors = ['', '#4f7cff', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899'];
  const wrap = el('div'); wrap.innerHTML = '<div class="ctx-sub-label">Color label</div>';
  const choices = el('div', 'color-choices');
  colors.forEach(c => { const s = el('span'); s.style.background = c || 'transparent'; if (!c) s.innerHTML = '<i class="fa-solid fa-ban" style="font-size:11px;color:var(--text-3)"></i>'; s.onclick = () => { n.color = c; persist(); renderAll(); closeCtx(); }; choices.appendChild(s); });
  wrap.appendChild(choices);
  openCtx(e.clientX, e.clientY, [{ custom: wrap, label: 'x' }]);
}
window._renameNote = renameNote; window._duplicateNote = duplicateNote;

/* ============================================================
   Modal helpers
   ============================================================ */
const overlay = $('#overlay');
function openModal(title, bodyHtml, buttons, wide) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHtml;
  const foot = $('#modalFoot'); foot.innerHTML = '';
  (buttons || []).forEach(b => {
    const btn = el('button', 'pill-btn' + (b.primary ? ' primary' : ''), b.label);
    btn.onclick = b.action; foot.appendChild(btn);
  });
  $('#modal').style.width = wide ? '640px' : '480px';
  overlay.classList.add('open');
}
function closeModal() { overlay.classList.remove('open'); }
function confirmModal(title, msg, onYes) {
  openModal(title, `<p style="color:var(--text-2);font-size:14px;line-height:1.6">${esc(msg)}</p>`,
    [{ label: 'Cancel', action: closeModal }, { label: 'Confirm', primary: true, action: () => { closeModal(); onYes(); } }]);
}
$('#modalClose').onclick = closeModal;
overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
window._modal = { openModal, closeModal, confirmModal };

})();
