#!/usr/bin/env node
/* ============================================================================
 * Anchor-capture dynamics demo / radius tuner.
 * ----------------------------------------------------------------------------
 * Simulates the sketch's exact per-frame cadence — origin strengths computed
 * once per frame, then CONFIG.substeps physics updates — but with NO cursor:
 * the only drive is anchor capture (key 'a' mode in the browser).
 *
 *   1. warm-up : origin strengths = 0        (blobs inflate, as at page load)
 *   2. capture : origin strength = maxAnchorStrength × anchorCaptureWeight(
 *                |particle − its own anchor|)   — the SAME function the sketch
 *                uses, imported from js/blobchain.js
 *
 * Usage:  node tools/capture-demo.js [radius] [seconds] [warmupSeconds] [preset]
 *   radius   capture radius in px        (default: CONFIG.anchorCaptureRadius)
 *   seconds  capture-phase duration      (default: 12)
 *   warmup   warm-up duration            (default: 3)
 *   preset   'current' (uses CONFIG) or 'original' (the .pde-era values:
 *            1600×720, segLen 6, drag 0.4, repulsion 30/-10/0.01,
 *            outline 0.1, maxAnchorStrength 0.025, substeps 2)
 *
 * Prints a per-second timeline: mean |particle − anchor|, how many contours
 * are effectively rebuilt (mean offset < REBUILT_PX), and the max contour
 * offset. Ends with ms/frame (fast solver — validated bit-exact vs raw).
 * ========================================================================== */
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const RADIUS_ARG = parseFloat(argv[0]) || null;
const SECONDS = parseFloat(argv[1]) || 12;
const WARMUP = parseFloat(argv[2]) || 3;
const PRESET = argv[3] || 'current';
const FPS = 60;
const REBUILT_PX = 25;

/* --- load vendored toxiclibs.js (UMD bundle) ----------------------------- */
let toxi;
try {
  toxi = require(path.join(ROOT, 'vendor', 'toxiclibs.min.js'));
} catch (e) {
  /* fall through */
}
if (!toxi || !toxi.physics2d) {
  const fs = require('fs');
  const vm = require('vm');
  const src = fs.readFileSync(path.join(ROOT, 'vendor', 'toxiclibs.min.js'), 'utf8');
  const sandbox = {
    console,
    Math,
    Date,
    setTimeout,
    clearTimeout,
    Float32Array,
    Float64Array,
    Uint8Array,
    Uint32Array,
    Int32Array,
    ArrayBuffer,
    DataView,
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  toxi = sandbox.toxi;
}
if (!toxi || !toxi.physics2d) {
  console.error('Could not load vendor/toxiclibs.min.js');
  process.exit(1);
}
global.toxi = toxi;

const opentype = require(path.join(ROOT, 'vendor', 'opentype.min.js'));
const bc = require(path.join(ROOT, 'js', 'blobchain.js'));
const C = bc.CONFIG;

if (PRESET === 'original') {
  Object.assign(C, {
    W: 1600,
    H: 720,
    input: 'feliz cumplegonz',
    textSize: 170,
    offsetX: 80,
    offsetY: 390,
    segLen: 6,
    drag: 0.4,
    substeps: 2,
    repulsionRadius: 30,
    repulsionStrength: 10,
    repulsionJitter: 0.01,
    outlineSpringStrength: 0.1,
    maxAnchorStrength: 0.025,
  });
}
const RAD = RADIUS_ARG || C.anchorCaptureRadius;

const fontEntry = (C.fonts && C.fonts[C.fontIndex || 0]) || { url: 'fonts/ArchivoBlack-Regular.ttf' };
const font = opentype.loadSync(path.join(ROOT, fontEntry.url));
const contours = bc.extractContours(font, C.input, C.textSize, C.segLen, C.offsetX, C.offsetY, C.W - C.offsetX - 40);

/* --- scene ----------------------------------------------------------------- */
const physics = new toxi.physics2d.VerletPhysics2D();
physics.setWorldBounds(new toxi.geom.Rect(0, 0, C.W, C.H));
physics.setDrag(C.drag);
const built = bc.buildLetterPhysics(physics, contours, C);
for (const s of built.originSprings) physics.addSpring(s); // attractToOrigin: true
bc.installFastSolver(physics, {
  cellSize: C.repulsionRadius,
  worldWidth: C.W,
  worldHeight: C.H,
});

/* --- drive (mirrors draw(): strengths once per frame, then substeps) ------ */
function setStrengths(captureOn) {
  const n = built.originSprings.length;
  for (let i = 0; i < n; i++) {
    const s = built.originSprings[i];
    let w = 0;
    if (captureOn) {
      w = bc.anchorCaptureWeight(s.a.x, s.a.y, s.b.x, s.b.y, RAD, C.anchorCaptureSoftness, C.anchorCaptureMidpointFrac);
    }
    s.setStrength(C.maxAnchorStrength * w);
  }
}
function frame() {
  for (let s = 0; s < C.substeps; s++) physics.update();
}
function contourMeans() {
  const means = [];
  for (let ii = 0; ii < built.pathParticles.length; ii++) {
    const pp = built.pathParticles[ii];
    let sum = 0;
    for (let i = 0; i < pp.length; i++) {
      const p = pp[i];
      const a = built.originalPathParticles[ii][i];
      sum += Math.hypot(p.x - a.x, p.y - a.y);
    }
    means.push(sum / pp.length);
  }
  return means;
}
function report(tag, means) {
  const mean = means.reduce((a, b) => a + b, 0) / means.length;
  const rebuilt = means.filter((v) => v < REBUILT_PX).length;
  console.log(
    tag +
      '  mean ' +
      mean.toFixed(1).padStart(6) +
      ' px  |  contours <' +
      REBUILT_PX +
      'px: ' +
      String(rebuilt).padStart(2) +
      '/' +
      means.length +
      '  |  max contour ' +
      Math.max(...means).toFixed(1),
  );
}

/* --- run ------------------------------------------------------------------- */
console.log('preset:', PRESET, '| text:', JSON.stringify(C.input), '| capture R:', RAD, 'px');
console.log(
  'particles:',
  physics.particles.length,
  '| springs:',
  physics.springs.length,
  '| behaviors:',
  physics.behaviors.length,
  '| substeps/frame:',
  C.substeps,
  '| maxAnchorStrength:',
  C.maxAnchorStrength,
);

const t0 = process.hrtime.bigint();
for (let f = 0; f < WARMUP * FPS; f++) {
  setStrengths(false);
  frame();
}
console.log('--- warm-up done (' + WARMUP + ' s, capture OFF) ---');
report('warm-up', contourMeans());

console.log('--- capture ON ---');
for (let s = 1; s <= SECONDS; s++) {
  for (let f = 0; f < FPS; f++) {
    setStrengths(true);
    frame();
  }
  report('t=' + String(s).padStart(2) + 's ', contourMeans());
}

const t1 = process.hrtime.bigint();
const totalFrames = (WARMUP + SECONDS) * FPS;
console.log(
  'perf: ' + (Number(t1 - t0) / 1e6 / totalFrames).toFixed(2) + ' ms/frame (' + totalFrames + ' frames incl. warm-up)',
);
