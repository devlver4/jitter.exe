// Run with: node --test test/
const test = require('node:test');
const assert = require('node:assert');
const L = require('../lib.js');

// ══════════════════════════════════════════════════════
// MASK RLE
// ══════════════════════════════════════════════════════
test('rle: round-trips an arbitrary mask', () => {
  const n = 5000;
  const src = new Uint8Array(n);
  // Deterministic pseudo-random blobs, including runs at both ends.
  let seed = 12345;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    src[i] = (seed >> 16) % 7 === 0 ? 255 : 0;
  }
  src[0] = 255; src[n - 1] = 255;
  const runs = L.rleEncode(src);
  const back = L.rleDecode(runs, n);
  assert.deepStrictEqual(Array.from(back), Array.from(src));
});

test('rle: leading zero run when the mask starts set', () => {
  const runs = L.rleEncode(Uint8Array.from([255, 255, 0, 255]));
  assert.strictEqual(runs[0], 0, 'must start with an OFF run so parity is fixed');
  assert.deepStrictEqual(runs, [0, 2, 1, 1]);
});

test('rle: empty and all-set masks', () => {
  const empty = new Uint8Array(64);
  assert.deepStrictEqual(Array.from(L.rleDecode(L.rleEncode(empty), 64)), Array.from(empty));
  const full = new Uint8Array(64).fill(255);
  assert.deepStrictEqual(Array.from(L.rleDecode(L.rleEncode(full), 64)), Array.from(full));
});

test('rle: rleLength matches the pixel count', () => {
  const src = new Uint8Array(300);
  src.fill(255, 10, 80);
  assert.strictEqual(L.rleLength(L.rleEncode(src)), 300);
});

test('rle: decode ignores runs past the buffer end', () => {
  // A truncated/corrupt save must not throw or write out of bounds.
  const out = L.rleDecode([0, 10, 5, 9999], 12);
  assert.strictEqual(out.length, 12);
  assert.strictEqual(out[9], 255);
  assert.strictEqual(out[10], 0);
});

test('rle: beats base64 PNG framing on a typical pixel-art fill', () => {
  // One solid rectangle in a 480x360 field — the shape a flood fill produces.
  const W = 480, H = 360;
  const a = new Uint8Array(W * H);
  for (let y = 100; y < 260; y++) for (let x = 60; x < 400; x++) a[y * W + x] = 255;
  const runs = L.rleEncode(a);
  // 160 rows * 2 runs + endpoints — a few hundred ints, not tens of KB.
  assert.ok(runs.length < 400, `expected < 400 runs, got ${runs.length}`);
  assert.ok(JSON.stringify(runs).length < 3000);
});

// ══════════════════════════════════════════════════════
// FLOOD FILL
// ══════════════════════════════════════════════════════
function makeField(w, h, paint) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { d[i * 4 + 3] = 255; } // opaque white-ish
  if (paint) paint((x, y, r, g, b) => {
    const i = (y * w + x) * 4;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  });
  return d;
}

test('floodFill: fills a bounded region and stops at the wall', () => {
  const w = 20, h = 20;
  // Vertical wall at x=10 splits the field in two.
  const d = makeField(w, h, set => { for (let y = 0; y < h; y++) set(10, y, 255, 0, 0); });
  const out = L.floodFillMask(d, w, h, 2, 2);
  assert.strictEqual(out[2 * w + 2], 255);
  assert.strictEqual(out[2 * w + 9], 255, 'reaches the wall');
  assert.strictEqual(out[2 * w + 10], 0, 'does not paint the wall');
  assert.strictEqual(out[2 * w + 11], 0, 'does not leak past the wall');
});

test('floodFill: reaches around a concave peninsula', () => {
  // A sealed box with a wall hanging down from the top, so the interior is
  // U-shaped: the two arms only connect around the bottom of the peninsula.
  // A span fill that forgets to re-seed the row it came from never crosses.
  const w = 12, h = 12;
  const d = makeField(w, h, set => {
    for (let i = 1; i <= 10; i++) {
      set(i, 1, 9, 9, 9); set(i, 10, 9, 9, 9);  // top / bottom
      set(1, i, 9, 9, 9); set(10, i, 9, 9, 9);  // left / right
    }
    for (let y = 1; y <= 6; y++) { set(5, y, 9, 9, 9); set(6, y, 9, 9, 9); } // peninsula
  });
  const out = L.floodFillMask(d, w, h, 3, 3); // left arm
  assert.strictEqual(out[3 * w + 3], 255, 'fills the arm it started in');
  assert.strictEqual(out[8 * w + 3], 255, 'runs down to the open bottom');
  assert.strictEqual(out[3 * w + 8], 255, 'climbs the far arm around the peninsula');
  assert.strictEqual(out[3 * w + 5], 0, 'does not paint the peninsula');
  assert.strictEqual(out[1 * w + 1], 0, 'does not paint the box wall');
  assert.strictEqual(out[0], 0, 'does not escape the box');
});

test('floodFill: respects the clip mask gate', () => {
  const w = 16, h = 16;
  const d = makeField(w, h);
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) mask[y * w + x] = 255;
  const out = L.floodFillMask(d, w, h, 4, 4, mask);
  assert.strictEqual(out[4 * w + 4], 255);
  assert.strictEqual(out[7 * w + 4], 255, 'fills up to the clip edge');
  assert.strictEqual(out[8 * w + 4], 0, 'does not cross the clip edge');
});

test('floodFill: refuses to start outside the clip or the canvas', () => {
  const w = 8, h = 8;
  const d = makeField(w, h);
  const mask = new Uint8Array(w * h); // all zero — nothing allowed
  assert.strictEqual(L.floodFillMask(d, w, h, 4, 4, mask).some(v => v), false);
  assert.strictEqual(L.floodFillMask(d, w, h, -1, 4).some(v => v), false);
  assert.strictEqual(L.floodFillMask(d, w, h, 4, 99).some(v => v), false);
});

test('floodFill: whole-canvas fill terminates and covers everything', () => {
  // The old array-shift queue was O(n^2) here; this is the regression guard.
  const w = 300, h = 300;
  const d = makeField(w, h);
  const t0 = Date.now();
  const out = L.floodFillMask(d, w, h, 0, 0);
  assert.ok(Date.now() - t0 < 2000, 'must not be quadratic');
  let count = 0; for (let i = 0; i < out.length; i++) if (out[i]) count++;
  assert.strictEqual(count, w * h);
});

// ══════════════════════════════════════════════════════
// STROKE BOUNDS
// ══════════════════════════════════════════════════════
test('strokeBounds: contains the points plus the brush radius', () => {
  const b = L.strokeBounds([{ x: 50, y: 50 }, { x: 60, y: 70 }], 'normal', 4, false, 480, 360);
  assert.ok(b.x < 50 && b.y < 50);
  assert.ok(b.x + b.w > 60 && b.y + b.h > 70);
});

test('strokeBounds: splatter reserves far more room than a normal brush', () => {
  const pts = [{ x: 240, y: 180 }];
  const normal = L.strokeBounds(pts, 'normal', 8, true, 480, 360);
  const splat = L.strokeBounds(pts, 'splatter', 8, true, 480, 360);
  assert.ok(splat.w > normal.w * 2, 'splatter scatters to ~3.5x size');
});

test('strokeBounds: never leaves the canvas', () => {
  const b = L.strokeBounds([{ x: 0, y: 0 }, { x: 479, y: 359 }], 'splatter', 20, true, 480, 360);
  assert.strictEqual(b.x, 0);
  assert.strictEqual(b.y, 0);
  assert.ok(b.x + b.w <= 480);
  assert.ok(b.y + b.h <= 360);
});

test('strokeBounds: null for an empty stroke', () => {
  assert.strictEqual(L.strokeBounds([], 'normal', 4, false, 480, 360), null);
  assert.strictEqual(L.strokeBounds(null, 'normal', 4, false, 480, 360), null);
});

test('strokeBounds: jitter widens the box', () => {
  const pts = [{ x: 100, y: 100 }];
  const still = L.strokeBounds(pts, 'normal', 10, false, 480, 360);
  const shaky = L.strokeBounds(pts, 'normal', 10, true, 480, 360);
  assert.ok(shaky.w > still.w);
});

// ══════════════════════════════════════════════════════
// GIF
// A hand-rolled encoder is only trustworthy if something decodes it back,
// so the test carries its own LZW decoder.
// ══════════════════════════════════════════════════════
function lzwDecode(bytes, minCodeSize) {
  const clearCode = 1 << minCodeSize, eofCode = clearCode + 1;
  let dict, codeSize, next;
  function reset() {
    dict = [];
    for (let i = 0; i < clearCode; i++) dict[i] = [i];
    dict[clearCode] = []; dict[eofCode] = [];
    next = eofCode + 1; codeSize = minCodeSize + 1;
  }
  reset();
  const out = [];
  let buf = 0, bits = 0, prev = null;
  for (let i = 0; i <= bytes.length; i++) {
    if (i < bytes.length) { buf |= bytes[i] << bits; bits += 8; }
    else if (bits <= 0) break;
    while (bits >= codeSize) {
      const code = buf & ((1 << codeSize) - 1);
      buf >>>= codeSize; bits -= codeSize;
      if (code === eofCode) return out;
      if (code === clearCode) { reset(); prev = null; continue; }
      let entry;
      if (code < next && dict[code]) entry = dict[code];
      else if (prev) entry = prev.concat(prev[0]);
      else throw new Error('bad LZW stream at code ' + code);
      out.push(...entry);
      if (prev) {
        dict[next++] = prev.concat(entry[0]);
        if (next > (1 << codeSize) - 1 && codeSize < 12) codeSize++;
      }
      prev = entry;
    }
  }
  return out;
}

test('gifLZW: round-trips through an independent decoder', () => {
  const cases = [
    Uint8Array.from([0]),
    Uint8Array.from([1, 1, 1, 1, 1, 1, 1, 1]),
    Uint8Array.from([0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3]),
  ];
  // A long run that forces the code size to grow past the initial width.
  const long = new Uint8Array(4000);
  for (let i = 0; i < long.length; i++) long[i] = i % 5;
  cases.push(long);

  for (const src of cases) {
    const enc = L.gifLZW(src, 3);
    const dec = lzwDecode(Uint8Array.from(enc), 3);
    assert.deepStrictEqual(dec, Array.from(src), `failed for length ${src.length}`);
  }
});

test('gifLZW: handles an empty index array', () => {
  assert.deepStrictEqual(lzwDecode(Uint8Array.from(L.gifLZW(new Uint8Array(0), 2)), 2), []);
});

function solidFrame(w, h, r, g, b, a) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = a == null ? 255 : a;
  }
  return d;
}

test('encodeGIF: writes a well-formed GIF89a container', () => {
  const w = 8, h = 8;
  const gif = L.encodeGIF([{ data: solidFrame(w, h, 200, 30, 30), delay: 80 }], w, h, false);
  assert.strictEqual(String.fromCharCode(...gif.slice(0, 6)), 'GIF89a');
  assert.strictEqual(gif[6] | (gif[7] << 8), w);
  assert.strictEqual(gif[8] | (gif[9] << 8), h);
  assert.strictEqual(gif[gif.length - 1], 0x3B, 'trailer');
  // NETSCAPE2.0 loop block must be present or the GIF plays once.
  assert.ok(Buffer.from(gif).includes(Buffer.from('NETSCAPE2.0')));
});

test('encodeGIF: emits one graphic-control block per frame with the right delay', () => {
  const w = 4, h = 4;
  const gif = L.encodeGIF([
    { data: solidFrame(w, h, 10, 20, 30), delay: 100 },
    { data: solidFrame(w, h, 40, 50, 60), delay: 250 },
  ], w, h, false);
  const buf = Buffer.from(gif);
  const delays = [];
  for (let i = 0; i < buf.length - 5; i++) {
    if (buf[i] === 0x21 && buf[i + 1] === 0xF9 && buf[i + 2] === 0x04) {
      delays.push(buf[i + 4] | (buf[i + 5] << 8));
    }
  }
  assert.deepStrictEqual(delays, [10, 25], 'delays are in centiseconds');
});

test('encodeGIF: pixel data survives the LZW round trip', () => {
  const w = 6, h = 6;
  // Two-colour checkerboard — exercises the palette map and the index stream.
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const on = ((i % w) + Math.floor(i / w)) % 2 === 0;
    d[i * 4] = on ? 255 : 0; d[i * 4 + 1] = 0; d[i * 4 + 2] = on ? 0 : 255; d[i * 4 + 3] = 255;
  }
  const gif = L.encodeGIF([{ data: d, delay: 100 }], w, h, false);
  const buf = Buffer.from(gif);

  // Palette size from the packed field, then locate the image descriptor.
  const pow = (buf[10] & 0x07) + 1;
  const palEntries = 1 << pow;
  let p = 13 + palEntries * 3;
  while (p < buf.length && buf[p] !== 0x2C) p++;
  p += 10; // image descriptor
  const minLZW = buf[p++];
  const chunks = [];
  while (buf[p] !== 0x00) { const len = buf[p++]; chunks.push(buf.subarray(p, p + len)); p += len; }
  const indices = lzwDecode(Buffer.concat(chunks), minLZW);

  assert.strictEqual(indices.length, w * h);
  // Reconstruct colours from the global palette and compare to the source.
  for (let i = 0; i < w * h; i++) {
    const off = 13 + indices[i] * 3;
    assert.strictEqual(buf[off], d[i * 4], `red mismatch at px ${i}`);
    assert.strictEqual(buf[off + 2], d[i * 4 + 2], `blue mismatch at px ${i}`);
  }
});

test('encodeGIF: transparency reserves palette index 0', () => {
  const w = 4, h = 4;
  const d = solidFrame(w, h, 90, 90, 90, 0); // fully transparent
  const gif = L.encodeGIF([{ data: d, delay: 100 }], w, h, true);
  const buf = Buffer.from(gif);
  let i = 0; while (i < buf.length - 3 && !(buf[i] === 0x21 && buf[i + 1] === 0xF9)) i++;
  assert.strictEqual(buf[i + 3] & 0x01, 1, 'transparency flag set in the GCE');
});
