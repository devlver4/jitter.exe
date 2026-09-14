// Exercises the custom colour shelf: persistence, promotion, removal.
const { app, BrowserWindow } = require('electron');
const path = require('path');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1400, height: 880, show: false,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false } });
  const errs = [];
  win.webContents.on('console-message', (_e, l, m) => { if (l >= 3) errs.push(m); });
  await win.loadFile(path.join(__dirname, '..', 'editor.html'));
  await win.webContents.executeJavaScript(`localStorage.removeItem('jitter_custom_colors');true;`);
  await win.webContents.reload();
  await new Promise(r => setTimeout(r, 600));

  const R = await win.webContents.executeJavaScript(`(() => {
    const out = [];
    const t = (n, ok, d) => out.push([n, !!ok, d]);
    const grid = () => document.getElementById('custSwatches');
    const swatches = () => [...grid().querySelectorAll('.cust-sw')].map(e => e.dataset.color);

    const panel = document.getElementById('custPanel');
    const toggle = document.getElementById('custToggle');
    t('shelf starts collapsed', !panel.classList.contains('open'));
    toggle.click();
    t('chevron expands it', panel.classList.contains('open'));
    t('aria reflects state', toggle.getAttribute('aria-expanded') === 'true');

    t('starts empty', swatches().length === 0);
    t('bin is present even when empty', !!document.getElementById('custTrash'));

    addCustomColor('#ff8800');
    addCustomColor('#3355aa');
    t('colours are stored newest first', swatches().join() === '#3355aa,#ff8800', swatches().join());
    t('bin sits at the end', grid().lastElementChild.id === 'custTrash');

    addCustomColor('#ff8800');
    t('re-picking promotes instead of duplicating', swatches().join() === '#ff8800,#3355aa', swatches().join());

    addCustomColor('NOT A COLOUR');
    t('junk is rejected', swatches().length === 2);

    // Persisted to localStorage, not just held in memory.
    const saved = JSON.parse(localStorage.getItem('jitter_custom_colors'));
    t('persisted to storage', saved.join() === '#ff8800,#3355aa', String(saved));

    // Clicking a swatch selects it as the pen colour.
    grid().querySelector('.cust-sw[data-color="#3355aa"]').click();
    t('clicking a swatch sets the pen colour', penColor === '#3355aa', penColor);
    t('and the picker follows', document.getElementById('customColor').value === '#3355aa');

    // Drag a swatch onto the bin.
    const data = new Map();
    const dt = { setData:(k,v)=>data.set(k,v), getData:k=>data.get(k), effectAllowed:'', dropEffect:'' };
    const sw = grid().querySelector('.cust-sw[data-color="#ff8800"]');
    sw.dispatchEvent(Object.assign(new Event('dragstart',{bubbles:true}),{dataTransfer:dt}));
    t('dragging marks the swatch', sw.classList.contains('dragging'));
    const bin = document.getElementById('custTrash');
    bin.dispatchEvent(Object.assign(new Event('dragover',{bubbles:true,cancelable:true}),{dataTransfer:dt}));
    t('bin highlights on hover', bin.classList.contains('over'));
    bin.dispatchEvent(Object.assign(new Event('drop',{bubbles:true,cancelable:true}),{dataTransfer:dt}));
    t('drop removes the colour', swatches().join() === '#3355aa', swatches().join());
    t('removal is persisted',
      JSON.parse(localStorage.getItem('jitter_custom_colors')).join() === '#3355aa');

    // Cap.
    for (let i = 0; i < 40; i++) addCustomColor('#' + i.toString(16).padStart(6,'0'));
    t('list is capped at 24', swatches().length === 24, 'len=' + swatches().length);
    return out;
  })()`);

  // Survives a reload.
  await win.webContents.reload();
  await new Promise(r => setTimeout(r, 600));
  const after = await win.webContents.executeJavaScript(
    `[['shelf survives a reload', customColors.length === 24, 'len=' + customColors.length],
      ['shelf is collapsed again on load', !document.getElementById('custPanel').classList.contains('open')]]`);

  let fail = 0;
  for (const [n, ok, d] of R.concat(after)) { console.log((ok?'  ok   ':'  FAIL ')+n+(d?'  ['+d+']':'')); if(!ok) fail++; }
  const real = errs.filter(e => !/jszip|cdnjs|fonts\.googleapis|ERR_/i.test(e));
  console.log(`\n${R.length+after.length-fail} passed, ${fail} failed, ${real.length} console errors`);
  if (real.length) console.log('  ! ' + real[0]);
  app.exit(fail === 0 && real.length === 0 ? 0 : 1);
});
