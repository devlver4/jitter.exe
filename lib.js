// ══════════════════════════════════════════════════════
// JITTER — PURE LOGIC
// No DOM, no canvas. Everything here is deterministic and unit-testable.
// Loaded as a plain script in the browser (sets window.JitterLib) and
// required directly by test/run.js in Node.
// ══════════════════════════════════════════════════════
(function (root) {
'use strict';

// ══════════════════════════════════════════════════════
// MASK RLE
// A fill or clip mask is a 1-bit shape: every pixel is either in or out.
// Storing that as a base64 PNG costs ~33% overhead on top of PNG framing
// for what is, in pixel art, a handful of runs. We store alternating run
// lengths instead, starting with an OFF run (possibly zero-length).
//   [0, 5, 3, 2]  →  5 on, 3 off, 2 on
// Decoding is synchronous, which also removes Image.onload from the load path.
// ══════════════════════════════════════════════════════

// alpha: array-like, one entry per pixel; >=128 counts as set.
function rleEncode(alpha, len) {
  const n = len == null ? alpha.length : len;
  const runs = [];
  let cur = 0, run = 0;
  for (let i = 0; i < n; i++) {
    const v = alpha[i] >= 128 ? 1 : 0;
    if (v === cur) { run++; continue; }
    runs.push(run); cur = v; run = 1;
  }
  if (run) runs.push(run);
  return runs;
}

// Writes 255 into `out` at each set pixel. `out` is one byte per pixel.
function rleDecodeInto(runs, out) {
  let pos = 0, on = 0;
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    if (on) {
      const end = Math.min(pos + run, out.length);
      for (let p = pos; p < end; p++) out[p] = 255;
    }
    pos += run; on ^= 1;
    if (pos >= out.length) break;
  }
  return out;
}

function rleDecode(runs, n) {
  return rleDecodeInto(runs, new Uint8Array(n));
}

// Total pixel count a run list covers — used to validate against W*H on load.
function rleLength(runs) {
  let n = 0;
  for (let i = 0; i < runs.length; i++) n += runs[i];
  return n;
}

// ══════════════════════════════════════════════════════
// FLOOD FILL
// Scanline fill over a flat RGBA buffer. The previous implementation used
// `queue.shift()` on a plain array (O(n) per dequeue → O(n²) for a large
// region) and allocated a 4-element neighbour array per pixel. This walks
// horizontal spans and pushes only span seeds onto a typed-array stack.
//
// data      : Uint8ClampedArray|Uint8Array, RGBA, w*h*4
// mask      : optional one-byte-per-pixel gate; 0 means "cannot enter"
// Returns a Uint8Array (one byte per pixel), 255 where filled.
// ══════════════════════════════════════════════════════
function floodFillMask(data, w, h, sx, sy, mask) {
  const out = new Uint8Array(w * h);
  if (sx < 0 || sx >= w || sy < 0 || sy >= h) return out;
  if (mask && !mask[sy * w + sx]) return out;

  const si = (sy * w + sx) * 4;
  const tR = data[si], tG = data[si + 1], tB = data[si + 2], tA = data[si + 3];

  const match = (p) => {
    if (out[p]) return false;
    if (mask && !mask[p]) return false;
    const i = p * 4;
    return data[i] === tR && data[i + 1] === tG && data[i + 2] === tB && data[i + 3] === tA;
  };

  // Stack of scanline seeds. Worst case one entry per row-span; grow on demand.
  let stack = new Int32Array(1024);
  let sp = 0;
  const push = (x, y) => {
    if (sp + 2 > stack.length) {
      const bigger = new Int32Array(stack.length * 2);
      bigger.set(stack); stack = bigger;
    }
    stack[sp++] = x; stack[sp++] = y;
  };

  push(sx, sy);
  while (sp > 0) {
    const y = stack[--sp], x = stack[--sp];
    const row = y * w;
    if (!match(row + x)) continue;

    // Walk left and right to the ends of this span.
    let x0 = x; while (x0 > 0 && match(row + x0 - 1)) x0--;
    let x1 = x; while (x1 < w - 1 && match(row + x1 + 1)) x1++;
    for (let p = row + x0; p <= row + x1; p++) out[p] = 255;

    // Seed the rows above and below, one seed per contiguous run.
    for (const ny of [y - 1, y + 1]) {
      if (ny < 0 || ny >= h) continue;
      const nrow = ny * w;
      let inRun = false;
      for (let cx = x0; cx <= x1; cx++) {
        if (match(nrow + cx)) {
          if (!inRun) { push(cx, ny); inRun = true; }
        } else inRun = false;
      }
    }
  }
  return out;
}

// ══════════════════════════════════════════════════════
// STROKE BOUNDS
// How far past its points a stroke can actually paint. Used to size the
// per-stroke render cache. Over-estimating wastes a little memory;
// under-estimating clips the stroke, so every branch here rounds up.
// ══════════════════════════════════════════════════════
function brushRadius(size) { return Math.max(1, Math.ceil(size / 2)); }
function jitterAmount(size) { return Math.max(1, Math.ceil(size * 0.45)); }

// Extra reach of a brush mode beyond the nominal brush radius, in pixels.
function brushReach(mode, size, j) {
  const r = brushRadius(size);
  switch (mode) {
    // Dots land on a canvas-aligned grid up to `radius` away, plus dot size.
    case 'tone': {
      const spacing = Math.max(4, Math.round(size * 0.9 + 3));
      const dotSz = Math.max(1, Math.round(spacing * 0.38));
      return size * 1.3 + spacing + brushRadius(dotSz) + j * 0.5;
    }
    // Blobs scatter out to `spread`, each up to 0.65*size across.
    case 'splatter': {
      const blobMax = Math.max(1, Math.round(size * 0.65));
      return size * 3.5 + brushRadius(blobMax) + j * 3;
    }
    case 'dither': return size * 0.95 + 1;
    case 'lines':  return size * 0.9 + j * 1.2 + 1;
    default:       return r + j;
  }
}

// pts: [{x,y}, ...]. Returns integer {x,y,w,h} or null for an empty stroke.
function strokeBounds(pts, mode, size, jitter, W, H) {
  if (!pts || !pts.length) return null;
  const j = jitter ? jitterAmount(size) : 0;
  const pad = Math.ceil(brushReach(mode || 'normal', size, j)) + 2;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const x0 = Math.max(0, Math.floor(minX) - pad);
  const y0 = Math.max(0, Math.floor(minY) - pad);
  const x1 = Math.min(W, Math.ceil(maxX) + pad + 1);
  const y1 = Math.min(H, Math.ceil(maxY) + pad + 1);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ══════════════════════════════════════════════════════
// GIF ENCODER
// Exact palette, no quantization — the drawing already has few colours.
// frames: [{data: RGBA array, delay: ms}], all the same size.
// Returns a Uint8Array of the complete GIF file.
// ══════════════════════════════════════════════════════
function gifLZW(indices, minCodeSize) {
  const clearCode = 1 << minCodeSize, eofCode = clearCode + 1;
  const out = [];
  let buf = 0, bufBits = 0, codeSize, nextCode, maxCode, chainTable;
  function initTable() {
    chainTable = new Map();
    nextCode = eofCode + 1;
    codeSize = minCodeSize + 1;
    maxCode = 1 << codeSize;
  }
  function emit(code) {
    buf |= code << bufBits; bufBits += codeSize;
    while (bufBits >= 8) { out.push(buf & 0xFF); buf >>>= 8; bufBits -= 8; }
  }
  initTable(); emit(clearCode);
  if (!indices.length) { emit(eofCode); if (bufBits) out.push(buf & 0xFF); return out; }
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const c = indices[i], key = prefix * 256 + c, found = chainTable.get(key);
    if (found !== undefined) { prefix = found; continue; }
    emit(prefix);
    if (nextCode <= 4095) {
      chainTable.set(key, nextCode++);
      if (nextCode > maxCode && codeSize < 12) { codeSize++; maxCode <<= 1; }
    } else { emit(clearCode); initTable(); }
    prefix = c;
  }
  emit(prefix); emit(eofCode);
  if (bufBits) out.push(buf & 0xFF);
  return out;
}

function encodeGIF(frames, fw, fh, useTransparency) {
  const pMap = new Map(), pal = [];
  if (useTransparency) { pMap.set('t', 0); pal.push([0, 0, 0]); }
  for (const f of frames) {
    const d = f.data;
    for (let i = 0; i < d.length; i += 4) {
      if (useTransparency && d[i + 3] < 128) continue;
      const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      if (!pMap.has(k)) { pMap.set(k, pal.length); pal.push([d[i], d[i + 1], d[i + 2]]); }
    }
  }
  let pow = 2; while ((1 << pow) < pal.length) pow++; if (pow > 8) pow = 8;
  while (pal.length < (1 << pow)) pal.push([0, 0, 0]);

  const out = [], u16 = n => [n & 0xFF, (n >> 8) & 0xFF];
  out.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, ...u16(fw), ...u16(fh), 0x80 | 0x70 | (pow - 1), 0, 0);
  for (const [r, g, b] of pal) out.push(r, g, b);
  // NETSCAPE2.0 application extension — loop forever.
  out.push(0x21, 0xFF, 0x0B, 0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45,
           0x32, 0x2E, 0x30, 0x03, 0x01, 0x00, 0x00, 0x00);

  for (const f of frames) {
    const d = f.data, delayCs = Math.max(1, Math.round(f.delay / 10));
    out.push(0x21, 0xF9, 0x04, useTransparency ? 0x09 : 0x04, ...u16(delayCs), useTransparency ? 0 : 0, 0x00);
    out.push(0x2C, ...u16(0), ...u16(0), ...u16(fw), ...u16(fh), 0x00);
    const indices = new Uint8Array(fw * fh);
    for (let i = 0; i < fw * fh; i++) {
      const pi = i * 4;
      if (useTransparency && d[pi + 3] < 128) { indices[i] = 0; continue; }
      indices[i] = pMap.get((d[pi] << 16) | (d[pi + 1] << 8) | d[pi + 2]) ?? 0;
    }
    const minLZW = Math.max(2, pow), lzw = gifLZW(indices, minLZW);
    out.push(minLZW);
    for (let pos = 0; pos < lzw.length; pos += 255) {
      const len = Math.min(255, lzw.length - pos);
      out.push(len);
      for (let j = 0; j < len; j++) out.push(lzw[pos + j]);
    }
    out.push(0x00);
  }
  out.push(0x3B);
  return new Uint8Array(out);
}

const API = {
  rleEncode, rleDecode, rleDecodeInto, rleLength,
  floodFillMask,
  brushRadius, jitterAmount, brushReach, strokeBounds,
  gifLZW, encodeGIF,
};

if (typeof module !== 'undefined' && module.exports) module.exports = API;
else root.JitterLib = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
