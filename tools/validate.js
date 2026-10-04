#!/usr/bin/env node
/* ============================================================================
 * Physics validation for the myBlobChain web port.
 * ----------------------------------------------------------------------------
 * Verifies, against the RAW vendored toxiclibs.js, that the two performance
 * overrides in js/blobchain.js (installFastSolver) are mathematically
 * transparent:
 *
 *   1. EQUIVALENCE  — with the stochastic jitter disabled, the fast solver and
 *                     the raw library produce BIT-IDENTICAL trajectories
 *                     (max |delta| = 0) over hundreds of updates.
 *   2. STOCHASTIC   — with jitter enabled, the raw-vs-fast divergence is
 *                     compared against the library's own run-to-run noise
 *                     (raw-vs-raw). Cross-implementation divergence must not
 *                     exceed the natural spread.
 *   3. PERF         — wall-clock ms/frame for both solvers at the real
 *                     particle count (~1200 particles).
 *
 * Also sanity-checks the Geomerative-replacement contour extraction
 * (contour count, uniform point spacing, bounding box).
 *
 * Run from anywhere:   node tools/validate.js
 * ========================================================================== */
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..');

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
const font = opentype.loadSync(path.join(ROOT, 'fonts', 'ArchivoBlack-Regular.ttf'));

/* --- 1. contour extraction sanity ---------------------------------------- */
const contours = bc.extractContours(font, C.input, C.textSize, C.segLen, C.offsetX, C.offsetY, C.W - C.offsetX - 40);
let total = 0,
  minP = Infinity,
  maxP = 0,
  spSum = 0,
  spN = 0;
const bb = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
for (const c of contours) {
  total += c.length;
  minP = Math.min(minP, c.length);
  maxP = Math.max(maxP, c.length);
  for (let i = 0; i < c.length; i++) {
    bb.x1 = Math.min(bb.x1, c[i].x);
    bb.y1 = Math.min(bb.y1, c[i].y);
    bb.x2 = Math.max(bb.x2, c[i].x);
    bb.y2 = Math.max(bb.y2, c[i].y);
    if (i > 0) {
      spSum += Math.hypot(c[i].x - c[i - 1].x, c[i].y - c[i - 1].y);
      spN++;
    }
  }
}
console.log('--- contour extraction ---');
console.log('input: "' + C.input + '"');
console.log('contours:', contours.length, '| points total:', total, '| min/max per contour:', minP, '/', maxP);
console.log('avg segment length:', (spSum / spN).toFixed(3), 'px (target:', C.segLen + ')');
console.log(
  'bbox:',
  bb.x1.toFixed(1),
  bb.y1.toFixed(1),
  '->',
  bb.x2.toFixed(1),
  bb.y2.toFixed(1),
  '| fits canvas:',
  bb.x1 >= 0 && bb.y1 >= 0 && bb.x2 <= C.W && bb.y2 <= C.H,
);

/* --- shared scene builder ------------------------------------------------- */
function buildScene(mode, deterministicJitterOff) {
  const p = new toxi.physics2d.VerletPhysics2D();
  p.setWorldBounds(new toxi.geom.Rect(0, 0, C.W, C.H));
  p.setDrag(C.drag);
  const built = bc.buildLetterPhysics(p, contours, C);
  if (deterministicJitterOff) {
    for (const b of built.repulsionBehaviors) {
      b.jitter = 0;
      b.applyBehavior = function (q) {
        // same math, no RNG term
        const delta = this.attractor.sub(q);
        const dist = delta.magSquared();
        if (dist < this.radiusSquared) {
          q.addForce(delta.normalizeTo(1.0 - dist / this.radiusSquared).scaleSelf(this.attrStrength));
        }
      };
    }
  }
  for (const s of built.originSprings) {
    s.setStrength(0.02);
    p.addSpring(s);
  } // exercise the locked-end branch
  for (const b of built.repulsionBehaviors) b.setStrength(-C.repulsionStrength);
  if (mode === 'fast') {
    bc.installFastSolver(p, { cellSize: C.repulsionRadius, worldWidth: C.W, worldHeight: C.H });
  }
  return p;
}
function step(p, frames) {
  for (let f = 0; f < frames; f++) {
    p.update();
    p.update();
  }
}
function stats(a, b) {
  let mx = 0,
    sum = 0;
  for (let i = 0; i < a.particles.length; i++) {
    const d = Math.hypot(a.particles[i].x - b.particles[i].x, a.particles[i].y - b.particles[i].y);
    if (d > mx) mx = d;
    sum += d;
  }
  return { max: mx, mean: sum / a.particles.length };
}

/* --- 2. deterministic bit-exact equivalence ------------------------------- */
const FRAMES = 90;
let rawA = buildScene('raw', true);
let fastA = buildScene('fast', true);
step(rawA, FRAMES);
step(fastA, FRAMES);
const det = stats(rawA, fastA);
console.log('--- equivalence (deterministic, ' + 2 * FRAMES + ' updates) ---');
console.log('max |delta|:', det.max, det.max === 0 ? '(BIT-EXACT)' : '(expected 0)');

/* --- 3. stochastic control ------------------------------------------------ */
rawA = buildScene('raw', false);
const rawB = buildScene('raw', false);
fastA = buildScene('fast', false);
step(rawA, FRAMES);
step(rawB, FRAMES);
step(fastA, FRAMES);
const ctl = stats(rawA, rawB);
const cross = stats(rawA, fastA);
console.log('--- stochastic (jitter ' + C.repulsionJitter + ', ' + 2 * FRAMES + ' updates) ---');
console.log('control  raw vs raw : max ' + ctl.max.toFixed(3) + ' px | mean ' + ctl.mean.toFixed(3) + ' px');
console.log('cross    raw vs fast: max ' + cross.max.toFixed(3) + ' px | mean ' + cross.mean.toFixed(3) + ' px');
console.log(cross.max <= ctl.max * 1.25 ? '(within natural noise)' : '(WARNING: exceeds control)');

/* --- 4. performance ------------------------------------------------------- */
function bench(label, p, frames) {
  step(p, 10);
  const t0 = process.hrtime.bigint();
  step(p, frames);
  const t1 = process.hrtime.bigint();
  console.log(label + ':', (Number(t1 - t0) / 1e6 / frames).toFixed(2), 'ms/frame (2 substeps)');
}
const sRaw = buildScene('raw', false);
const sFast = buildScene('fast', false);
console.log('--- performance (node; browsers differ) ---');
bench('raw toxiclibs.js', sRaw, 60);
bench('fast overrides  ', sFast, 60);
console.log(
  'particles:',
  sFast.particles.length,
  '| springs:',
  sFast.springs.length,
  '| behaviors:',
  sFast.behaviors.length,
);
