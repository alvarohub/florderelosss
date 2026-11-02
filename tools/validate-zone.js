#!/usr/bin/env node
/* ============================================================================
 * myBlobChain — zone & scan validation (node; no browser needed)
 *
 * Checks the pure geometry introduced with the scan variants + scaffold-side
 * zone activation (js/blobchain.js):
 *   - plateauWeight(): 1 in the core, ≈0.5 at the nominal edge, strictly
 *     decreasing, hard zero beyond half + 8·softness (two sigmoids side by
 *     side = flat plateau, soft shoulders).
 *   - scanPointer(): continuous equations of the sweep — one-way (offstage
 *     margin at both ends) and sinusoidal ping-pong — along x and y, for the
 *     disk and the bar (margin = zone edge + 4·softness: fully offstage).
 *
 * Run:  node tools/validate-zone.js
 * ========================================================================== */
'use strict';
const path = require('path');
const bc = require(path.join(__dirname, '..', 'js', 'blobchain.js'));
const { CONFIG, flags: FLAGS, pointer, plateauWeight, scanPointer, zoneWeightAt } = bc;

let failures = 0;
const check = (name, cond, detail = '') => {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`);
};
const near = (a, b, eps) => Math.abs(a - b) <= eps;

/* ---- plateauWeight (d, half=100, softness=40) ---------------------------- */
console.log('plateauWeight(d, half=100, softness=40):');
check('w(0) = 1 (flat core midpoint)', near(plateauWeight(0, 100, 40), 1, 1e-9));
const wEdge = plateauWeight(100, 100, 40);
check('w(100) ≈ 0.5 at the nominal edge', wEdge > 0.5 && wEdge < 0.62, `w = ${wEdge.toFixed(4)}`);
check('hard cutoff: w(h + 8s) = 0', plateauWeight(100 + 8 * 40, 100, 40) === 0);
let mono = true;
let prev = Infinity;
for (let d = 0; d <= 100 + 8 * 40; d += 4) {
  const w = plateauWeight(d, 100, 40);
  if (w > prev + 1e-12) mono = false;
  prev = w;
}
check('monotonic: strictly decreasing over 0..(h + 8s)', mono);
const wTail = plateauWeight(400, 100, 40);
check('thin tail: w(4·half) < 0.02', wTail < 0.02, `w = ${wTail.toFixed(4)}`);

/* ---- scanPointer: bar · sweep · x ---------------------------------------- */
console.log('scanPointer (bar, sweep, x):');
Object.assign(CONFIG, { scanShape: 'bar', scanAxis: 'x', scanPattern: 'sweep', scanPeriodMs: 8000, scanBarWidth: 240 });
const P = 8000;
const half = 120;
const W = CONFIG.W;
const H = CONFIG.H;
const marginBar = half + 4 * Math.max(0.5, CONFIG.lensSoftness); // whole zone offstage at the extremes
check('t=0 → offstage left', near(scanPointer(0).x, -marginBar, 1e-9) && scanPointer(0).y === H / 2);
check('t=P/2 → stage centre', near(scanPointer(P / 2).x, W / 2, 1e-9));
check('t→P → offstage right', scanPointer(P - 1).x > W + marginBar - 1);
check('x sweep: y pinned to H/2', scanPointer(1234).y === H / 2);

/* ---- scanPointer: bar · pingpong · x (sinusoidal) ------------------------ */
console.log('scanPointer (bar, pingpong, x):');
CONFIG.scanPattern = 'pingpong';
check('t=0 → offstage left (cosine start)', near(scanPointer(0).x, -marginBar, 1e-9));
check('t=P/4 → centre', near(scanPointer(P / 4).x, W / 2, 1e-9));
check('t=P/2 → offstage right', near(scanPointer(P / 2).x, W + marginBar, 1e-9));
check('t=3P/4 → centre again', near(scanPointer((3 * P) / 4).x, W / 2, 1e-9));
const vAt = (t) => (scanPointer(t + 1).x - scanPointer(t - 1).x) / 2;
check(
  'sinusoid shape: v≈0 at the ends, |v| max at the centre',
  Math.abs(vAt(0)) < 0.05 && Math.abs(vAt(P / 4)) > Math.abs(vAt(P / 8)),
);

/* ---- scanPointer: bar · sweep · y ---------------------------------------- */
console.log('scanPointer (bar, sweep, y):');
Object.assign(CONFIG, { scanAxis: 'y', scanPattern: 'sweep' });
check('y sweep: x pinned to W/2', scanPointer(0).x === W / 2);
check('t=0 → offstage top', near(scanPointer(0).y, -marginBar, 1e-9));
check('t=P/2 → vertical centre', near(scanPointer(P / 2).y, H / 2, 1e-9));

/* ---- scanPointer: disk margins ------------------------------------------- */
console.log('scanPointer (disk):');
CONFIG.scanShape = 'disk';
CONFIG.scanAxis = 'x';
CONFIG.lensRadius = 170;
const halfDisk = CONFIG.lensRadius * CONFIG.lensMidpointFrac;
const marginDisk = halfDisk + 4 * Math.max(0.5, CONFIG.lensSoftness);
check('disk: offstage margin = zone edge + 4·softness', near(scanPointer(0).x, -marginDisk, 1e-9));

/* ---- zoneWeightAt: the weight field the physics evaluates per anchor ------ */
/* applyEnzymeLens calls zoneWeightAt(anchor.x, anchor.y) — scaffold-side. */
console.log('zoneWeightAt (disk, pointer at 450,200):');
FLAGS.scanMode = false;
FLAGS.lensEnabled = true;
CONFIG.scanShape = 'disk';
pointer.x = 450;
pointer.y = 200;
check('centre = 1', near(zoneWeightAt(450, 200), 1, 1e-9));
const wEdgeDisk = zoneWeightAt(450 + halfDisk, 200);
check('nominal edge ≈ 0.5–0.62', wEdgeDisk > 0.5 && wEdgeDisk < 0.62, `w = ${wEdgeDisk.toFixed(4)}`);
const wFootDisk = zoneWeightAt(450 + marginDisk + 1, 200);
check('past the foot (edge + 4·softness): w < 0.03', wFootDisk < 0.03, `w = ${wFootDisk.toFixed(4)}`);
check('hard zero at edge + 8·softness', zoneWeightAt(450 + halfDisk + 8 * CONFIG.lensSoftness + 1, 200) === 0);
check('the old centre is outside now', zoneWeightAt(0, 0) === 0);

console.log('zoneWeightAt (bar, scan on, pointer at 100,200):');
FLAGS.scanMode = true;
CONFIG.scanShape = 'bar';
pointer.x = 100;
pointer.y = 200;
const halfBar = Math.max(1.0, CONFIG.scanBarWidth) / 2;
check('on the line = 1 (independent of y)', near(zoneWeightAt(100, 37), 1, 1e-9));
const wEdgeBar = zoneWeightAt(100 + halfBar, 0);
check('nominal edge ≈ 0.5–0.62', wEdgeBar > 0.5 && wEdgeBar < 0.62, `w = ${wEdgeBar.toFixed(4)}`);
check('hard zero beyond the bar reach', zoneWeightAt(100 + halfBar + 8 * CONFIG.lensSoftness + 1, 0) === 0);
CONFIG.scanAxis = 'y';
check(
  'axis y: weight depends on y only',
  near(zoneWeightAt(5000, 200), 1, 1e-9) && zoneWeightAt(100, 200 + halfBar + 8 * CONFIG.lensSoftness + 1) === 0,
);
CONFIG.scanAxis = 'x';
FLAGS.scanMode = false; // leave the exported state tidy

/* ---- scanPointer: bounce (DVD-logo ball) --------------------------------- */
console.log('scanPointer (disk, bounce):');
Object.assign(CONFIG, { scanShape: 'disk', scanAxis: 'x', scanPattern: 'bounce', scanPeriodMs: 8000 });
const marginB = halfDisk + 4 * Math.max(0.5, CONFIG.lensSoftness); // same zone margins as the sweeps
const rxB = W + 2 * marginB;
const ryB = H + 2 * marginB;
const pyB = (ryB * P) / rxB; // matched-speed y period (≠ P/2: the ranges differ)
check(
  't=0 → offstage bottom-left corner',
  near(scanPointer(0).x, -marginB, 1e-9) && near(scanPointer(0).y, -marginB, 1e-9),
);
check('t=P/2 → x at the far right edge', near(scanPointer(P / 2).x, W + marginB, 1e-9));
check('t=Py/2 → y at the far bottom edge (its own reflection phase)', near(scanPointer(pyB / 2).y, H + marginB, 1e-9));
check('x(t) = x(t + P) (x reflects with period P)', near(scanPointer(1234).x, scanPointer(1234 + P).x, 1e-9));
check('y(t) = y(t + Py) (matched-speed y period)', near(scanPointer(567).y, scanPointer(567 + pyB).y, 1e-9));
let inExt = true;
for (let t = 0; t < 3 * P; t += P / 40) {
  const p = scanPointer(t);
  if (p.x < -marginB - 1e-9 || p.x > W + marginB + 1e-9 || p.y < -marginB - 1e-9 || p.y > H + marginB + 1e-9)
    inExt = false;
}
check('stays inside [−margin, span+margin] on both axes', inExt);
const vxB = (scanPointer(10).x - scanPointer(0).x) / 10;
const vyB = (scanPointer(10).y - scanPointer(0).y) / 10;
check(
  '|vx| = |vy| (45° ball)',
  near(Math.abs(vxB), Math.abs(vyB), 1e-6),
  `|vx|=${Math.abs(vxB).toFixed(4)} |vy|=${Math.abs(vyB).toFixed(4)}`,
);

/* ---- scanPointer + zoneWeightAt: rotate (spinning line / orbiting lens) -- */
console.log('scanPointer (bar, rotate):');
Object.assign(CONFIG, { scanShape: 'bar', scanPattern: 'rotate', scanBarWidth: 240 });
const rot0 = scanPointer(0);
const rotQ = scanPointer(P / 4);
check('angle: 0 at t=0, π/2 at t=P/4', near(rot0.angle, 0, 1e-9) && near(rotQ.angle, Math.PI / 2, 1e-9));
check('bar rotate: pointer pinned to the stage centre', rot0.x === W / 2 && rot0.y === H / 2);
console.log('zoneWeightAt (bar, rotate):');
FLAGS.scanMode = true;
const halfRot = Math.max(1.0, CONFIG.scanBarWidth) / 2;
pointer.angle = 0; // the line through the centre is horizontal (θ=0)
check('on the line (any x along it) = 1', near(zoneWeightAt(50, H / 2), 1, 1e-9));
const wRot = zoneWeightAt(50, H / 2 + halfRot);
check('perpendicular edge ≈ 0.5–0.62', wRot > 0.5 && wRot < 0.62, `w = ${wRot.toFixed(4)}`);
pointer.angle = Math.PI / 2; // now the line is vertical
check('θ=π/2: weight depends on x only', near(zoneWeightAt(W / 2, 37), 1, 1e-9));
check('θ=π/2: hard zero beyond the reach', zoneWeightAt(W / 2 + halfRot + 8 * CONFIG.lensSoftness + 1, 200) === 0);
console.log('scanPointer (disk, rotate):');
CONFIG.scanShape = 'disk';
const rotO = scanPointer(P / 8);
const rOrb = Math.max(1, Math.min(W, H) / 2 - halfDisk);
check('orbits the centre at r = min(W,H)/2 − core', near(Math.hypot(rotO.x - W / 2, rotO.y - H / 2), rOrb, 1e-9));
CONFIG.scanShape = 'bar';
CONFIG.scanPattern = 'sweep';
FLAGS.scanMode = false; // leave the exported state tidy

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
