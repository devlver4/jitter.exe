const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs   = require('fs');

// Portable mode: save data next to the .exe so the user can see/backup it.
// Dev mode: use Electron's standard userData directory.
if (process.env.PORTABLE_EXECUTABLE_DIR) {
  app.setPath('userData', path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'JitterData'));
}

const DRAWINGS_DIR = path.join(app.getPath('userData'), 'drawings');
const META_FILE    = path.join(DRAWINGS_DIR, 'meta.json');
const FOLDERS_FILE = path.join(DRAWINGS_DIR, 'folders.json');
fs.mkdirSync(DRAWINGS_DIR, { recursive: true });

// ── helpers ──────────────────────────────────────────────
function readMeta() {
  try { return JSON.parse(fs.readFileSync(META_FILE, 'utf8')); } catch { return []; }
}
function writeMeta(list) {
  fs.writeFileSync(META_FILE, JSON.stringify(list));
}
function drawingPath(id) {
  return path.join(DRAWINGS_DIR, id + '.json');
}
// Folders are a flat list of { id, name, parent, icon }; nesting comes from
// `parent` pointing at another folder's id, or null for the top level.
function readFolders() {
  try { return JSON.parse(fs.readFileSync(FOLDERS_FILE, 'utf8')); } catch { return []; }
}
function writeFolders(list) {
  fs.writeFileSync(FOLDERS_FILE, JSON.stringify(list));
}

// ── IPC handlers ─────────────────────────────────────────
ipcMain.handle('list-drawings', () => readMeta());

ipcMain.handle('load-drawing', (_, id) => {
  try { return JSON.parse(fs.readFileSync(drawingPath(id), 'utf8')); } catch { return null; }
});

ipcMain.handle('save-drawing', (_, { meta, drawData }) => {
  const list = readMeta();
  const idx  = list.findIndex(m => m.id === meta.id);
  if (idx >= 0) list[idx] = meta; else list.push(meta);
  writeMeta(list);
  fs.writeFileSync(drawingPath(meta.id), JSON.stringify(drawData));
  return { ok: true };
});

ipcMain.handle('delete-drawing', (_, id) => {
  writeMeta(readMeta().filter(m => m.id !== id));
  try { fs.unlinkSync(drawingPath(id)); } catch {}
  return { ok: true };
});

// Moving a drawing between folders only touches the index, not the drawing
// file, so the gallery can rewrite meta on its own.
ipcMain.handle('save-meta', (_, list) => { writeMeta(list); return { ok: true }; });

ipcMain.handle('list-folders', () => readFolders());
ipcMain.handle('save-folders', (_, list) => { writeFolders(list); return { ok: true }; });

ipcMain.handle('open-drawings-folder', () => shell.openPath(DRAWINGS_DIR));

// ── window ───────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width:  1400,
    height: 860,
    minWidth:  1000,
    minHeight: 680,
    title: 'Jitter',
    backgroundColor: '#0c0c0c',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
