/* ============================================================
   NoteForge — editor features (part 2)
   Rich text commands, toolbar, bubble, inserts, import/export,
   panels (outline/find/versions/settings), preview, zoom, focus.
   Depends on globals set by app.js (window.NF, window._*).
   ============================================================ */
(function () {
'use strict';

const NF = window.NF;
const { $, $$, el, esc, stripHtml, state, persist, scheduleSave, toast, closeTab } = NF;
const editor = NF.editor;
const openCtx = window._openCtx;
const { openModal, closeModal, confirmModal } = window._modal;

/* ============================================================
   5. RICH TEXT COMMANDS
   ============================================================ */
let savedRange = null;
function saveSelection() {
  const sel = window.getSelection();
  if (sel.rangeCount && editor.contains(sel.anchorNode)) savedRange = sel.getRangeAt(0).cloneRange();
}
function restoreSelection() {
  if (!savedRange) { editor.focus(); return; }
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(savedRange);
}
editor.addEventListener('keyup', saveSelection);
editor.addEventListener('mouseup', saveSelection);

function exec(cmd, val) {
  editor.focus();
  if (savedRange) restoreSelection();
  document.execCommand(cmd, false, val);
  afterCommand();
}
function afterCommand() {
  saveSelection();
  NF.captureContent(); scheduleSave(); NF.updateStats();
  refreshToolbarState();
  NF.buildOutline();
}
window._afterCommand = afterCommand;

// Toolbar command buttons
$$('.tb-btn[data-cmd], .bubble .tb-btn[data-cmd]').forEach(btn => {
  btn.addEventListener('mousedown', (e) => { e.preventDefault(); saveSelection(); });
  btn.addEventListener('click', () => exec(btn.dataset.cmd));
});
// Alignment
$$('.tb-btn[data-align]').forEach(btn => {
  btn.addEventListener('mousedown', (e) => { e.preventDefault(); saveSelection(); });
  btn.addEventListener('click', () => exec('justify' + btn.dataset.align));
});

// Font family / size / block format
$('#fontFamily').onchange = (e) => { restoreSelection(); exec('fontName', e.target.value); };
$('#fontSize').onchange = (e) => { restoreSelection(); exec('fontSize', e.target.value); };
$('#blockFormat').onchange = (e) => {
  const v = e.target.value;
  restoreSelection();
  if (v === 'pre') { exec('formatBlock', 'pre'); }
  else exec('formatBlock', v);
};

// Colors
function bindColor(inputId, barId, cmd) {
  const inp = $('#' + inputId);
  inp.addEventListener('mousedown', () => saveSelection());
  inp.addEventListener('input', () => {
    $('#' + barId).style.background = inp.value;
    restoreSelection();
    if (cmd === 'hilite') { document.execCommand('styleWithCSS', false, true); document.execCommand('hiliteColor', false, inp.value); }
    else exec('foreColor', inp.value);
    afterCommand();
  });
}
bindColor('foreColor', 'foreBar', 'fore');
bindColor('backColor', 'backBar', 'hilite');

// Special formatting buttons
$('#quoteBtn').onmousedown = (e) => { e.preventDefault(); saveSelection(); };
$('#quoteBtn').onclick = () => exec('formatBlock', 'blockquote');
$('#codeBtn').onmousedown = (e) => { e.preventDefault(); saveSelection(); };
$('#codeBtn').onclick = () => wrapInline('code');
$('#hrBtn').onclick = () => { exec('insertHorizontalRule'); };
$('#bubbleCode').onclick = () => wrapInline('code');
$('#bubbleHighlight').onclick = () => { restoreSelection(); document.execCommand('styleWithCSS', false, true); document.execCommand('hiliteColor', false, '#ffe066'); afterCommand(); };
$('#bubbleH1').onclick = () => exec('formatBlock', 'h1');
$('#bubbleLink').onclick = () => insertLink();

function wrapInline(tag) {
  restoreSelection();
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const text = sel.toString();
  if (!text) return;
  const node = el(tag, null, esc(text));
  const range = sel.getRangeAt(0);
  range.deleteContents(); range.insertNode(node);
  sel.removeAllRanges();
  afterCommand();
}

// Checklist
$('#checklistBtn').onmousedown = (e) => { e.preventDefault(); saveSelection(); };
$('#checklistBtn').onclick = () => {
  restoreSelection();
  document.execCommand('insertUnorderedList');
  // find the created list and mark it
  let node = window.getSelection().anchorNode;
  while (node && node !== editor) {
    if (node.nodeName === 'UL') { node.setAttribute('data-type', 'checklist'); break; }
    node = node.parentNode;
  }
  afterCommand();
  bindChecklist();
};

// Checklist toggling (click the checkbox pseudo area)
function bindChecklist() {
  $$('ul[data-type="checklist"] li', editor).forEach(li => {
    li.onclick = null;
  });
}
editor.addEventListener('click', (e) => {
  const li = e.target.closest('ul[data-type="checklist"] li');
  if (li && e.offsetX < 24) {
    li.classList.toggle('checked');
    NF.captureContent(); scheduleSave();
  }
  // image selection
  if (e.target.tagName === 'IMG') {
    $$('.selected-img', editor).forEach(i => i.classList.remove('selected-img'));
    e.target.classList.add('selected-img');
  } else {
    $$('.selected-img', editor).forEach(i => i.classList.remove('selected-img'));
  }
});
window._bindChecklist = bindChecklist;

// Delete selected image with Delete/Backspace handled naturally by contenteditable

/* ---------- Toolbar active state ---------- */
function refreshToolbarState() {
  [['bold', 'bold'], ['italic', 'italic'], ['underline', 'underline'], ['strikeThrough', 'strikeThrough']].forEach(([cmd]) => {
    try {
      $$(`.tb-btn[data-cmd="${cmd}"]`).forEach(b => b.classList.toggle('active', document.queryCommandState(cmd)));
    } catch (e) {}
  });
  ['Left', 'Center', 'Right', 'Full'].forEach(a => {
    try { $$(`.tb-btn[data-align="${a}"]`).forEach(b => b.classList.toggle('active', document.queryCommandState('justify' + a))); } catch (e) {}
  });
  try {
    $$('.tb-btn[data-cmd="insertUnorderedList"]').forEach(b => b.classList.toggle('active', document.queryCommandState('insertUnorderedList')));
    $$('.tb-btn[data-cmd="insertOrderedList"]').forEach(b => b.classList.toggle('active', document.queryCommandState('insertOrderedList')));
  } catch (e) {}
  // block format select
  try {
    let block = document.queryCommandValue('formatBlock').toLowerCase();
    const sel = $('#blockFormat');
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'blockquote'].includes(block)) sel.value = block === 'blockquote' ? 'p' : block;
    else sel.value = 'p';
  } catch (e) {}
}
editor.addEventListener('keyup', refreshToolbarState);
editor.addEventListener('mouseup', refreshToolbarState);

/* ============================================================
   Floating bubble toolbar
   ============================================================ */
const bubble = $('#bubble');
function updateBubble() {
  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed || !editor.contains(sel.anchorNode)) { bubble.classList.remove('show'); return; }
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  if (!rect.width && !rect.height) { bubble.classList.remove('show'); return; }
  bubble.classList.add('show');
  const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
  let left = rect.left + rect.width / 2 - bw / 2 + window.scrollX;
  let top = rect.top - bh - 10 + window.scrollY;
  left = Math.max(10, Math.min(left, window.innerWidth - bw - 10));
  if (top < 10) top = rect.bottom + 10 + window.scrollY;
  bubble.style.left = left + 'px'; bubble.style.top = top + 'px';
}
document.addEventListener('selectionchange', () => {
  clearTimeout(window._bubbleT);
  window._bubbleT = setTimeout(updateBubble, 80);
});
bubble.querySelectorAll('.tb-btn').forEach(b => b.addEventListener('mousedown', e => { e.preventDefault(); saveSelection(); }));

/* ============================================================
   6. INSERT FEATURES
   ============================================================ */
function insertHTMLAtCursor(html) {
  editor.focus();
  if (savedRange) restoreSelection();
  document.execCommand('insertHTML', false, html);
  afterCommand();
}
window._insertHTML = insertHTMLAtCursor;

// Link
function insertLink() {
  saveSelection();
  const selText = window.getSelection().toString();
  openModal('Insert Link',
    `<label class="field-label">Text</label><input class="field-input" id="lkText" value="${esc(selText)}" placeholder="Link text">
     <label class="field-label">URL</label><input class="field-input" id="lkUrl" placeholder="https://…">`,
    [{ label: 'Cancel', action: closeModal }, { label: 'Insert', primary: true, action: () => {
      let url = $('#lkUrl').value.trim(); const txt = $('#lkText').value.trim() || url;
      if (!url) return; if (!/^https?:|^mailto:|^#/.test(url)) url = 'https://' + url;
      restoreSelection();
      insertHTMLAtCursor(`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(txt)}</a>&nbsp;`);
      closeModal();
    } }]);
  setTimeout(() => $('#lkUrl').focus(), 50);
}
$('#insertLinkBtn').onmousedown = (e) => { e.preventDefault(); saveSelection(); };
$('#insertLinkBtn').onclick = insertLink;

// Image via file picker + drag/drop
const imgInput = $('#imageFileInput');
$('#insertImageBtn').onmousedown = (e) => { e.preventDefault(); saveSelection(); };
$('#insertImageBtn').onclick = () => imgInput.click();
imgInput.onchange = () => { if (imgInput.files[0]) readImage(imgInput.files[0]); imgInput.value = ''; };
function readImage(file) {
  const r = new FileReader();
  r.onload = () => insertHTMLAtCursor(`<img src="${r.result}" alt="${esc(file.name)}">`);
  r.readAsDataURL(file);
}
// drag/drop images directly onto editor
editor.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
editor.addEventListener('drop', (e) => {
  const files = Array.from(e.dataTransfer.files || []);
  const imgs = files.filter(f => f.type.startsWith('image/'));
  if (imgs.length) { e.preventDefault(); e.stopPropagation(); saveSelection(); imgs.forEach(readImage); }
});
// paste images
editor.addEventListener('paste', (e) => {
  const items = Array.from(e.clipboardData?.items || []);
  const img = items.find(i => i.type.startsWith('image/'));
  if (img) { e.preventDefault(); readImage(img.getAsFile()); }
});

// Table
$('#insertTableBtn').onmousedown = (e) => { e.preventDefault(); saveSelection(); };
$('#insertTableBtn').onclick = () => {
  openModal('Insert Table',
    `<div style="display:flex;gap:14px">
       <div style="flex:1"><label class="field-label">Rows</label><input type="number" class="field-input" id="tblRows" value="3" min="1" max="30"></div>
       <div style="flex:1"><label class="field-label">Columns</label><input type="number" class="field-input" id="tblCols" value="3" min="1" max="12"></div>
     </div>
     <label class="setting-row" style="margin-top:12px"><span>Header row</span><input type="checkbox" id="tblHead" checked></label>`,
    [{ label: 'Cancel', action: closeModal }, { label: 'Insert', primary: true, action: () => {
      const rows = +$('#tblRows').value, cols = +$('#tblCols').value, head = $('#tblHead').checked;
      let html = '<table>';
      for (let r = 0; r < rows; r++) {
        html += '<tr>';
        for (let c = 0; c < cols; c++) {
          const tag = (head && r === 0) ? 'th' : 'td';
          html += `<${tag}>&nbsp;</${tag}>`;
        }
        html += '</tr>';
      }
      html += '</table><p><br></p>';
      restoreSelection(); insertHTMLAtCursor(html); closeModal();
    } }]);
};

// Emoji & symbols
const EMOJIS = ['😀','😁','😂','🤣','😊','😍','😎','🤩','😳','🤔','😴','🙄','😭','😡','👍','👎','👏','🙌','🙏','💪','👀','🔥','✨','🎉','🎊','❤️','🧡','💛','💚','💙','💜','🖤','⭐','🌟','💡','📌','📍','📎','✅','❌','⚠️','❓','❗','💯','🚀','🎯','📈','📉','💰','🏆','🎁','☕','🍕','🌈','☀️','🌙','⚡','🔒','🔑','📝','📚','💻','📱','🖥️','⏰','📅','🗂️','📁','🔍','💬','📢','🎨','🎵','🍀','🌸'];
const SYMBOLS = ['©','®','™','°','±','×','÷','≠','≈','≤','≥','∞','√','π','∑','∆','µ','€','£','¥','¢','§','¶','•','·','–','—','…','«','»','“','”','‘','’','†','‡','→','←','↑','↓','↔','⇒','⇔','★','☆','♥','♦','♣','♠','✓','✔','✗','✘','☑','☐','№','℅','⌘','⌥','⇧','⏎','↩'];
$('#emojiBtn').onmousedown = (e) => { e.preventDefault(); saveSelection(); };
$('#emojiBtn').onclick = () => {
  openModal('Emoji & Symbols',
    `<div class="pick-tabs"><button class="active" data-p="emoji">😀 Emoji</button><button data-p="symbol">Ω Symbols</button></div>
     <div class="pick-grid" id="pickGrid"></div>`, [{ label: 'Close', action: closeModal }]);
  const grid = $('#pickGrid');
  const fill = (arr) => { grid.innerHTML = ''; arr.forEach(ch => { const b = el('button', null, ch); b.onclick = () => { restoreSelection(); insertHTMLAtCursor(ch); }; grid.appendChild(b); }); };
  fill(EMOJIS);
  $$('.pick-tabs button').forEach(b => b.onclick = () => {
    $$('.pick-tabs button').forEach(x => x.classList.remove('active')); b.classList.add('active');
    fill(b.dataset.p === 'emoji' ? EMOJIS : SYMBOLS);
  });
};

// Date/time
$('#dateBtn').onmousedown = (e) => { e.preventDefault(); saveSelection(); };
$('#dateBtn').onclick = (e) => {
  const d = new Date();
  const opts = [
    ['fa-calendar', d.toLocaleDateString()],
    ['fa-clock', d.toLocaleTimeString()],
    ['fa-calendar-day', d.toLocaleString()],
    ['fa-calendar-week', d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })],
    ['fa-globe', d.toISOString()],
  ];
  openCtx(e.clientX, e.clientY, opts.map(([ic, txt]) => ({ icon: ic, label: txt, action: () => { restoreSelection(); insertHTMLAtCursor(esc(txt) + '&nbsp;'); } })));
};

/* ============================================================
   7. IMPORT / EXPORT
   ============================================================ */
function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = el('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

// HTML -> Markdown (lightweight)
function htmlToMarkdown(html) {
  const root = el('div', null, html);
  const walk = (node) => {
    let out = '';
    node.childNodes.forEach(ch => {
      if (ch.nodeType === 3) { out += ch.textContent; return; }
      if (ch.nodeType !== 1) return;
      const t = ch.tagName.toLowerCase();
      const inner = walk(ch);
      switch (t) {
        case 'h1': out += '\n# ' + inner + '\n'; break;
        case 'h2': out += '\n## ' + inner + '\n'; break;
        case 'h3': out += '\n### ' + inner + '\n'; break;
        case 'h4': out += '\n#### ' + inner + '\n'; break;
        case 'h5': out += '\n##### ' + inner + '\n'; break;
        case 'h6': out += '\n###### ' + inner + '\n'; break;
        case 'b': case 'strong': out += '**' + inner + '**'; break;
        case 'i': case 'em': out += '*' + inner + '*'; break;
        case 'u': out += '<u>' + inner + '</u>'; break;
        case 'strike': case 's': case 'del': out += '~~' + inner + '~~'; break;
        case 'a': out += '[' + inner + '](' + (ch.getAttribute('href') || '') + ')'; break;
        case 'img': out += '![' + (ch.getAttribute('alt') || '') + '](' + ch.getAttribute('src') + ')'; break;
        case 'code': out += ch.closest('pre') ? inner : '`' + inner + '`'; break;
        case 'pre': out += '\n```\n' + ch.textContent + '\n```\n'; break;
        case 'blockquote': out += '\n> ' + inner.trim().replace(/\n/g, '\n> ') + '\n'; break;
        case 'hr': out += '\n---\n'; break;
        case 'br': out += '\n'; break;
        case 'ul': out += '\n' + Array.from(ch.children).map(li => (ch.dataset.type === 'checklist' ? (li.classList.contains('checked') ? '- [x] ' : '- [ ] ') : '- ') + walk(li)).join('\n') + '\n'; break;
        case 'ol': out += '\n' + Array.from(ch.children).map((li, i) => (i + 1) + '. ' + walk(li)).join('\n') + '\n'; break;
        case 'li': out += inner; break;
        case 'p': case 'div': out += '\n' + inner + '\n'; break;
        default: out += inner;
      }
    });
    return out;
  };
  return walk(root).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// Markdown -> HTML (lightweight)
function markdownToHtml(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  let html = '', inList = false, listTag = '', inCode = false, code = '';
  const inline = (s) => esc(s)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<i>$1</i>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  const closeList = () => { if (inList) { html += `</${listTag}>`; inList = false; } };
  lines.forEach(line => {
    if (/^```/.test(line)) {
      if (inCode) { html += '<pre><code>' + esc(code) + '</code></pre>'; code = ''; inCode = false; }
      else { closeList(); inCode = true; }
      return;
    }
    if (inCode) { code += line + '\n'; return; }
    let m;
    if (m = line.match(/^(#{1,6})\s+(.*)/)) { closeList(); html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; return; }
    if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)) {
      const checked = /\[[xX]\]/.test(line); const txt = line.replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, '');
      if (!inList || listTag !== 'ul-check') { closeList(); html += '<ul data-type="checklist">'; inList = true; listTag = 'ul-check'; }
      html += `<li class="${checked ? 'checked' : ''}">${inline(txt)}</li>`; return;
    }
    if (m = line.match(/^\s*[-*+]\s+(.*)/)) { if (!inList || listTag !== 'ul') { closeList(); html += '<ul>'; inList = true; listTag = 'ul'; } html += `<li>${inline(m[1])}</li>`; return; }
    if (m = line.match(/^\s*\d+\.\s+(.*)/)) { if (!inList || listTag !== 'ol') { closeList(); html += '<ol>'; inList = true; listTag = 'ol'; } html += `<li>${inline(m[1])}</li>`; return; }
    if (/^\s*>\s?/.test(line)) { closeList(); html += `<blockquote>${inline(line.replace(/^\s*>\s?/, ''))}</blockquote>`; return; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { closeList(); html += '<hr>'; return; }
    if (line.trim() === '') { closeList(); return; }
    closeList(); html += `<p>${inline(line)}</p>`;
  });
  if (inList) html += `</${listTag}>`;
  if (inCode && code) html += '<pre><code>' + esc(code) + '</code></pre>';
  return html;
}
window._md = { htmlToMarkdown, markdownToHtml };

function exportNote(fmt) {
  const n = NF.currentNote(); if (!n) { toast('No note open', 'error'); return; }
  NF.captureContent();
  const safe = (n.title || 'note').replace(/[^\w\-]+/g, '_');
  if (fmt === 'json') download(safe + '.json', JSON.stringify(n, null, 2), 'application/json');
  else if (fmt === 'txt') download(safe + '.txt', stripHtml(n.content), 'text/plain');
  else if (fmt === 'md') download(safe + '.md', `# ${n.title}\n\n` + htmlToMarkdown(n.content), 'text/markdown');
  else if (fmt === 'html') {
    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(n.title)}</title>
<style>body{font-family:Inter,system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;line-height:1.7;color:#1a1f2e}
blockquote{border-left:4px solid #4f7cff;padding-left:16px;color:#555;font-style:italic}
pre{background:#1e293b;color:#e2e8f0;padding:16px;border-radius:8px;overflow:auto}
code{background:#eee;padding:2px 5px;border-radius:4px}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px 10px}
ul[data-type=checklist]{list-style:none;padding-left:0}</style></head>
<body><h1>${esc(n.title)}</h1>${n.content}</body></html>`;
    download(safe + '.html', doc, 'text/html');
  }
  toast('Exported ' + fmt.toUpperCase(), 'success');
}

function backupAll() {
  const data = { app: 'NoteForge', version: 1, exported: Date.now(), notes: state.notes, folders: state.folders };
  download('noteforge_backup_' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(data, null, 2), 'application/json');
  toast('Backup exported', 'success');
}

// Import files (json/txt/html/md)
function importFiles(files) {
  Array.from(files).forEach(file => {
    const r = new FileReader();
    r.onload = () => {
      const name = file.name; const content = r.result;
      const ext = name.split('.').pop().toLowerCase();
      try {
        if (ext === 'json') {
          const data = JSON.parse(content);
          if (data.notes && typeof data.notes === 'object') { // backup file
            let cnt = 0;
            Object.assign(state.folders, data.folders || {});
            Object.values(data.notes).forEach(n => { state.notes[n.id] = n; cnt++; });
            persist(); NF.renderAll(); toast(`Imported ${cnt} notes from backup`, 'success');
          } else if (data.id && data.content != null) { // single note
            data.id = NF.uid(); state.notes[data.id] = data; persist(); NF.renderAll(); NF.openNote(data.id); toast('Note imported', 'success');
          } else throw new Error('Unknown JSON');
        } else {
          const n = makeNote(name.replace(/\.[^.]+$/, ''));
          if (ext === 'md' || ext === 'markdown') n.content = markdownToHtml(content);
          else if (ext === 'html') n.content = content.replace(/^[\s\S]*<body[^>]*>/i, '').replace(/<\/body>[\s\S]*$/i, '') || content;
          else n.content = '<p>' + esc(content).replace(/\n/g, '</p><p>') + '</p>';
          persist(); NF.renderAll(); NF.openNote(n.id); toast('Imported ' + name, 'success');
        }
      } catch (e) { console.error(e); toast('Failed to import ' + name, 'error'); }
    };
    r.readAsText(file);
  });
}
function makeNote(title) {
  const t = Date.now();
  const n = { id: NF.uid(), title: title || 'Imported', content: '', folder: null, pinned: false, archived: false, trashed: false, tags: [], color: '', created: t, updated: t, versions: [] };
  state.notes[n.id] = n; return n;
}

const importInput = $('#importFileInput');
importInput.onchange = () => { if (importInput.files.length) importFiles(importInput.files); importInput.value = ''; };

// Export/Import menu
$('#exportBtn').onclick = (e) => {
  openCtx(e.clientX, e.clientY, [
    { icon: 'fa-file-code', label: 'Export as HTML', action: () => exportNote('html') },
    { icon: 'fa-file-arrow-down', label: 'Export as Markdown', action: () => exportNote('md') },
    { icon: 'fa-file-lines', label: 'Export as TXT', action: () => exportNote('txt') },
    { icon: 'fa-file-code', label: 'Export as JSON', action: () => exportNote('json') },
    { icon: 'fa-print', label: 'Print / PDF', action: () => window.print() },
    { sep: true },
    { icon: 'fa-database', label: 'Backup all notes', action: backupAll },
    { icon: 'fa-file-import', label: 'Import file(s)…', action: () => importInput.click() },
  ]);
};
/* ---------- Global drag & drop importing ---------- */
const dropOverlay = $('#dropOverlay');
let dragCounter = 0;
window.addEventListener('dragenter', (e) => {
  if (e.dataTransfer.types.includes('Files')) { dragCounter++; dropOverlay.classList.add('show'); }
});
window.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
window.addEventListener('dragleave', () => { dragCounter = Math.max(0, dragCounter - 1); if (!dragCounter) dropOverlay.classList.remove('show'); });
window.addEventListener('drop', (e) => {
  if (!e.dataTransfer.files.length) return;
  // if dropped on editor and it's an image, the editor handler already ran
  if (editor.contains(e.target) && Array.from(e.dataTransfer.files).some(f => f.type.startsWith('image/'))) { dragCounter = 0; dropOverlay.classList.remove('show'); return; }
  e.preventDefault();
  dragCounter = 0; dropOverlay.classList.remove('show');
  const files = Array.from(e.dataTransfer.files).filter(f => !f.type.startsWith('image/'));
  if (files.length) importFiles(files);
});

$('#backupBtn').onclick = backupAll;
$('#restoreBtn').onclick = () => importInput.click();
$('#printBtn').onclick = () => window.print();

/* ============================================================
   8. PANELS
   ============================================================ */
function openPanel(id) { closeAllPanels(); $('#' + id).classList.add('open'); }
function closeAllPanels() { $$('.side-panel').forEach(p => p.classList.remove('open')); }
$$('.panel-close').forEach(b => b.onclick = closeAllPanels);

// --- Outline ---
function buildOutline() {
  const body = $('#outlineBody'); if (!body) return;
  const heads = $$('h1,h2,h3,h4,h5,h6', editor);
  if (!heads.length) { body.innerHTML = '<div class="empty-hint">No headings yet.<br>Use Heading styles to build an outline.</div>'; return; }
  body.innerHTML = '';
  heads.forEach((h, i) => {
    h.id = h.id || 'h_' + i;
    const item = el('div', 'outline-item outline-' + h.tagName.toLowerCase(), esc(h.textContent || 'Untitled heading'));
    item.onclick = () => { h.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    body.appendChild(item);
  });
}
window._buildOutline = buildOutline;
$('#outlineBtn').onclick = () => { buildOutline(); openPanel('outlinePanel'); };

// --- Find & Replace ---
let findMatches = [], findIdx = -1;
function clearFindHighlights() {
  $$('mark.find-hl', editor).forEach(m => { const t = document.createTextNode(m.textContent); m.replaceWith(t); });
  editor.normalize();
}
function doFind() {
  clearFindHighlights();
  const q = $('#findInput').value; findMatches = []; findIdx = -1;
  if (!q) { $('#findCount').textContent = 'No matches'; return; }
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
  const textNodes = []; let node;
  while (node = walker.nextNode()) textNodes.push(node);
  const lq = q.toLowerCase();
  textNodes.forEach(tn => {
    const text = tn.textContent; const lower = text.toLowerCase();
    let idx = lower.indexOf(lq), last = 0, frag = null;
    if (idx === -1) return;
    frag = document.createDocumentFragment();
    while (idx !== -1) {
      if (idx > last) frag.appendChild(document.createTextNode(text.slice(last, idx)));
      const m = el('mark', 'find-hl', esc(text.substr(idx, q.length)));
      frag.appendChild(m); findMatches.push(m);
      last = idx + q.length; idx = lower.indexOf(lq, last);
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    tn.replaceWith(frag);
  });
  if (findMatches.length) { findIdx = 0; markCurrent(); }
  $('#findCount').textContent = findMatches.length ? `${findIdx + 1} of ${findMatches.length}` : 'No matches';
}
function markCurrent() {
  findMatches.forEach(m => m.classList.remove('current'));
  const m = findMatches[findIdx];
  if (m) { m.classList.add('current'); m.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  $('#findCount').textContent = `${findIdx + 1} of ${findMatches.length}`;
}
$('#findInput').oninput = () => { clearTimeout(window._findT); window._findT = setTimeout(doFind, 200); };
$('#findNext').onclick = () => { if (findMatches.length) { findIdx = (findIdx + 1) % findMatches.length; markCurrent(); } };
$('#findPrev').onclick = () => { if (findMatches.length) { findIdx = (findIdx - 1 + findMatches.length) % findMatches.length; markCurrent(); } };
$('#replaceOne').onclick = () => {
  const m = findMatches[findIdx]; if (!m) return;
  const t = document.createTextNode($('#replaceInput').value); m.replaceWith(t);
  NF.captureContent(); scheduleSave(); doFind();
};
$('#replaceAll').onclick = () => {
  if (!findMatches.length) return; const rep = $('#replaceInput').value; const cnt = findMatches.length;
  findMatches.forEach(m => m.replaceWith(document.createTextNode(rep)));
  editor.normalize(); NF.captureContent(); scheduleSave(); doFind();
  toast(`Replaced ${cnt} occurrence(s)`, 'success');
};
$('#findBtn').onclick = () => { openPanel('findPanel'); setTimeout(() => { $('#findInput').focus(); $('#findInput').select(); doFind(); }, 100); };

// --- Version history ---
function renderVersions() {
  const body = $('#versionsBody'); const n = NF.currentNote();
  if (!n || !n.versions || !n.versions.length) { body.innerHTML = '<div class="empty-hint">No versions saved yet.<br>Versions are captured automatically as you edit.</div>'; return; }
  body.innerHTML = '';
  const cur = el('div', 'version-item', `<div class="v-time">Current version</div><div class="v-meta">Now · ${(n.title || 'Untitled')}</div>`);
  cur.style.borderColor = 'var(--accent)'; body.appendChild(cur);
  [...n.versions].reverse().forEach(v => {
    const item = el('div', 'version-item', `<div class="v-time">${NF.relTime(v.ts)}</div><div class="v-meta">${NF.fmtTime(v.ts)} · ${esc(v.title || 'Untitled')}</div>`);
    item.onclick = () => confirmModal('Restore this version?', 'Your current content will be replaced (a new version snapshot is saved first).', () => {
      n.versions.push({ ts: Date.now(), title: n.title, content: n.content });
      n.content = v.content; n.title = v.title; n.updated = Date.now();
      editor.innerHTML = n.content; $('#docTitle').value = n.title;
      persist(); NF.updateStats(); buildOutline(); renderVersions(); toast('Version restored', 'success');
    });
    body.appendChild(item);
  });
}
$('#versionsBtn').onclick = () => { NF.captureContent(); renderVersions(); openPanel('versionsPanel'); };

// --- Settings & theme ---
const ACCENTS = ['#4f7cff', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#64748b'];
function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.settings.theme);
  document.documentElement.style.setProperty('--accent', state.settings.accent);
  const rgb = hexToRgb(state.settings.accent);
  document.documentElement.style.setProperty('--accent-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
  $('#themeBtn').innerHTML = `<i class="fa-solid fa-${state.settings.theme === 'dark' ? 'sun' : 'moon'}"></i>`;
  $$('#themeGroup button').forEach(b => b.classList.toggle('active', b.dataset.theme === state.settings.theme));
}
function hexToRgb(hex) { const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 79, g: 124, b: 255 }; }
function buildAccents() {
  const c = $('#accentSwatches'); c.innerHTML = '';
  ACCENTS.forEach(a => { const s = el('span', 'swatch' + (a === state.settings.accent ? ' active' : '')); s.style.background = a; s.onclick = () => { state.settings.accent = a; persist(); applyTheme(); buildAccents(); }; c.appendChild(s); });
}
$('#themeBtn').onclick = () => { state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark'; persist(); applyTheme(); };
$$('#themeGroup button').forEach(b => b.onclick = () => { state.settings.theme = b.dataset.theme; persist(); applyTheme(); });
$('#settingsBtn').onclick = () => { buildAccents(); openPanel('settingsPanel'); };
$('#setFullWidth').onchange = (e) => { state.settings.fullWidth = e.target.checked; persist(); applyEditorPrefs(); };
$('#setSpellcheck').onchange = (e) => { state.settings.spellcheck = e.target.checked; editor.spellcheck = e.target.checked; persist(); };
$('#setAutosave').onchange = (e) => { state.settings.autosave = e.target.checked; persist(); };

function bindSidebarCheckbox(id, settingKey) {
  const el = $('#' + id);
  if (el) {
    el.onchange = (e) => {
      state.settings[settingKey] = e.target.checked;
      persist();
      NF.renderAll();
    };
  }
}
bindSidebarCheckbox('setShowAll', 'showAll');
bindSidebarCheckbox('setShowRecent', 'showRecent');
bindSidebarCheckbox('setShowPinned', 'showPinned');
bindSidebarCheckbox('setShowTags', 'showTags');
bindSidebarCheckbox('setShowArchive', 'showArchive');
bindSidebarCheckbox('setShowTrash', 'showTrash');
bindSidebarCheckbox('setShowFolders', 'showFolders');

function applySettingsCheckboxes() {
  if ($('#setShowAll')) $('#setShowAll').checked = state.settings.showAll !== false;
  if ($('#setShowRecent')) $('#setShowRecent').checked = state.settings.showRecent !== false;
  if ($('#setShowPinned')) $('#setShowPinned').checked = state.settings.showPinned !== false;
  if ($('#setShowTags')) $('#setShowTags').checked = state.settings.showTags !== false;
  if ($('#setShowArchive')) $('#setShowArchive').checked = state.settings.showArchive !== false;
  if ($('#setShowTrash')) $('#setShowTrash').checked = state.settings.showTrash !== false;
  if ($('#setShowFolders')) $('#setShowFolders').checked = state.settings.showFolders !== false;
}
window._applySettingsCheckboxes = applySettingsCheckboxes;

function applyEditorPrefs() {
  $('#editorArea').classList.toggle('full-width', state.settings.fullWidth);
  $('#setFullWidth').checked = state.settings.fullWidth;
  $('#setSpellcheck').checked = state.settings.spellcheck;
  $('#setAutosave').checked = state.settings.autosave;
  editor.spellcheck = state.settings.spellcheck;
  applySettingsCheckboxes();
}

/* ============================================================
   9. BONUS: preview, zoom, focus, width, sidebar, shortcuts
   ============================================================ */
// Markdown/split preview
let previewMode = 0; // 0 off, 1 split, 2 preview only
function updatePreview() {
  if (!previewMode) return;
  const n = NF.currentNote(); if (!n) return;
  $('#mdPreview').innerHTML = editor.innerHTML;
}
window._updatePreview = updatePreview;
$('#previewBtn').onclick = () => {
  previewMode = (previewMode + 1) % 3;
  const area = $('#editorArea');
  area.classList.toggle('split', previewMode === 1);
  area.classList.toggle('preview-only', previewMode === 2);
  $('#previewBtn').classList.toggle('active', previewMode !== 0);
  if (previewMode) { updatePreview(); toast(previewMode === 1 ? 'Split view' : 'Preview only'); }
  else toast('Editor only');
};

// Zoom
function applyZoom() {
  const z = state.settings.zoom / 100;
  $('#page').style.transform = `scale(${z})`;
  $('#page').style.marginBottom = (z < 1 ? (1 - z) * -400 : 0) + 'px';
  $('#zoomVal').textContent = state.settings.zoom + '%';
}
$('#zoomIn').onclick = () => { state.settings.zoom = Math.min(200, state.settings.zoom + 10); persist(); applyZoom(); };
$('#zoomOut').onclick = () => { state.settings.zoom = Math.max(50, state.settings.zoom - 10); persist(); applyZoom(); };
$('#widthToggle').onclick = () => { state.settings.fullWidth = !state.settings.fullWidth; persist(); applyEditorPrefs(); };

// Focus mode
$('#focusBtn').onclick = () => {
  const app = $('#app'); app.classList.toggle('focus-mode');
  const on = app.classList.contains('focus-mode');
  $('#focusBtn').innerHTML = `<i class="fa-solid fa-${on ? 'compress' : 'expand'}"></i>`;
  if (on) toast('Focus mode — press F11 or Esc to exit');
};

// Toolbar collapse
$('#toolbarToggleBtn').onclick = () => {
  state.settings.toolbarCollapsed = !state.settings.toolbarCollapsed; persist(); applyToolbar();
};
function applyToolbar() {
  $('#toolbar').classList.toggle('collapsed', state.settings.toolbarCollapsed);
  $('#toolbarToggleBtn').innerHTML = `<i class="fa-solid fa-angles-${state.settings.toolbarCollapsed ? 'down' : 'up'}"></i>`;
}

// Sidebar toggle + resize
$('#toggleSidebarBtn').onclick = () => {
  if (window.innerWidth <= 900) $('#app').classList.toggle('sidebar-open');
  else $('#app').classList.toggle('sidebar-collapsed');
};
$('#backdrop').onclick = () => $('#app').classList.remove('sidebar-open');
(function resizer() {
  const r = $('#resizer'); let dragging = false;
  r.addEventListener('mousedown', () => { dragging = true; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const w = Math.max(220, Math.min(460, e.clientX));
    state.settings.sidebarWidth = w;
    document.documentElement.style.setProperty('--sidebar-w', w + 'px');
  });
  window.addEventListener('mouseup', () => { if (dragging) { dragging = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; persist(); } });
})();

// Cheat sheet
const SHORTCUTS = [
  ['Ctrl B', 'Bold'], ['Ctrl I', 'Italic'], ['Ctrl U', 'Underline'],
  ['Ctrl Shift S', 'Strikethrough'], ['Ctrl K', 'Insert link'], ['Ctrl Z', 'Undo'],
  ['Ctrl Y', 'Redo'], ['Ctrl S', 'Save now'], ['Ctrl F', 'Find & replace'],
  ['Ctrl N', 'New note'], ['Ctrl \\', 'Toggle sidebar'], ['Ctrl P', 'Print / PDF'],
  ['Ctrl 1-6', 'Heading 1-6'], ['Ctrl 0', 'Normal text'], ['Ctrl Shift 7', 'Numbered list'],
  ['Ctrl Shift 8', 'Bullet list'], ['F11', 'Focus mode'], ['Esc', 'Close panel / focus'],
];
$('#cheatBtn').onclick = () => {
  const rows = SHORTCUTS.map(([k, d]) => `<div class="shortcut-row"><span>${d}</span><span>${k.split(' ').map(x => `<kbd>${x}</kbd>`).join(' ')}</span></div>`).join('');
  openModal('Keyboard Shortcuts', `<div class="shortcut-grid">${rows}</div>`, [{ label: 'Close', primary: true, action: closeModal }], true);
};

/* ============================================================
   KEYBOARD SHORTCUTS
   ============================================================ */
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === 'Escape') {
    if ($('.overlay.open')) closeModal();
    else if ($('.side-panel.open')) closeAllPanels();
    else if ($('#app').classList.contains('focus-mode')) $('#focusBtn').click();
    return;
  }
  if (e.key === 'F11') { e.preventDefault(); $('#focusBtn').click(); return; }

  // Handle Delete/Backspace for selected note/folder when not inside form fields/editor
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const focused = document.activeElement;
    const inInput = focused && (
      focused.tagName === 'INPUT' ||
      focused.tagName === 'TEXTAREA' ||
      focused.tagName === 'SELECT' ||
      focused.closest('[contenteditable="true"]')
    );
    if (!inInput) {
      if (state.ui.activeNote) {
        e.preventDefault();
        const n = state.notes[state.ui.activeNote];
        if (n) {
          if (n.trashed) {
            confirmModal('Delete forever?', 'This cannot be undone.', () => {
              delete state.notes[n.id];
              closeTab(n.id);
              persist();
              NF.renderAll();
            });
          } else {
            n.trashed = true;
            persist();
            NF.renderAll();
            toast('Moved to trash');
          }
        }
      } else if (state.ui.activeFolder) {
        e.preventDefault();
        const f = state.folders[state.ui.activeFolder];
        if (f) {
          confirmModal(`Delete folder “${f.name}”?`, 'Notes inside will move to All Notes. Subfolders are removed.', () => {
            Object.values(state.notes).forEach(n => { if (n.folder === f.id) n.folder = null; });
            Object.values(state.folders).forEach(x => { if (x.parent === f.id) x.parent = null; });
            delete state.folders[f.id];
            if (state.ui.activeFolder === f.id) { state.ui.activeFolder = null; state.ui.view = 'all'; }
            persist();
            NF.renderAll();
            toast('Folder deleted');
          });
        }
      }
      return;
    }
  }

  if (!mod) return;
  const k = e.key.toLowerCase();
  if (k === 's') { e.preventDefault(); NF.captureContent(); persist(true); toast('Saved', 'success'); }
  else if (k === 'n') { e.preventDefault(); window._core.createNote(); }
  else if (k === 'f') { e.preventDefault(); $('#findBtn').click(); }
  else if (k === 'k') { e.preventDefault(); insertLink(); }
  else if (k === 'p') { e.preventDefault(); window.print(); }
  else if (k === '\\') { e.preventDefault(); $('#toggleSidebarBtn').click(); }
  else if (k === 'b' || k === 'i' || k === 'u') { /* native execCommand handles; refresh state */ setTimeout(afterCommand, 0); }
  else if (e.shiftKey && k === 's') { e.preventDefault(); exec('strikeThrough'); }
  else if (e.shiftKey && k === '7') { e.preventDefault(); exec('insertOrderedList'); }
  else if (e.shiftKey && k === '8') { e.preventDefault(); exec('insertUnorderedList'); }
  else if (k >= '0' && k <= '6' && !e.shiftKey) {
    e.preventDefault();
    exec('formatBlock', k === '0' ? 'p' : 'h' + k);
    $('#blockFormat').value = k === '0' ? 'p' : 'h' + k;
  }
});

/* ============================================================
   10. INIT
   ============================================================ */
function init() {
  applyTheme();
  buildAccents();
  applyEditorPrefs();
  applyToolbar();
  applyZoom();
  document.documentElement.style.setProperty('--sidebar-w', (state.settings.sidebarWidth || 280) + 'px');
  NF.renderAll();
  // open last active note or first
  const active = state.ui.activeNote && state.notes[state.ui.activeNote] ? state.ui.activeNote
    : Object.keys(state.notes)[0];
  if (active) NF.openNote(active);
  else window._core.createNote();
  toast('Welcome back to NoteForge');
}
init();

})();
