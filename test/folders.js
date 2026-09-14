// Exercises the folder tree in the gallery: nesting, navigation, moving by
// drag, previews, and the guarantee that deleting a folder keeps the artwork.
const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1400, height: 900, show: false,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false } });
  const errs = [];
  win.webContents.on('console-message', (_e, l, m) => { if (l >= 3) errs.push(m); });

  await win.loadFile(path.join(__dirname, '..', 'index.html'));
  // Seed a known library (browser storage path; no Electron API in this window).
  await win.webContents.executeJavaScript(`
    localStorage.setItem('jitter_folders','[]');
    localStorage.setItem('jitter_meta', JSON.stringify([
      {id:'d1',title:'One',  created:'2024-01-01',gif:'data:image/gif;base64,AAA'},
      {id:'d2',title:'Two',  created:'2024-01-02'},
      {id:'d3',title:'Three',created:'2024-01-03'}
    ]));true;`);
  await win.webContents.reload();
  await new Promise(r => setTimeout(r, 500));

  const R = await win.webContents.executeJavaScript(`(async () => {
    const out=[]; const t=(n,ok,d)=>out.push([n,!!ok,d]);
    const cards=()=>[...document.querySelectorAll('.card')];
    const folderCards=()=>[...document.querySelectorAll('.card.folder')];
    const crumbText=()=>[...document.querySelectorAll('.crumb')].map(c=>c.textContent).join(' / ');

    t('all drawings show at the top level', cards().length===3, 'n='+cards().length);
    t('breadcrumb starts at the root', crumbText()==='All drawings', crumbText());

    // ── create nested folders ──
    window.prompt=()=>'Sketches';
    await createFolder();
    t('folder created', folders.length===1 && folders[0].name==='Sketches');
    t('folder card is rendered', folderCards().length===1);
    t('folder persisted', JSON.parse(localStorage.getItem('jitter_folders')).length===1);
    const sketches=folders[0].id;

    openFolder(sketches);
    t('navigating shows an empty folder', cards().length===0);
    t('breadcrumb shows the path', crumbText()==='All drawings / Sketches', crumbText());
    t('new-drawing link carries the folder',
      document.getElementById('newDrawingBtn').getAttribute('href').includes(sketches));

    window.prompt=()=>'Old';
    await createFolder();
    const old=folders.find(f=>f.name==='Old').id;
    t('folder nests under the current one', byId(old).parent===sketches);

    openFolder(old);
    t('breadcrumb shows two levels', crumbText()==='All drawings / Sketches / Old', crumbText());

    // ── move a drawing by drag ──
    openFolder(null);
    const card=cards().find(c=>c.dataset.id==='d1');
    const dt={setData(){},getData(){return '';},effectAllowed:'',dropEffect:''};
    card.dispatchEvent(Object.assign(new Event('dragstart',{bubbles:true}),{dataTransfer:dt}));
    t('drag payload set', dragPayload && dragPayload.id==='d1', JSON.stringify(dragPayload));
    const target=folderCards()[0];
    target.dispatchEvent(Object.assign(new Event('dragover',{bubbles:true,cancelable:true}),{dataTransfer:dt}));
    t('folder highlights as a drop target', target.classList.contains('drop'));
    target.dispatchEvent(Object.assign(new Event('drop',{bubbles:true,cancelable:true}),{dataTransfer:dt}));
    await new Promise(r=>setTimeout(r,60));
    t('drawing moved into the folder',
      drawings.find(d=>d.id==='d1').folder===sketches, String(drawings.find(d=>d.id==='d1').folder));
    t('move persisted',
      JSON.parse(localStorage.getItem('jitter_meta')).find(d=>d.id==='d1').folder===sketches);
    t('it left the top level', cards().filter(c=>c.dataset.id==='d1').length===0);

    // ── counts roll up through nesting ──
    drawings.find(d=>d.id==='d2').folder=old;
    await store.setDrawings(drawings); render();
    t('parent count includes nested drawings', countIn(sketches)===2, 'n='+countIn(sketches));
    t('child count is just its own', countIn(old)===1, 'n='+countIn(old));

    // ── preview falls through to a nested drawing ──
    t('folder preview uses a drawing inside', peekIn(sketches)==='data:image/gif;base64,AAA', String(peekIn(sketches)));
    byId(sketches).icon='data:image/gif;base64,ZZZ';
    t('a drawn icon wins over the preview',
      (byId(sketches).icon||peekIn(sketches))==='data:image/gif;base64,ZZZ');
    byId(sketches).icon=null;

    // ── a folder cannot be dragged into its own subtree ──
    t('cycle guard sees the descendant', isAncestor(sketches, old));
    await moveFolder(sketches, old);
    t('folder refused to move inside itself', byId(sketches).parent===null, String(byId(sketches).parent));
    t('subtree intact', byId(old).parent===sketches);

    // ── deleting a folder must never delete artwork ──
    window.confirm=()=>true;
    const totalBefore=drawings.length;
    await deleteFolder(sketches);
    t('folder is gone', !byId(sketches));
    t('no drawing was deleted', drawings.length===totalBefore, 'n='+drawings.length);
    t('nested folder moved up to the root', byId(old).parent===null, String(byId(old).parent));
    t('its drawing moved up too', drawings.find(d=>d.id==='d1').folder===null,
      String(drawings.find(d=>d.id==='d1').folder));
    t('the nested folder kept its own drawing', drawings.find(d=>d.id==='d2').folder===old);
    return out;
  })()`);

  // A folder id that vanished must not strand drawings out of sight.
  await win.webContents.executeJavaScript(`
    localStorage.setItem('jitter_folders','[]');
    localStorage.setItem('jitter_meta', JSON.stringify([{id:'d9',title:'Orphan',folder:'f_gone'}]));true;`);
  await win.webContents.reload();
  await new Promise(r => setTimeout(r, 500));
  const orphan = await win.webContents.executeJavaScript(
    `[['a drawing in a missing folder is recovered to the root',
       drawings[0].folder===null && document.querySelectorAll('.card').length===1,
       'folder='+drawings[0].folder]]`);

  let fail = 0;
  for (const [n, ok, d] of R.concat(orphan)) { console.log((ok?'  ok   ':'  FAIL ')+n+(d?'  ['+d+']':'')); if(!ok) fail++; }
  const real = errs.filter(e => !/jszip|cdnjs|fonts\.googleapis|ERR_/i.test(e));
  console.log(`\n${R.length+orphan.length-fail} passed, ${fail} failed, ${real.length} console errors`);
  real.slice(0,3).forEach(e=>console.log('  ! '+e));
  app.exit(fail === 0 && real.length === 0 ? 0 : 1);
});
