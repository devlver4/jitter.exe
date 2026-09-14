// Verifies the theme toggle actually flips and persists, and that the editor
// picks the choice up.
const { app, BrowserWindow } = require('electron');
const path = require('path');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 800, show: false,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false } });
  // Electron persists localStorage between runs, so pin a known start state
  // instead of assuming a clean profile.
  await win.loadFile(path.join(__dirname, '..', 'index.html'));
  await win.webContents.executeJavaScript(`localStorage.setItem('jitter_theme','dark');true;`);
  await win.webContents.reload();
  await new Promise(r => setTimeout(r, 500));
  const r = await win.webContents.executeJavaScript(`(() => {
    const out = [];
    const theme = () => document.documentElement.dataset.theme;
    const btn = document.getElementById('themeBtn');
    out.push(['toggle exists', !!btn]);
    out.push(['starts dark', theme() === 'dark']);
    out.push(['icon offers light', btn.textContent === '\u2600']);
    btn.click();
    out.push(['click switches to light', theme() === 'light']);
    out.push(['icon now offers dark', btn.textContent === '\u263e']);
    out.push(['persisted', localStorage.getItem('jitter_theme') === 'light']);
    const bg = getComputedStyle(document.body).backgroundColor;
    out.push(['light bg is actually light', bg === 'rgb(251, 251, 250)', bg]);
    btn.click();
    out.push(['click switches back to dark', theme() === 'dark']);
    return out;
  })()`);
  // Editor must honour the stored choice on load.
  await win.webContents.executeJavaScript(`localStorage.setItem('jitter_theme','light');true;`);
  await win.loadFile(path.join(__dirname, '..', 'editor.html'));
  await new Promise(r2 => setTimeout(r2, 500));
  const e = await win.webContents.executeJavaScript(
    `[['editor honours the saved theme', document.documentElement.dataset.theme==='light'],
      ['editor panel is light', getComputedStyle(document.querySelector('.lpanel')).backgroundColor==='rgb(245, 245, 243)',
        getComputedStyle(document.querySelector('.lpanel')).backgroundColor]]`);
  let fail = 0;
  for (const [n, ok, d] of r.concat(e)) { console.log((ok?'  ok   ':'  FAIL ')+n+(d?'  ['+d+']':'')); if(!ok) fail++; }
  console.log(fail ? `\n${fail} failed` : '\nall theme checks passed');
  app.exit(fail ? 1 : 0);
});
