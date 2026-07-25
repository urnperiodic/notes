# NoteForge — Client-Side Document Editor

A polished, **100% client-side** note-taking & document editor built with plain
HTML, CSS and vanilla JavaScript. It combines the feel of Google Docs, Notion
and Microsoft Word while running entirely in the browser — no backend, no
accounts, no external services. All data lives in `localStorage`.

> Open `index.html` in any modern browser and start writing. Everything
> auto-saves as you type.

---

## ✨ Completed Features

### Notes & Organization
- Create, edit, **rename, duplicate, delete** notes
- **Folders & subfolders** with a collapsible, drag-drop tree
- **Pin** favorites, **Archive**, and **Trash** (with restore / delete-forever)
- **Tags** with a dedicated Tags view
- **Color labels** for notes and folders
- **Recent documents** view
- Instant **search** by title or content
- **Sort** by last edited, created date, or name (pinned always first)
- **Drag-and-drop reordering** of notes and drag-to-folder moving
- **Multiple tabs** for editing several notes at once
- Auto-save (~1.2 s debounce) with a live **Saved / Saving…** indicator
- **Session recovery** — content is flushed to storage on tab hide / close

### Rich Text Editor
Bold, italic, underline, strikethrough · text & highlight color · font family /
size · headings H1–H6 · normal paragraph · alignment (left/center/right/justify) ·
bullet, numbered & **checklists** · indent / outdent · block quotes · code blocks
& inline code · horizontal rules · undo / redo · clear formatting · **floating
selection bubble toolbar** · sticky, collapsible toolbar.

**Live statistics:** word count · character count · reading-time estimate ·
paragraph count.

### Insert
Tables (configurable rows/cols + header) · images (**file picker, drag-and-drop,
paste**) · hyperlinks · dividers · **emoji & symbol** picker · date/time in
several formats.

### Import / Export
- Export a note as **HTML, Markdown (.md), TXT, JSON**, or **Print → PDF**
- **Backup all** notes + folders to one JSON file
- **Import** backup JSON, single-note JSON, and TXT / HTML / **Markdown** files
- **Drag-and-drop file importing** anywhere on the window
- Lightweight HTML⇄Markdown converters preserve most formatting

### Editing Experience & Bonus
- **Full-screen focus mode** (F11 / Esc)
- **Zoom** 50 %–200 % · page-width ⇄ full-width toggle
- **Find & Replace** with match navigation and replace-all
- **Document outline** auto-generated from headings
- **Markdown / split preview** (editor · split · preview-only)
- **Version history** with automatic snapshots and one-click restore
- **Custom accent colors** + light / dark theme (saved)
- **Keyboard-shortcut cheat sheet**
- **Print-friendly** document view
- Offline-first — works with no network once loaded

### Interface
Glassmorphism panels · 16–20 px rounded corners · smooth transitions & hover
animations · **resizable sidebar** · Inter typography · Font Awesome icons ·
fully **responsive** (desktop / tablet / mobile with slide-in sidebar).

---

## 🗂 Functional Entry Points (paths & parameters)

This is a single-page app; navigation is in-app, not URL-based.

| Entry | How to reach it |
|-------|-----------------|
| `index.html` | The entire application |
| New note | Sidebar “New Note” button / `Ctrl+N` |
| Views | Sidebar: All Notes, Recent, Pinned, Tags, Archive, Trash |
| Note menu | Right-click a note or click its ⋮ (rename, duplicate, move, tags, color, archive, trash) |
| Toolbar | Formatting, inserts, undo/redo |
| Outline / Find / Preview / Versions / Focus / Print / Export / Cheat sheet / Theme / Settings | Top-bar icon buttons (right side) |

### Keyboard shortcuts
`Ctrl+B/I/U` format · `Ctrl+Shift+S` strikethrough · `Ctrl+K` link ·
`Ctrl+Z/Y` undo/redo · `Ctrl+S` save · `Ctrl+F` find · `Ctrl+N` new note ·
`Ctrl+\` toggle sidebar · `Ctrl+P` print · `Ctrl+1–6` headings · `Ctrl+0` normal ·
`Ctrl+Shift+7/8` numbered/bullet list · `F11` focus · `Esc` close.

---

## 💾 Data Model & Storage

All state is stored under a single `localStorage` key: **`noteforge_v1`**.

```jsonc
{
  "notes":   { "<id>": { id, title, content(HTML), folder, pinned, archived,
                          trashed, tags[], color, created, updated, versions[] } },
  "folders": { "<id>": { id, name, parent, collapsed, order, color } },
  "settings":{ theme, accent, fullWidth, spellcheck, autosave,
               sidebarWidth, zoom, toolbarCollapsed },
  "ui":      { openTabs[], activeNote, view, activeFolder, sort, recent[] }
}
```

Images are embedded as base64 data URLs inside note HTML. No server-side storage,
database, or API is used.

---

## 📁 Project Structure
```
index.html        Markup / app shell
css/style.css     Theme tokens, layout, glassmorphism, responsive & print styles
js/app.js         State model, persistence, sidebar/folders/notes/tabs, menus, modals
js/editor.js      Rich text commands, inserts, import/export, panels, bonus features, init
README.md         This file
```

---

## 🚫 Not Implemented / Out of Scope
- Real-time collaboration or cloud sync (would require a backend)
- Server-side PDF generation (uses the browser Print dialog → Save as PDF)
- Account system / authentication
- Cross-device sync (data is per-browser via LocalStorage)

## 🔭 Recommended Next Steps
- Optional **IndexedDB** backend to store large images outside the 5 MB LocalStorage cap
- Nested checklist / to-do progress roll-ups
- Table row/column context tools (add/remove/merge)
- Encrypted export & password-locked notes
- Optional export to `.docx`

---

## 🚀 Deployment
To publish the site, open the **Publish tab** and deploy with one click — it will
provide the live URL automatically.
