# Jitter — Living Ink

Animated pixel art drawing tool. Inspired by Wiggly Paint.

---

## Download (Windows)

Download `Jitter.exe` from the [Releases](../../releases) page and run it.

Your drawings are saved in `JitterData/drawings/` next to the exe.

> Windows may show a SmartScreen warning on first run — click **"More info" → "Run anyway"**.  
> This happens with any unsigned app and is safe to bypass.

---

## Play in browser

Also available on [itch.io](https://d4cvalentine.itch.io/jitter).  
Browser version saves drawings in local storage.

---

## Build the exe yourself

**Requirements:** [Node.js](https://nodejs.org) v18+

```bash
npm install
npm run build
```

Output: `dist/Jitter.exe`

---

## Run from source

**Desktop (Electron):**
```bash
npm install
npm start
```

**Browser (Flask):**
```bash
pip install flask
python app.py
# open http://localhost:5000
```

---

## Shortcuts

| Key | Action |
|-----|--------|
| P | Pen (jitter) |
| S | Pen (static) |
| M | Marker |
| F | Fill |
| E | Eraser |
| C | Clip mask |
| B | Animated border |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Ctrl+S | Save |
| +/- | Zoom in/out |
