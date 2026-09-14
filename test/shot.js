const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const page = process.argv[2] || 'index.html';
const theme = process.argv[3] || 'dark';
const out = process.argv[4] || 'shot.png';

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1400, height: 880, show: false,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false } });
  const errs = [];
  win.webContents.on('console-message', (_e, l, m) => { if (l >= 3) errs.push(m); });
  await win.loadFile(path.join(__dirname, '..', page));
  await win.webContents.executeJavaScript(
    `try{localStorage.setItem('jitter_theme','${theme}');}catch(e){}
     document.documentElement.dataset.theme='${theme}';
     if(typeof applyTheme==='function')applyTheme('${theme}');true;`);
  await new Promise(r => setTimeout(r, 700));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, '..', out), img.toPNG());
  const real = errs.filter(e => !/jszip|cdnjs|fonts\.googleapis|ERR_(NAME|INTERNET|NETWORK|CONNECTION)/i.test(e));
  console.log(out + '  errors:' + real.length + (real.length ? '  ' + real[0] : ''));
  app.exit(0);
});
