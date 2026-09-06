// Times the cost of drawing strokes into an editor build.
// Usage: npx electron test/bench.js <path-to-editor.html>
const { app, BrowserWindow } = require('electron');
const path = require('path');

const target = process.argv[2] || path.join(__dirname, '..', 'editor.html');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400, height: 860, show: false,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false },
  });
  const errs = [];
  win.webContents.on('console-message', (_e, l, m) => { if (l >= 3) errs.push(m); });

  await win.loadFile(path.resolve(target));
  await new Promise(r => setTimeout(r, 600));

  const out = await win.webContents.executeJavaScript(`(() => {
    const stroke = (pts) => {
      live = null;
      startDraw({ clientX: 0, clientY: 0, preventDefault(){} });
      live.pts = pts.slice();
      endDraw();
    };
    setTool('pen');
    const shape = i => {
      const y = 20 + (i % 40) * 8;
      return [{x: 10 + (i%30)*15, y}, {x: 30 + (i%30)*15, y: y+10}, {x: 55 + (i%30)*15, y: y+4}];
    };
    const band = (from, to) => {
      const t0 = performance.now();
      for (let i = from; i < to; i++) stroke(shape(i));
      return performance.now() - t0;
    };
    const first = band(0, 40);
    band(40, 200);
    const at200 = band(200, 240);
    band(240, 460);
    const at460 = band(460, 500);
    const t0 = performance.now(); rebuildAll(); const rebuild = performance.now() - t0;
    return { first, at200, at460, rebuild, n: strokes.length };
  })()`).catch(e => ({ error: String(e && e.message || e) }));

  if (out.error) { console.log('ERROR: ' + out.error); app.exit(1); return; }
  const f = n => n.toFixed(0).padStart(6) + ' ms';
  console.log('\n' + path.basename(path.dirname(target)) + '/' + path.basename(target) + '  (' + out.n + ' strokes)');
  console.log('  strokes   1- 40 :' + f(out.first));
  console.log('  strokes 201-240 :' + f(out.at200));
  console.log('  strokes 461-500 :' + f(out.at460));
  console.log('  one full rebuild:' + f(out.rebuild));
  if (errs.length) console.log('  console errors: ' + errs.length);
  app.exit(0);
});
