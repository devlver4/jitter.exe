// The editor in ?icon= mode must become a small square canvas whose save
// writes the folder's icon instead of creating a drawing, then returns to the
// gallery.
const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1400, height: 900, show: false,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false } });
  const errs = [];
  win.webContents.on('console-message', (_e, l, m) => { if (l >= 3) errs.push(m); });
  const results = [];
  const t = (n, ok, d) => results.push([n, !!ok, d]);

  await win.loadFile(path.join(__dirname, '..', 'index.html'));
  await win.webContents.executeJavaScript(`
    localStorage.setItem('jitter_meta','[]');
    localStorage.setItem('jitter_folders', JSON.stringify([
      {id:'f_test',name:'Concepts',parent:null,icon:null}
    ]));true;`);
  const base = win.webContents.getURL().replace(/index\.html.*$/, '');

  await win.loadURL(base + 'editor.html?icon=f_test');
  await new Promise(r => setTimeout(r, 800));

  for (const [n, ok, d] of await win.webContents.executeJavaScript(`(() => {
    const out=[]; const t=(n,ok,d)=>out.push([n,!!ok,d]);
    t('icon mode engaged', iconFolder==='f_test', String(iconFolder));
    t('canvas is a small square', W===64 && H===64, W+'x'+H);
    t('title shows the folder', document.getElementById('titleInput').value==='Icon: Concepts',
      document.getElementById('titleInput').value);
    t('title is locked', document.getElementById('titleInput').disabled);
    t('save button is relabelled', document.getElementById('btnSave').textContent==='Save icon',
      document.getElementById('btnSave').textContent);
    t('zoomed in for a small canvas', zoom>1, 'zoom='+zoom);
    setTool('pen'); live=null;
    startDraw({clientX:0,clientY:0,preventDefault(){}});
    live.pts=[{x:10,y:10},{x:50,y:50}];
    endDraw();
    t('drawing works in icon mode', strokes.length===1);
    return out;
  })()`)) t(n, ok, d);

  // Saving navigates back to the gallery, so wait for that rather than for an
  // in-page promise that the navigation would tear down.
  const landed = new Promise(res => win.webContents.once('did-finish-load', res));
  win.webContents.executeJavaScript(`document.getElementById('btnSave').click();true;`);
  await Promise.race([landed, new Promise(r => setTimeout(() => r('timeout'), 20000))]);
  await new Promise(r => setTimeout(r, 600));

  t('returned to the gallery', /index\.html/.test(win.webContents.getURL()), win.webContents.getURL().split('/').pop());
  for (const [n, ok, d] of await win.webContents.executeJavaScript(`(() => {
    const out=[]; const t=(n,ok,d)=>out.push([n,!!ok,d]);
    const list=JSON.parse(localStorage.getItem('jitter_folders'));
    t('folder icon was written', !!list[0].icon && list[0].icon.startsWith('data:image/gif'),
      String(list[0].icon).slice(0,22));
    t('no drawing was created', JSON.parse(localStorage.getItem('jitter_meta')).length===0);
    t('the gallery shows the icon on the card',
      !!document.querySelector('.card.folder .folder-peek'));
    return out;
  })()`)) t(n, ok, d);

  let fail = 0;
  for (const [n, ok, d] of results) { console.log((ok?'  ok   ':'  FAIL ')+n+(d?'  ['+d+']':'')); if(!ok) fail++; }
  const real = errs.filter(e => !/jszip|cdnjs|fonts\.googleapis|ERR_/i.test(e));
  console.log(`\n${results.length-fail} passed, ${fail} failed, ${real.length} console errors`);
  real.slice(0,3).forEach(e=>console.log('  ! '+e));
  app.exit(fail === 0 && real.length === 0 ? 0 : 1);
});
