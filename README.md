# Jitter — Living Ink

Animated pixel art drawing tool. Inspired by Wiggly Paint.

Available on [itch.io](https://devlver4.itch.io/jitter-living-ink) — runs in the browser, no install needed.

---

## What's new

- Frame-by-frame animation with onion skin and adjustable FPS
- Brush styles: screentone, ink splatter, Bayer dithering, scan lines
- Clip mask — restrict drawing to a selected area
- Animated border
- Export to GIF, PNG, WebP, JPEG, WebM
- Desktop app (.exe) for Windows

---

## Shortcuts

| Key | Action |
|-----|--------|
| P | Pen (jitter) |
| S | Pen (static) |
| M | Marker |
| F | Fill (static) |
| G | Fill (jitter) |
| U | Fill (under) |
| E | Eraser — content |
| R | Eraser — full |
| C | Clip mask |
| B | Animated border |
| Shift+N | Brush: normal |
| Shift+T | Brush: screentone |
| Shift+S | Brush: splatter |
| Shift+D | Brush: dither |
| Shift+L | Brush: scan lines |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Ctrl+S | Save |
| +/- | Zoom in/out |
| 0 | Reset zoom |

Animation mode: **Space** play/pause, **←/→** step frames, **A** add frame.

---

## Development

No build step — `editor.html` is the whole app, with the pure logic
(run-length masks, flood fill, stroke bounds, GIF/LZW encoding) in `lib.js`
so it can be tested outside the browser.

```
npm install
npm start           # run the desktop app
npm run build       # package the Windows exe into dist/

npm test            # unit tests for lib.js
npm run test:smoke  # drives the real editor in a headless Electron window
npm run bench       # per-stroke cost at 40 / 240 / 500 strokes
```

The browser build is the same `index.html` + `editor.html` + `lib.js`, saving
to localStorage instead of the filesystem.
