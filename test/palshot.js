const { app, BrowserWindow } = require('electron');
const path = require('path'); const fs = require('fs');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 700, height: 820, show: false,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false } });
  await win.loadFile(path.join(__dirname, '..', 'editor.html'));
  await win.webContents.executeJavaScript(`
    localStorage.setItem('jitter_theme','${process.argv[2] || 'dark'}');
    localStorage.setItem('jitter_custom_colors', JSON.stringify(
      ['#7b3f00','#2e5266','#d94f4f','#6b8f71','#c9a227','#8e6c88','#3d3d3d']));true;`);
  await win.webContents.reload();
  await new Promise(r => setTimeout(r, 700));
  await win.webContents.executeJavaScript(`document.getElementById('custToggle').click();true;`);
  await new Promise(r => setTimeout(r, 300));
  fs.writeFileSync(path.join(__dirname, '..', 'shot-palette.png'),
    (await win.webContents.capturePage({ x: 0, y: 40, width: 210, height: 420 })).toPNG());
  console.log('shot-palette.png');
  app.exit(0);
});
