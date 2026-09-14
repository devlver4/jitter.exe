// Seeds a small library with folders and captures the gallery.
const { app, BrowserWindow } = require('electron');
const path = require('path'); const fs = require('fs');
const theme = process.argv[2] || 'dark';
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1400, height: 820, show: false,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false } });
  await win.loadFile(path.join(__dirname, '..', 'index.html'));
  // Real GIFs from the app's own encoder, so the preview path is exercised for
  // real rather than against a hand-made placeholder.
  const L = require(path.join(__dirname, '..', 'lib.js'));
  const dot = (r, g, b2) => {
    const w = 32, h = 24, d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const x = i % w, y = (i / w) | 0;
      const on = ((x >> 2) + (y >> 2)) % 2 === 0;
      d[i*4] = on ? r : 245; d[i*4+1] = on ? g : 245; d[i*4+2] = on ? b2 : 245; d[i*4+3] = 255;
    }
    return 'data:image/gif;base64,' +
      Buffer.from(L.encodeGIF([{ data: d, delay: 100 }], w, h, false)).toString('base64');
  };
  await win.webContents.executeJavaScript(`
    localStorage.setItem('jitter_theme','${theme}');
    localStorage.setItem('jitter_folders', JSON.stringify([
      {id:'f1',name:'Characters',parent:null,icon:null},
      {id:'f2',name:'Backgrounds',parent:null,icon:null},
      {id:'f3',name:'Rough sketches',parent:'f1',icon:null}
    ]));
    localStorage.setItem('jitter_meta', JSON.stringify([
      {id:'a',title:'Walk cycle',width:480,height:360,created:'2024-03-01',animMode:true,folder:null,gif:'${dot(20,20,20)}'},
      {id:'b',title:'Ink test',width:320,height:240,created:'2024-03-02',folder:null,gif:'${dot(200,60,60)}'},
      {id:'c',title:'Hero idle',width:64,height:64,created:'2024-03-03',folder:'f1',gif:'${dot(60,120,200)}'},
      {id:'d',title:'Forest',width:480,height:360,created:'2024-03-04',folder:'f2',transparentBg:true}
    ]));true;`);
  await win.webContents.reload();
  await new Promise(r => setTimeout(r, 800));
  fs.writeFileSync(path.join(__dirname, '..', 'shot-folders-' + theme + '.png'),
    (await win.webContents.capturePage()).toPNG());
  console.log('shot-folders-' + theme + '.png');
  app.exit(0);
});
