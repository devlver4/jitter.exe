// Loads the real editor in a hidden Electron window and exercises it.
// Run with: npx electron test/smoke.js
const { app, BrowserWindow } = require('electron');
const path = require('path');

const results = [];
const errors = [];

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400, height: 860, show: false,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false },
  });

  win.webContents.on('console-message', (_e, level, message) => {
    // level 3 = error
    if (level >= 3) errors.push(message);
  });
  win.webContents.on('render-process-gone', (_e, d) => errors.push('renderer gone: ' + JSON.stringify(d)));

  await win.loadFile(path.join(__dirname, '..', 'editor.html'));
  // Let init() settle.
  await new Promise(r => setTimeout(r, 600));

  const out = await win.webContents.executeJavaScript(`(async () => {
    const R = [];
    const t = (name, ok, detail) => R.push({ name, ok: !!ok, detail });
    const px = (cv, x, y) => {
      const d = cv.getContext('2d', {willReadFrequently:true}).getImageData(x, y, 1, 1).data;
      return d[0]+','+d[1]+','+d[2]+','+d[3];
    };
    // Draw a stroke by driving the same entry points the mouse does.
    const stroke = (pts, tool) => {
      setTool(tool || 'pen');
      live = null;
      startDraw({ clientX: 0, clientY: 0, preventDefault(){} });
      live.pts = pts.slice();
      endDraw();
    };
    // getXY reads the canvas rect, which is meaningless offscreen, so points
    // are injected directly after startDraw seeds the stroke.

    // ── boots at all ─────────────────────────────────────
    t('lib loaded', typeof JitterLib === 'object');
    t('buffers built', bufs.length === 3 && !!liveBuf);
    t('starts with empty history', history.length === 0 && future.length === 0);

    // ── strokes and history ──────────────────────────────
    stroke([{x:20,y:20},{x:80,y:60}]);
    t('stroke recorded', strokes.length === 1, 'len=' + strokes.length);
    t('stroke kept its points', !!strokes[0].pts && strokes[0].pts.length === 2);
    t('history has one entry', history.length === 1);

    undo();
    t('undo removes the stroke', strokes.length === 0);
    redo();
    t('redo restores it', strokes.length === 1);

    // ── the bug: background change used to be undone as a stroke ──
    const bgBefore = bgColor;
    pushAction(bgAction('#0d1b0f'));
    t('bg changed', bgColor === '#0d1b0f');
    undo();
    t('undo restores the bg', bgColor === bgBefore, bgColor);
    t('undoing the bg did NOT eat a stroke', strokes.length === 1, 'len=' + strokes.length);

    // ── border is undoable now ───────────────────────────
    pushAction(borderAction({x:10,y:10,w:100,h:80}));
    t('border set', !!borderRect);
    undo();
    t('border undone', borderRect === null);

    // ── clip must not kill the jitter ────────────────────
    const mask = new Uint8Array(W*H);
    for (let y=0;y<H;y++) for (let x=0;x<W/2;x++) mask[y*W+x] = 255;
    const ci = registerClip(mask);
    pushAction(clipAction(ci));
    t('clip active', clipActive());
    stroke([{x:30,y:120},{x:300,y:140}], 'pen');
    const cs = strokes[strokes.length-1];
    t('clipped stroke stays a vector', Array.isArray(cs.pts) && cs.pts.length === 2, 'type=' + cs.type);
    t('clipped stroke keeps jitter', cs.jitter === true, 'jitter=' + cs.jitter);
    t('clipped stroke references the mask', cs.clip === ci, 'clip=' + cs.clip);
    // The three buffers must differ where a jittering stroke lives, or the
    // ink is dead. Compare a column inside the clip across variants.
    rebuildAll();
    let differs = false;
    for (let x = 25; x < 60 && !differs; x++)
      for (let y = 110; y < 135 && !differs; y++)
        if (px(bufs[0],x,y) !== px(bufs[1],x,y) || px(bufs[1],x,y) !== px(bufs[2],x,y)) differs = true;
    t('clipped stroke still boils across buffers', differs);
    // And it must not paint outside the mask.
    let leaked = false;
    for (let x = W/2 + 4; x < Math.min(W, W/2 + 80) && !leaked; x++)
      for (let y = 115; y < 145; y++) {
        const p = px(bufs[0], x, y);
        if (p !== px(bufs[0], W-2, 2)) { leaked = true; break; }
      }
    t('clip contains the stroke', !leaked);
    pushAction(clipAction(null));

    // ── fills are run-length now, not base64 PNG ─────────
    setTool('fill');
    doFill({x: 400, y: 300});
    const fill = strokes.find(s => s.type === 'fill');
    t('fill recorded', !!fill);
    if (fill) {
      t('fill stores a mask, not a dataURL', Array.isArray(fill.mask) && !fill.dataURL,
        'mask=' + (fill.mask ? fill.mask.length + ' runs' : 'none'));
      const asJson = JSON.stringify(fill.mask).length;
      t('fill mask is compact', asJson < 60000, asJson + ' bytes');
    }

    // ── thumbnails no longer swap globals ────────────────
    t('renderFrame takes explicit state', renderFrame.length === 2);

    // ── the point of all this: cost per stroke must be flat ──
    const many = [];
    for (let i = 0; i < 400; i++) {
      const y = 20 + (i % 40) * 8;
      many.push([{x: 10 + (i%30)*15, y}, {x: 30 + (i%30)*15, y: y+10}, {x: 55 + (i%30)*15, y: y+4}]);
    }
    // time the first 40 vs the last 40 strokes
    const timeRange = (from, to) => {
      const t0 = performance.now();
      for (let i = from; i < to; i++) stroke(many[i]);
      return performance.now() - t0;
    };
    const early = timeRange(0, 40);
    for (let i = 40; i < 360; i++) stroke(many[i]);
    const late = timeRange(360, 400);
    t('stroke count reached', strokes.length > 400, 'len=' + strokes.length);
    t('plates engaged', flatN > 0, 'flatN=' + flatN + ' tail=' + (strokes.length - flatN));
    t('cost per stroke stays flat', late < early * 3.5,
       'first40=' + early.toFixed(0) + 'ms last40=' + late.toFixed(0) + 'ms');

    const t0 = performance.now(); rebuildAll(); const rebuildMs = performance.now() - t0;
    t('full rebuild is fast at 400 strokes', rebuildMs < 120, rebuildMs.toFixed(1) + 'ms');

    // ── undo still correct after flattening ──────────────
    const n = strokes.length;
    undo(); undo();
    t('undo works past the plate boundary', strokes.length === n - 2, 'len=' + strokes.length);
    rebuildAll();

    return R;
  })()`).catch(e => [{ name: 'renderer threw', ok: false, detail: String(e && e.message || e) }]);

  results.push(...out);

  let pass = 0, fail = 0;
  for (const r of results) {
    console.log((r.ok ? '  ok   ' : '  FAIL ') + r.name + (r.detail ? '  [' + r.detail + ']' : ''));
    r.ok ? pass++ : fail++;
  }
  if (errors.length) {
    console.log('\nconsole errors:');
    for (const e of errors.slice(0, 20)) console.log('  ! ' + e);
  }
  // JSZip is loaded from a CDN, so it is expected to fail with no network.
  const realErrors = errors.filter(e => !/jszip|cdnjs|ERR_(NAME|INTERNET|NETWORK|CONNECTION)/i.test(e));
  console.log(`\n${pass} passed, ${fail} failed, ${realErrors.length} unexpected console errors`);
  app.exit(fail === 0 && realErrors.length === 0 ? 0 : 1);
});
