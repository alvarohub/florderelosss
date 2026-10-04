/* ============================================================================
 * myBlobChain — web port of `myBlobChain_V2_glow2.pde` (Processing)
 * ============================================================================
 *
 * A Verlet-physics "blob chain": every contour of the text is a closed chain of
 * particles joined by outline springs, blown apart by local repulsion, while a
 * cursor "enzyme lens" re-forms the letters locally by pulling particles back
 * toward their anchors — or, in anchor-capture mode ('a'), each anchor
 * re-captures its own particle once it drifts close enough. Rendered as an
 * additive glow trail + crisp core.
 *
 * STACK (pinned, vendored in ./vendor):
 *   - p5.js 1.11.3      — drawing & main loop. setup()/draw()/keyPressed() map
 *                         1:1 onto the .pde; HSB(100) color mode, PGraphics
 *                         trail, blendMode(ADD) all behave like Processing P2D.
 *   - toxiclibs.js 0.3.3 — THE same physics library the original used via
 *                         toxiclibs for Java (LGPL 2.1). Every formula below
 *                         was checked against the Java sources:
 *                           * VerletPhysics2D() defaults: numIterations=50,
 *                             drag=0, timeStep=1; setDrag(d) => velocity kept
 *                             (1-d) per update, i.e. exactly the Java port.
 *                           * update() order: behaviors -> scaleVelocity ->
 *                             integrate -> 50x spring solver -> clamp bounds.
 *                           * VerletSpring2D.update(): dist=|b-a|+1e-6,
 *                             k=(dist-rest)/(dist*(invWa+invWb))*strength,
 *                             ends move by delta*(+/-k*invW).
 *                           * AttractionBehavior: f = delta
 *                             .normalizeTo(1 - d2/r2).jitter(j).scale(strength*dt)
 *                             with d2 = |delta|^2 (quadratic falloff), added to
 *                             the *other* particle's force — used here with a
 *                             negative strength as repulsion (r=30, s=-10).
 *   - opentype.js       — glyph outlines. It ships inside p5 (reachable as
 *                         `p5.Font.font`), so no extra file is needed.
 *
 * GEOMERATIVE REPLACEMENT: there is no JS port of Geomerative. `extractContours()`
 * below replicates `RG.getText().getPointsInPaths()` with the UNIFORMLENGTH
 * polygonizer: split the opentype path at 'M' commands (one contour per chain),
 * flatten curves, resample uniformly at CONFIG.segLen px. Letters and their
 * holes become independent closed chains, exactly like the original.
 *
 * PERFORMANCE (measured; see README): raw toxiclibs.js runs the ~900-particle
 * sketch at ~20 fps (its n^2 repulsion loop + allocating 50-iteration spring
 * solver). `installFastSolver()` replaces TWO methods on the physics INSTANCE
 * (the vendored file stays pristine). Both replacements are force-identical:
 *   - repulsion: same `applyBehavior()` calls, but only for neighbors found via
 *     a uniform grid; pairs outside the radius contribute exactly zero (the
 *     library's own `d2 < r2` guard). Per-particle force accumulation order is
 *     unchanged (attractor-major, same as the library).
 *   - springs: same formulas and same iteration order, inlined without
 *     allocations.
 * The equivalence is validated numerically in node (bit-exact with jitter off;
 * within stochastic noise with jitter on). `?slow` disables both overrides if
 * you ever want to compare with the raw library.
 *
 * DEVIATIONS from the .pde (all deliberate, see README for details):
 *   - `fixedAttractor` was created but never added to the physics in the .pde
 *     (dead code) — omitted here.
 *   - key '1' (`renderOutlineSprings`) was toggled but never rendered in the
 *     .pde — here it actually draws the outline-spring debug overlay (default
 *     off, so the look matches the original).
 *   - additions: 'h' help panel, 'f' fullscreen, 'b' particle "beads"
 *     (dots on every particle; pulled ones light up), 't' cycles the bundled
 *     fonts (Shrikhand -> Pacifico -> Rubik Bubbles -> Chewy -> Archivo Black),
 *     `?text=` / `?slow` / `?anchors` / `?capture=NN` / `?font=name` URL
 *     params, pointer-position fallback for the (hidden) system cursor.
 *   - NEW 'a' mode — "anchor capture": instead of the cursor lens, every
 *     anchor pulls its own particle in once it comes within a capture radius
 *     (soft edge); neighbors follow through the outline springs and the chain
 *     zips the letter back together, hands-free. See tools/capture-demo.js.
 * URL PARAMS:  ?text=some%20text   ?slow   ?anchors   ?capture=NN   ?font=name   ?beads=0
 * ========================================================================== */
'use strict';

/* ============================== 1. CONFIG ================================ */
/* Mirrors the constants block at the top of the .pde (names kept). */
const CONFIG = {
  W: 900,
  H: 400, // .pde: size(1600, 720, P2D)
  input: 'entangled', //  rrLIFE', // .pde: input
  textSize: 170, // .pde: RG.textFont(fnt, 170)
  offsetX: 80,
  offsetY: 200, // .pde: offset = new Vec2D(80, 390)
  segLen: 3, // .pde: lengthSegmentPoligonizer
  drag: 0.1, // .pde: physics.setDrag(0.4)
  substeps: 5, // .pde: physicsSubsteps
  repulsionRadius: 30, // .pde: AttractionBehavior2D(p, 30, -10, ...)
  repulsionStrength: 0.4, // .pde: repulsionStrength
  repulsionJitter: 0.1, // .pde: jitter argument
  outlineSpringStrength: 0.005, // .pde: outlineSpringStrength
  originSpringStrength: 0.1, // .pde: originSpringStrength (baseline; the lens overwrites it each frame)
  maxAnchorStrength: 0.25, // .pde: maxAnchorStrength
  /* anchor-capture mode (key 'a'): each anchor pulls its own particle in when
   * it comes within anchorCaptureRadius — hands-free letter rebuilding */
  anchorCaptureRadius: 150, // prx — ?capture=NN in the URL to override
  anchorCaptureSoftness: 5, //[] px — width of the smooth border
  anchorCaptureMidpointFrac: 0.4, // where the sigmoid crosses 0.5 (fraction of radius)
  lensRadius: 170, // .pde: lensRadius
  lensSoftness: 40, // .pde: lensSoftness
  lensMidpointFrac: 0.6, // .pde: lensMidpointFrac
  modPeriodMs: 10000, // .pde: modPeriodMs
  modMinFactor: 0.001, // .pde: modMinFactor
  modMaxFactor: 35.0, // .pde: modMaxFactor
  /* web addition — the particle "beads": every particle is drawn as a dot;
   * the ones being pulled (lens / anchor capture) grow and whiten. key 'b'. */
  beadSize: 3.2, // dot size at rest (px)
  beadPullGrow: 3.5, // extra size added at full pull activation
  /* bundled fonts — key 't' cycles live; ?font=name picks one at start */
  fonts: [
    { name: 'Shrikhand', url: 'fonts/Shrikhand-Regular.ttf' },
    { name: 'Pacifico', url: 'fonts/Pacifico-Regular.ttf' },
    { name: 'Rubik Bubbles', url: 'fonts/RubikBubbles-Regular.ttf' },
    { name: 'Chewy', url: 'fonts/Chewy-Regular.ttf' },
    { name: 'Archivo Black', url: 'fonts/ArchivoBlack-Regular.ttf' },
  ],
  fontIndex: 1,
  fastSolver: true, // install the instance-level fast overrides
};

const CONFIG_1 = {
  W: 900,
  H: 400, // .pde: size(1600, 720, P2D)
  input: 'Cassinelli', // .pde: input
  textSize: 170, // .pde: RG.textFont(fnt, 170)
  offsetX: 80,
  offsetY: 200, // .pde: offset = new Vec2D(80, 390)
  segLen: 3, // .pde: lengthSegmentPoligonizer
  drag: 0.4, // .pde: physics.setDrag(0.4)
  substeps: 8, // .pde: physicsSubsteps
  repulsionRadius: 30, // .pde: AttractionBehavior2D(p, 30, -10, ...)
  repulsionStrength: 10, // .pde: repulsionStrength
  repulsionJitter: 0.001, // .pde: jitter argument
  outlineSpringStrength: 0.1, // .pde: outlineSpringStrength
  originSpringStrength: 0.001, // .pde: originSpringStrength (baseline; the lens overwrites it each frame)
  maxAnchorStrength: 0.25, // .pde: maxAnchorStrength
  lensRadius: 180, // .pde: lensRadius
  lensSoftness: 40, // .pde: lensSoftness
  lensMidpointFrac: 0.6, // .pde: lensMidpointFrac
  modPeriodMs: 10000, // .pde: modPeriodMs
  modMinFactor: 0.01, // .pde: modMinFactor
  modMaxFactor: 15.0, // .pde: modMaxFactor
  fontUrl: 'fonts/ArchivoBlack-Regular.ttf', // ReplicaBold is commercial; see README
  fastSolver: true, // install the instance-level fast overrides
};

/* --- URL parameters ------------------------------------------------------ */
const _params = typeof location !== 'undefined' && location.search ? new URLSearchParams(location.search) : null;
if (_params) {
  const _t = _params.get('text');
  if (_t) CONFIG.input = _t;
  if (_params.has('slow')) CONFIG.slow = true;
  const _cap = parseFloat(_params.get('capture'));
  if (_cap > 0) CONFIG.anchorCaptureRadius = _cap;
  const _fn = (_params.get('font') || '').toLowerCase();
  if (_fn && CONFIG.fonts) {
    const _fi = CONFIG.fonts.findIndex((f) => f.name.toLowerCase().startsWith(_fn));
    if (_fi >= 0) CONFIG.fontIndex = _fi;
  }
}
CONFIG.slow = !!CONFIG.slow;

/* ======================== 2. FLAGS (from the .pde) ======================= */

const flags = {
  attractToOrigin: true, // .pde: attractToOrigin
  attractMode: 'cursor', // 'cursor' | 'anchor' (key 'a'; ?anchors in the URL)
  modulateSprings: true, // .pde: modulateSprings
  showCursor: false, // .pde: showCursor (setup() called noCursor())
  lensEnabled: true, // .pde: lensEnabled
  showLensRing: false, // .pde: showLensRing
  renderOutlineSprings: false, // .pde default was true but never rendered; here it draws, so start off
  renderOriginSprings: false, // .pde: renderOriginSprings
  trailFade: 255, // .pde: int trailFade

  visualLerp: 0.05, // .pde: float visualLerp
  showBeads: true, // web addition: draw the particle "beads" (key 'b')
};
if (_params && _params.has('anchors')) flags.attractMode = 'anchor';
if (_params && _params.has('beads')) flags.showBeads = _params.get('beads') !== '0';

/* ================== 3. PURE HELPERS (node-testable) ====================== */

function clampTo(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function mapRange(v, a, b, c, d) {
  return c + (d - c) * ((v - a) / (b - a));
}

/* .pde: descendingSigmoid() — decreasing 1 -> 0 sigmoid */
function descendingSigmoid(x) {
  return 1.0 / (1.0 + Math.exp(clampTo(x, -60, 60)));
}

/* Anchor-capture weight: 1 at the anchor, 0 at (and beyond) `radius`, smooth
 * in between — the same normalized descending-sigmoid shape as the enzyme
 * lens, but measured between a blob particle and ITS OWN anchor. This is the
 * "capture radius" of anchor-capture mode: when a particle drifts close
 * enough, its origin spring engages and pulls it home. */
function anchorCaptureWeight(px, py, ax, ay, radius, softness, midpointFrac) {
  const r = Math.max(1.0, radius);
  const soft = clampTo(softness, 1.0, r);
  const d = Math.hypot(px - ax, py - ay);
  if (d >= r) return 0;
  const midpoint = r * midpointFrac;
  const value = descendingSigmoid((d - midpoint) / soft);
  const centre = descendingSigmoid(-midpoint / soft);
  const edge = descendingSigmoid((r - midpoint) / soft);
  return clampTo((value - edge) / (centre - edge), 0, 1);
}

/* --- glyph outline extraction (Geomerative replacement) ------------------ */

/* Flatten opentype path commands into one point list per contour ('M' starts
 * a new contour; 'Z' closes implicitly — chains close themselves). */
function flattenCommands(commands) {
  const contours = [];
  let cur = null;
  let cx = 0,
    cy = 0;
  const cubicAt = (t, p0x, p0y, c1x, c1y, c2x, c2y, p1x, p1y) => {
    const u = 1 - t;
    const a = u * u * u,
      b = 3 * u * u * t,
      c = 3 * u * t * t,
      d = t * t * t;
    return { x: a * p0x + b * c1x + c * c2x + d * p1x, y: a * p0y + b * c1y + c * c2y + d * p1y };
  };
  const quadAt = (t, p0x, p0y, c1x, c1y, p1x, p1y) => {
    const u = 1 - t;
    const a = u * u,
      b = 2 * u * t,
      c = t * t;
    return { x: a * p0x + b * c1x + c * p1x, y: a * p0y + b * c1y + c * p1y };
  };
  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
        cur = [{ x: cmd.x, y: cmd.y }];
        contours.push(cur);
        cx = cmd.x;
        cy = cmd.y;
        break;
      case 'L':
        if (!cur) break;
        cur.push({ x: cmd.x, y: cmd.y });
        cx = cmd.x;
        cy = cmd.y;
        break;
      case 'C': {
        if (!cur) break;
        const approx =
          Math.hypot(cmd.x1 - cx, cmd.y1 - cy) +
          Math.hypot(cmd.x2 - cmd.x1, cmd.y2 - cmd.y1) +
          Math.hypot(cmd.x - cmd.x2, cmd.y - cmd.y2);
        const steps = clampTo(Math.ceil(approx / 2), 4, 64);
        for (let s = 1; s <= steps; s++) {
          cur.push(cubicAt(s / steps, cx, cy, cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y));
        }
        cx = cmd.x;
        cy = cmd.y;
        break;
      }
      case 'Q': {
        if (!cur) break;
        const approx = Math.hypot(cmd.x1 - cx, cmd.y1 - cy) + Math.hypot(cmd.x - cmd.x1, cmd.y - cmd.y1);
        const steps = clampTo(Math.ceil(approx / 2), 4, 64);
        for (let s = 1; s <= steps; s++) {
          cur.push(quadAt(s / steps, cx, cy, cmd.x1, cmd.y1, cmd.x, cmd.y));
        }
        cx = cmd.x;
        cy = cmd.y;
        break;
      }
      case 'Z':
      default:
        break;
    }
  }
  return contours;
}

/* Uniform arc-length resampling of a CLOSED polyline (the UNIFORMLENGTH
 * polygonizer behaviour): one point every `step` px, last gap = remainder. */
function resampleClosed(pts, step) {
  const n = pts.length;
  if (n < 2 || !(step > 0)) return pts.slice();
  const out = [{ x: pts[0].x, y: pts[0].y }];
  let carry = 0;
  let px = pts[0].x,
    py = pts[0].y;
  for (let i = 1; i <= n; i++) {
    const q = pts[i % n]; // wraps to close the contour
    let dx = q.x - px,
      dy = q.y - py;
    let seg = Math.sqrt(dx * dx + dy * dy);
    while (carry + seg >= step && seg > 0) {
      const f = (step - carry) / seg;
      px += dx * f;
      py += dy * f;
      out.push({ x: px, y: py });
      dx = q.x - px;
      dy = q.y - py;
      seg = Math.sqrt(dx * dx + dy * dy);
      carry = 0;
    }
    carry += seg;
    px = q.x;
    py = q.y;
  }
  // drop a closing duplicate that landed exactly on the start point
  if (out.length > 2) {
    const lx = out[out.length - 1].x - out[0].x;
    const ly = out[out.length - 1].y - out[0].y;
    if (lx * lx + ly * ly < 1e-9) out.pop();
  }
  return out;
}

/* Text -> array of contours (each an array of {x,y}), in canvas coordinates.
 * `font` is an opentype.js font object (p5.Font.font in the browser).
 * Auto-fits the size if the ink would overflow `maxWidth`. */
function extractContours(font, text, size, segLen, offsetX, offsetY, maxWidth) {
  let path = font.getPath(text, 0, 0, size); // baseline at y=0, y-down — like RG.getText
  const bb = path.getBoundingBox();
  const inkW = bb.x2 - bb.x1;
  if (maxWidth && inkW > maxWidth) {
    size = size * (maxWidth / inkW);
    path = font.getPath(text, 0, 0, size);
  }
  const raw = flattenCommands(path.commands);
  const contours = [];
  for (const pts of raw) {
    const rs = resampleClosed(pts, segLen);
    if (rs.length >= 3) {
      for (const p of rs) {
        p.x += offsetX;
        p.y += offsetY;
      }
      contours.push(rs);
    }
  }
  return contours;
}

/* --- fast solver (instance-level, formula-identical to the library) ------ */

function installFastSolver(physics, opts) {
  const opt = opts || {};
  const cellSize = opt.cellSize || 30;
  const worldW = opt.worldWidth || 1600;
  const worldH = opt.worldHeight || 720;
  const cols = Math.max(1, Math.ceil(worldW / cellSize));
  const rows = Math.max(1, Math.ceil(worldH / cellSize));
  const head = new Int32Array(cols * rows);
  let next = new Int32Array(0);

  function buildGrid(particles) {
    if (next.length < particles.length) next = new Int32Array(particles.length * 2);
    head.fill(-1);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const cx = clampTo(Math.floor(p.x / cellSize), 0, cols - 1);
      const cy = clampTo(Math.floor(p.y / cellSize), 0, rows - 1);
      const c = cy * cols + cx;
      next[i] = head[c];
      head[c] = i;
    }
  }

  /* Replaces VerletPhysics2D.updateParticles():
   *   1. behaviors — same applyBehavior() calls, same attractor-major order;
   *      only pairs within the radius are visited (grid 3x3 reach, safe since
   *      radius <= cellSize; d >= radius contributes exactly zero anyway).
   *   2. scaleVelocity(drag) + update() per particle — library calls, as-is. */
  physics.updateParticles = function () {
    const particles = this.particles;
    const n = particles.length;
    const bLen = this.behaviors.length;
    if (bLen > 0 && n > 0) {
      buildGrid(particles);
      for (let i = 0; i < bLen; i++) {
        const b = this.behaviors[i];
        const r = b.radius;
        if (r === undefined || r > cellSize) {
          // non-radial behavior or bigger reach than the grid: full sweep
          for (let j = 0; j < n; j++) b.applyBehavior(particles[j]);
          continue;
        }
        const ax = b.attractor.x;
        const ay = b.attractor.y;
        const cx = clampTo(Math.floor(ax / cellSize), 0, cols - 1);
        const cy = clampTo(Math.floor(ay / cellSize), 0, rows - 1);
        const gy0 = Math.max(0, cy - 1),
          gy1 = Math.min(rows - 1, cy + 1);
        const gx0 = Math.max(0, cx - 1),
          gx1 = Math.min(cols - 1, cx + 1);
        for (let gy = gy0; gy <= gy1; gy++) {
          const row = gy * cols;
          for (let gx = gx0; gx <= gx1; gx++) {
            for (let q = head[row + gx]; q !== -1; q = next[q]) {
              b.applyBehavior(particles[q]);
            }
          }
        }
      }
    }
    for (let j = 0; j < n; j++) {
      const p = particles[j];
      p.scaleVelocity(this.drag);
      p.update();
    }
  };

  /* Replaces VerletPhysics2D.updateSprings():
   *   for it = numIterations..1 { for each spring: VerletSpring2D.update() math }
   * Same formulas (incl. EPS 1e-6, inverse-weight correction, locked ends) and
   * same order, inlined without vector allocations. Per-particle constraints
   * (never used by this sketch) are a no-op, so the applyConstraints tail of
   * the last iteration is skipped. */
  physics.updateSprings = function () {
    const springs = this.springs;
    const sLen = springs.length;
    if (sLen === 0) return;
    const EPS = 1e-6;
    for (let it = this.numIterations; it > 0; it--) {
      for (let j = 0; j < sLen; j++) {
        const s = springs[j];
        const a = s.a,
          b = s.b;
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + EPS;
        const k = ((dist - s.restLength) / (dist * (a.invWeight + b.invWeight))) * s.strength;
        if (!a.isLocked && !s.isALocked) {
          const m = k * a.invWeight;
          a.x += dx * m;
          a.y += dy * m;
        }
        if (!b.isLocked && !s.isBLocked) {
          const m = k * b.invWeight;
          b.x -= dx * m;
          b.y -= dy * m;
        }
      }
    }
  };

  physics.__fastSolver = true;
}

/* --- physics construction from contours (shared with the node validation) -- */

/* .pde resetPositionsToOrigin() (without the trail clear — that's browser-only) */
function resetParticles(pathP, origP, vis) {
  for (let ii = 0; ii < pathP.length; ii++) {
    for (let i = 0; i < pathP[ii].length; i++) {
      const p = pathP[ii][i];
      p.set(origP[ii][i]);
      p.clearVelocity();
      p.clearForce();
      if (vis) {
        vis[ii][i].x = p.x;
        vis[ii][i].y = p.y;
      }
    }
  }
}

/* Port of .pde initPhysics() body: anchors (locked), free particles, origin
 * springs, then repulsion behaviors + outline springs (incl. closing spring).
 * Springs/behaviors are created in the same order as the .pde. Returns all the
 * parallel arrays the rest of the sketch needs. `toxi` must be global. */
function buildLetterPhysics(physics, contours, C) {
  const out = {
    pathParticles: [],
    originalPathParticles: [],
    visual: [],
    originSprings: [],
    outlineSprings: [],
    repulsionBehaviors: [],
  };

  // pass 1 — anchors + free particles + origin springs
  for (let ii = 0; ii < contours.length; ii++) {
    const pts = contours[ii];
    const anchors = [],
      free = [],
      vis = [];
    for (let i = 0; i < pts.length; i++) {
      const anchor = new toxi.physics2d.VerletParticle2D(pts[i].x, pts[i].y).lock();
      const p = new toxi.physics2d.VerletParticle2D(0, 0);
      physics.addParticle(p);
      anchors.push(anchor);
      free.push(p);
      vis.push({ x: pts[i].x, y: pts[i].y });
      // rest length 0 -> particle seeks the anchor itself
      out.originSprings.push(new toxi.physics2d.VerletSpring2D(p, anchor, 0, C.originSpringStrength));
    }
    out.originalPathParticles.push(anchors);
    out.pathParticles.push(free);
    out.visual.push(vis);
  }

  resetParticles(out.pathParticles, out.originalPathParticles, out.visual);

  // pass 2 — repulsion behaviors + outline springs
  const addOutline = (a, b) => {
    const s = new toxi.physics2d.VerletSpring2D(a, b, 1.1 * a.distanceTo(b), C.outlineSpringStrength);
    physics.addSpring(s);
    out.outlineSprings.push(s);
  };
  for (let ii = 0; ii < out.pathParticles.length; ii++) {
    const pp = out.pathParticles[ii];
    for (let i = 0; i < pp.length; i++) {
      const rep = new toxi.physics2d.behaviors.AttractionBehavior(
        pp[i],
        C.repulsionRadius,
        -C.repulsionStrength,
        C.repulsionJitter,
      );
      physics.addBehavior(rep); // library configures attrStrength = strength * timeStep (1)
      out.repulsionBehaviors.push(rep);
      if (i > 0) addOutline(pp[i - 1], pp[i]);
    }
    if (pp.length > 1) addOutline(pp[0], pp[pp.length - 1]);
  }

  return out;
}

/* ======================= 4. p5 SKETCH (global mode) ====================== */

let blobFont = null; // active p5.Font (blobFonts[CONFIG.fontIndex])
let blobFonts = []; // all bundled fonts, loaded in preload()
let physics = null;
let trail = null; // .pde: PGraphics trail
let pathParticles = null; // .pde: VerletParticle2D[][] pathParticles
let originalPathParticles = null; // .pde: anchors
let visual = null; // .pde: PVector[][] visual (smoothed)
let originSprings = [];
let originActivations = []; // per origin spring: current capture/lens weight (for drawing)
let outlineSprings = [];
let repulsionBehaviors = [];
let cnvEl = null,
  hudEl = null,
  hintEl = null,
  fatalEl = null;
let ready = false;
const pointer = { x: 0, y: 0 }; // .pde: mouseX / mouseY (logical canvas px)
const state = { fps: 0, errors: [] };
let _fpsFrames = 0,
  _fpsTime = 0;

/* --- p5 lifecycle -------------------------------------------------------- */

function preload() {
  const list = CONFIG.fonts || [{ name: 'Archivo Black', url: CONFIG.fontUrl }];
  blobFonts = list.map((f) => loadFont(f.url));
}

function setup() {
  const cnv = createCanvas(CONFIG.W, CONFIG.H);
  cnv.parent('sketch');
  cnvEl = cnv.elt;
  pixelDensity(1); // logical-resolution backing store; CSS scales to fit
  frameRate(60); // the .pde ran at Processing's 60 fps
  colorMode(HSB, 100); // .pde: colorMode(HSB, 100)

  hudEl = document.getElementById('hud');
  hintEl = document.getElementById('hint');
  fatalEl = document.getElementById('fatal');
  applyCursor(); // .pde: noCursor()
  blobFont = blobFonts[CONFIG.fontIndex || 0] || blobFonts.find((f) => f && f.font);

  if (typeof toxi === 'undefined') {
    showFatal('toxiclibs.js did not load.\nCheck vendor/toxiclibs.min.js.');
    return;
  }
  if (!blobFont || !blobFont.font) {
    showFatal(
      'Could not load the fonts —\n' +
        (CONFIG.fonts || []).map((f) => f.url).join('\n') +
        '\n(keep the fonts/ folder next to index.html, and run from a local server)',
    );
    return;
  }

  trail = createGraphics(CONFIG.W, CONFIG.H); // .pde: createGraphics(width, height, JAVA2D)
  trail.pixelDensity(1);
  trail.colorMode(HSB, 100);
  trail.background(0);

  initPhysics();

  fitCanvas();
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerdown', onPointerMove);
  setTimeout(() => {
    if (hintEl) hintEl.style.opacity = '0';
  }, 8000);
  ready = true;
}

function windowResized() {
  fitCanvas();
}

/* .pde initPhysics() — object creation order matches the .pde */
function initPhysics() {
  physics = new toxi.physics2d.VerletPhysics2D(); // defaults: numIterations=50, timeStep=1
  physics.setWorldBounds(new toxi.geom.Rect(0, 0, CONFIG.W, CONFIG.H)); // .pde: Rect(0,0,width,height)
  physics.setDrag(CONFIG.drag); // .pde: setDrag(0.4)

  const contours = extractContours(
    blobFont.font,
    CONFIG.input,
    CONFIG.textSize,
    CONFIG.segLen,
    CONFIG.offsetX,
    CONFIG.offsetY,
    CONFIG.W - CONFIG.offsetX - 40,
  );

  const built = buildLetterPhysics(physics, contours, CONFIG);
  pathParticles = built.pathParticles;
  originalPathParticles = built.originalPathParticles;
  visual = built.visual;
  originSprings = built.originSprings;
  outlineSprings = built.outlineSprings;
  originActivations = new Array(originSprings.length).fill(0);
  repulsionBehaviors = built.repulsionBehaviors;

  if (CONFIG.fastSolver && !CONFIG.slow) {
    installFastSolver(physics, {
      cellSize: CONFIG.repulsionRadius,
      worldWidth: CONFIG.W,
      worldHeight: CONFIG.H,
    });
  }

  applyAttractToOrigin();
  applyEnzymeLens();
}

/* .pde draw() — same order of operations */
function draw() {
  if (!ready) {
    background(0);
    return;
  }

  applyAttractToOrigin();
  applyEnzymeLens();

  for (let i = 0; i < CONFIG.substeps; i++) physics.update();

  // smoothed visual positions — .pde: visual.lerp(p.x, p.y, 0, visualLerp)
  for (let ii = 0; ii < pathParticles.length; ii++) {
    const pp = pathParticles[ii],
      vv = visual[ii];
    for (let i = 0; i < pp.length; i++) {
      vv[i].x += (pp[i].x - vv[i].x) * flags.visualLerp;
      vv[i].y += (pp[i].y - vv[i].y) * flags.visualLerp;
    }
  }

  // 1. trail buffer
  trail.blendMode(BLEND);
  trail.noStroke();
  trail.fill(0, 0, 0, flags.trailFade);
  trail.rect(0, 0, CONFIG.W, CONFIG.H);
  trail.blendMode(ADD);
  drawAllPaths(trail, true);
  trail.blendMode(BLEND);

  // 2. composite to screen
  background(0);
  blendMode(ADD);
  image(trail, 0, 0);
  blendMode(BLEND);

  // 3. crisp core
  drawAllPaths(null, false);

  // 3b. particle "beads" (web addition, key 'b') — a dot on every particle;
  //     the ones being pulled by the lens / capture grow and whiten
  if (flags.showBeads) drawBeads();

  // 4. debug overlays
  if (flags.renderOriginSprings) drawOriginSprings(null);
  if (flags.renderOutlineSprings) drawOutlineSprings(null);

  // 5. lens / capture indicator
  if (flags.showLensRing && flags.lensEnabled) {
    if (flags.attractMode === 'anchor') drawCaptureField();
    else drawLensRing(null);
  }

  updateFps();
}

/* .pde keyPressed() — same keys, plus web additions (f, h) */
function keyPressed() {
  if (!ready) return;
  if (key === '0') {
    resetPositionsToOrigin();
  } else if (key === ' ') {
    flags.attractToOrigin = !flags.attractToOrigin;
  } else if (key === 'a' || key === 'A') {
    flags.attractMode = flags.attractMode === 'anchor' ? 'cursor' : 'anchor';
  } else if (key === 'c' || key === 'C') {
    flags.showCursor = !flags.showCursor;
    applyCursor();
  } else if (key === 'm' || key === 'M') {
    flags.modulateSprings = !flags.modulateSprings;
  } else if (key === 'l' || key === 'L') {
    flags.lensEnabled = !flags.lensEnabled;
  } else if (key === 'r' || key === 'R') {
    flags.showLensRing = !flags.showLensRing;
  } else if (key === '1') {
    flags.renderOutlineSprings = !flags.renderOutlineSprings;
  } else if (key === '2') {
    flags.renderOriginSprings = !flags.renderOriginSprings;
  } else if (key === '[') {
    flags.trailFade = Math.max(2, flags.trailFade - 5); // .pde: trailFade = max(2, trailFade - 5)
  } else if (key === ']') {
    flags.trailFade = Math.min(255, flags.trailFade + 5); // .pde: trailFade = min(255, trailFade + 5)
  } else if (key === ',') {
    flags.visualLerp = Math.max(0.05, flags.visualLerp - 0.05);
  } else if (key === 'b' || key === 'B') {
    flags.showBeads = !flags.showBeads; // web addition
  } else if (key === '.') {
    flags.visualLerp = Math.min(0.9, flags.visualLerp + 0.05);
  } else if (key === 't' || key === 'T') {
    cycleFont(); // web addition
  } else if (key === 'f' || key === 'F') {
    fullscreen(!fullscreen()); // web addition
  } else if (key === 'h' || key === 'H' || key === '?') {
    toggleHud();
  } else {
    return;
  }
  updateHud();
  return false;
}

/* --- .pde behaviour helpers ---------------------------------------------- */

function applyAttractToOrigin() {
  if (originSprings.length === 0) return;
  const inPhysics = physics.springs.indexOf(originSprings[0]) >= 0;
  if (inPhysics === flags.attractToOrigin) return;
  for (const s of originSprings) {
    if (flags.attractToOrigin) physics.addSpring(s);
    else physics.removeSpring(s);
  }
}
/* Origin-spring drive — .pde applyEnzymeLens(), generalized to two sources:
 *   'cursor' mode: weight = enzymeWeight(particle position) — the original
 *                  mouse-centred enzyme lens;
 *   'anchor' mode: weight = anchorCaptureWeight(|particle − its own anchor|)
 *                  — hands-free capture: once a blob particle drifts within
 *                  the capture radius of its anchor it gets pulled home; its
 *                  neighbors follow through the outline springs, so the chain
 *                  zips the letter back together.
 * Outline springs and repulsion only get the temporal modulation. */
function applyEnzymeLens() {
  let outlineFactor = 1.0,
    repulsionFactor = 1.0;
  if (flags.modulateSprings) {
    const phase = Math.PI * 2 * (millis() / CONFIG.modPeriodMs);
    outlineFactor = mapRange(Math.sin(phase), -1, 1, CONFIG.modMinFactor, CONFIG.modMaxFactor);
    repulsionFactor = outlineFactor;
  }

  const anchorMode = flags.attractMode === 'anchor';
  for (let i = 0; i < originSprings.length; i++) {
    const s = originSprings[i];
    let activation = 0;
    if (flags.lensEnabled) {
      activation = anchorMode
        ? anchorCaptureWeight(
            s.a.x,
            s.a.y,
            s.b.x,
            s.b.y,
            CONFIG.anchorCaptureRadius,
            CONFIG.anchorCaptureSoftness,
            CONFIG.anchorCaptureMidpointFrac,
          )
        : enzymeWeight(s.a.x, s.a.y);
    }
    originActivations[i] = activation;
    s.setStrength(CONFIG.maxAnchorStrength * activation);
  }
  for (const s of outlineSprings) {
    s.setStrength(CONFIG.outlineSpringStrength * outlineFactor);
  }
  for (let k = 0; k < repulsionBehaviors.length; k++) {
    repulsionBehaviors[k].setStrength(-CONFIG.repulsionStrength * repulsionFactor);
  }
}

/* .pde enzymeWeight() — smoothstepped, normalized lens weight */
function enzymeWeight(x, y) {
  if (!flags.lensEnabled) return 0;
  if (pointer.x < 0 || pointer.x >= CONFIG.W || pointer.y < 0 || pointer.y >= CONFIG.H) return 0;

  const radius = Math.max(1.0, CONFIG.lensRadius);
  const softness = clampTo(CONFIG.lensSoftness, 1.0, radius);
  const d = Math.hypot(x - pointer.x, y - pointer.y);
  if (d >= radius) return 0;

  const midpoint = radius * CONFIG.lensMidpointFrac;
  const value = descendingSigmoid((d - midpoint) / softness);
  const centre = descendingSigmoid(-midpoint / softness);
  const edge = descendingSigmoid((radius - midpoint) / softness);
  return clampTo((value - edge) / (centre - edge), 0, 1);
}

/* --- rendering helpers (same draw order/weights/alphas as the .pde) ------- */

function drawAllPaths(g, glow) {
  if (!pathParticles) return;
  const one = (pts, h, s, b, a, w) => {
    if (g) {
      g.strokeWeight(w);
      g.stroke(h, s, b, a);
      g.beginShape();
    } else {
      strokeWeight(w);
      stroke(h, s, b, a);
      beginShape();
    }
    for (let i = 0; i < pts.length; i++) {
      if (g) g.vertex(pts[i].x, pts[i].y);
      else vertex(pts[i].x, pts[i].y);
    }
    if (g) {
      g.vertex(pts[0].x, pts[0].y);
      g.endShape();
    } else {
      vertex(pts[0].x, pts[0].y);
      endShape();
    }
  };
  if (g) {
    g.noFill();
    g.strokeCap(ROUND);
    g.strokeJoin(ROUND);
  } else {
    noFill();
    strokeCap(ROUND);
    strokeJoin(ROUND);
  }

  for (let ii = 0; ii < visual.length; ii++) {
    const pts = visual[ii];
    if (!pts || pts.length < 2) continue;
    const hue = (ii * 37) % 100; // .pde: (ii * 37) % 100
    if (glow) {
      one(pts, hue, 90, 100, 12, 9); // wide, faint
      one(pts, hue, 90, 100, 28, 4.5); // narrow, brighter
    } else {
      one(pts, hue, 25, 100, 100, 1.4); // crisp pale core
    }
  }
}

/* web addition: the particle "beads" — every particle drawn as a dot on the
 * smoothed chain, so the letter reads as a string of beads. Beads currently
 * being pulled (activation > 0) grow and whiten; activation is evaluated at
 * the particle position with the SAME weight function the physics uses
 * (enzymeWeight in cursor mode, anchorCaptureWeight in anchor mode), so what
 * lights up is exactly what is being pulled. Watch a pulled bead drag its
 * neighbours along through the outline springs. */
function drawBeads() {
  if (!visual) return;
  const anchorMode = flags.attractMode === 'anchor';
  const base = CONFIG.beadSize;
  for (let ii = 0; ii < visual.length; ii++) {
    const pts = visual[ii];
    if (!pts || pts.length < 2) continue;
    const hue = (ii * 37) % 100; // same hue as the chain
    const anchors = originalPathParticles ? originalPathParticles[ii] : null;

    // pass A — the whole string of beads: DARK dots on the glowing wire,
    // so they read against both the pale core and the saturated glow
    strokeWeight(base);
    stroke(hue, 100, 30, 90);
    for (let i = 0; i < pts.length; i++) point(pts[i].x, pts[i].y);

    // pass B — beads being pulled: grow + whiten (saturation -> 0)
    for (let i = 0; i < pts.length; i++) {
      let w = 0;
      if (flags.lensEnabled) {
        w =
          anchorMode && anchors
            ? anchorCaptureWeight(
                pts[i].x,
                pts[i].y,
                anchors[i].x,
                anchors[i].y,
                CONFIG.anchorCaptureRadius,
                CONFIG.anchorCaptureSoftness,
                CONFIG.anchorCaptureMidpointFrac,
              )
            : enzymeWeight(pts[i].x, pts[i].y);
      }
      if (w <= 0.04) continue;
      strokeWeight(base + CONFIG.beadPullGrow * w);
      stroke(hue, 100 * (1 - w), 30 + 70 * w, 100); // dark -> blazing white as w -> 1
      point(pts[i].x, pts[i].y);
    }
  }
}

function drawOriginSprings() {
  strokeWeight(1);
  let indexCol = 0; // .pde increments a float per spring
  for (const s of originSprings) {
    stroke((indexCol + 50) % 100, 100, 100, 60);
    line(s.a.x, s.a.y, s.b.x, s.b.y);
    indexCol++;
  }
}

/* web addition: the .pde toggled renderOutlineSprings but never drew it */
function drawOutlineSprings() {
  strokeWeight(1);
  stroke(0, 0, 100, 18);
  for (const s of outlineSprings) line(s.a.x, s.a.y, s.b.x, s.b.y);
}

function drawLensRing() {
  noFill();
  strokeWeight(1);
  stroke(0, 0, 85, 40);
  ellipse(pointer.x, pointer.y, CONFIG.lensRadius * 2, CONFIG.lensRadius * 2);
  // faint inner ring at the sigmoid midpoint, so the "core" is visible
  stroke(0, 0, 100, 25);
  ellipse(
    pointer.x,
    pointer.y,
    CONFIG.lensRadius * 2 * CONFIG.lensMidpointFrac,
    CONFIG.lensRadius * 2 * CONFIG.lensMidpointFrac,
  );
  strokeWeight(2);
  stroke(0, 0, 100, 70);
  point(pointer.x, pointer.y);
}

/* anchor-capture mode: shows the CAPTURE FRONT — anchors whose pull is in
 * transition (0.03 < w < 0.92) get a faint circle (alpha ∝ activation) plus a
 * brighter dot. Fully-captured anchors drop out, so once a letter is rebuilt
 * its outline stays clean; during the rebuild you see the zone sweeping along
 * the chain. */
function drawCaptureField() {
  const R = CONFIG.anchorCaptureRadius;
  noFill();
  strokeWeight(1);
  for (let i = 0; i < originSprings.length; i++) {
    const w = originActivations[i];
    if (w <= 0.03 || w >= 0.92) continue;
    const b = originSprings[i].b;
    stroke(0, 0, 100, 8 + 50 * w);
    ellipse(b.x, b.y, R * 2, R * 2);
  }
  strokeWeight(2);
  for (let i = 0; i < originSprings.length; i++) {
    const w = originActivations[i];
    if (w <= 0.03 || w >= 0.92) continue;
    const b = originSprings[i].b;
    stroke(0, 0, 100, 25 + 80 * w);
    point(b.x, b.y);
  }
  strokeWeight(1);
}

/* --- misc ---------------------------------------------------------------- */

/* .pde resetPositionsToOrigin() + trail clear (key '0') */
function resetPositionsToOrigin() {
  if (!originalPathParticles || !pathParticles) return;
  resetParticles(pathParticles, originalPathParticles, visual);
  clearTrail();
}

function clearTrail() {
  if (!trail) return;
  trail.blendMode(BLEND);
  trail.noStroke();
  trail.fill(0, 0, 0, 255);
  trail.rect(0, 0, CONFIG.W, CONFIG.H);
}

/* web addition: cycle through the bundled fonts (all preloaded) and rebuild
 * the physics from the new letter outlines — the trail is cleared so each
 * font starts clean */
function cycleFont() {
  const n = blobFonts.length;
  if (!CONFIG.fonts || n < 2) return;
  let i = CONFIG.fontIndex;
  for (let k = 0; k < n; k++) {
    i = (i + 1) % n;
    if (blobFonts[i] && blobFonts[i].font) break;
  }
  CONFIG.fontIndex = i;
  blobFont = blobFonts[i];
  initPhysics();
  clearTrail();
}

/* letterbox-fit the 1600x720 canvas into the window (aspect preserved) */
function fitCanvas() {
  if (!cnvEl) return;
  const s = Math.min(window.innerWidth / CONFIG.W, window.innerHeight / CONFIG.H);
  cnvEl.style.width = Math.round(CONFIG.W * s) + 'px';
  cnvEl.style.height = Math.round(CONFIG.H * s) + 'px';
}

/* map the pointer into logical canvas coordinates (.pde mouseX/mouseY) */
function onPointerMove(e) {
  if (!cnvEl) return;
  const r = cnvEl.getBoundingClientRect();
  if (!r.width || !r.height) return;
  pointer.x = (e.clientX - r.left) * (CONFIG.W / r.width);
  pointer.y = (e.clientY - r.top) * (CONFIG.H / r.height);
}

function applyCursor() {
  if (cnvEl) cnvEl.style.cursor = flags.showCursor ? 'default' : 'none';
}

function updateFps() {
  const now = performance.now();
  if (_fpsTime === 0) {
    _fpsTime = now;
    return;
  }
  _fpsFrames++;
  const elapsed = now - _fpsTime;
  if (elapsed >= 1000) {
    state.fps = Math.round((_fpsFrames * 1000) / elapsed);
    _fpsFrames = 0;
    _fpsTime = now;
  }
}

/* --- help panel ---------------------------------------------------------- */

function toggleHud() {
  if (!hudEl) return;
  hudEl.classList.toggle('on');
  if (hintEl && hudEl.classList.contains('on')) hintEl.style.opacity = '0';
  updateHud();
}

function hudText() {
  const yn = (v) => (v ? 'ON' : 'OFF');
  return [
    '0      reset positions + clear trail',
    'space  attract-to-origin     ' + yn(flags.attractToOrigin),
    'a      attraction source     ' +
      (flags.attractMode === 'anchor'
        ? 'anchor capture (R ' + Math.round(CONFIG.anchorCaptureRadius) + ')'
        : 'cursor lens'),
    'c      cursor                ' + (flags.showCursor ? 'shown' : 'hidden'),
    'm      temporal modulation   ' + yn(flags.modulateSprings),
    'l      ' +
      (flags.attractMode === 'anchor' ? 'anchor capture        ' : 'enzyme lens           ') +
      yn(flags.lensEnabled),
    'r      ' +
      (flags.attractMode === 'anchor' ? 'capture field         ' : 'lens ring             ') +
      yn(flags.showLensRing),
    '1      outline springs       ' + yn(flags.renderOutlineSprings),
    '2      origin springs        ' + yn(flags.renderOriginSprings),
    '[ ]    trail fade            ' + flags.trailFade,
    ', .    visual lerp           ' + flags.visualLerp.toFixed(2),
    'b      beads                 ' + yn(flags.showBeads),
    't      font                  ' +
      (CONFIG.fonts && CONFIG.fonts[CONFIG.fontIndex] ? CONFIG.fonts[CONFIG.fontIndex].name : 'n/a'),
    'f      fullscreen',
    'h      hide this panel',
    '',
    'solver: toxiclibs.js' + (physics && physics.__fastSolver ? ' + fast overrides' : ' (raw)' + ''),
    'text:   "' + CONFIG.input + '"   (?text=… in the URL to change)',
  ].join('\n');
}

function updateHud() {
  if (hudEl && hudEl.classList.contains('on')) hudEl.textContent = hudText();
}

function showFatal(msg) {
  state.errors.push(msg);
  if (fatalEl) {
    fatalEl.textContent = msg;
    fatalEl.style.display = 'grid';
  }
}

/* --- debug / automation hook (used by the test harness; handy in the console) */
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => state.errors.push(String(e.message || e.error || e)));
  window.addEventListener('unhandledrejection', (e) => state.errors.push(String(e.reason)));

  window.__BC = {
    CONFIG,
    flags,
    state,
    get ready() {
      return ready;
    },
    status() {
      return {
        ready: ready,
        fps: state.fps,
        errors: state.errors.slice(),
        input: CONFIG.input,
        solver: physics && physics.__fastSolver ? 'fast' : 'raw',
        contours: pathParticles ? pathParticles.length : 0,
        particles: physics ? physics.particles.length : 0,
        springs: physics ? physics.springs.length : 0,
        behaviors: physics ? physics.behaviors.length : 0,
        flags: Object.assign({}, flags),
        pointer: { x: pointer.x, y: pointer.y },
      };
    },
    setPointer(x, y) {
      pointer.x = x;
      pointer.y = y;
    },
    /* mean |current - anchor| over all particles, optionally only near (x,y,r) */
    meanOffset(x, y, r) {
      if (!pathParticles) return 0;
      let sum = 0,
        n = 0;
      for (let ii = 0; ii < pathParticles.length; ii++) {
        for (let i = 0; i < pathParticles[ii].length; i++) {
          const p = pathParticles[ii][i];
          if (r > 0) {
            const ddx = p.x - x,
              ddy = p.y - y;
            if (ddx * ddx + ddy * ddy > r * r) continue;
          }
          const a = originalPathParticles[ii][i];
          sum += Math.hypot(p.x - a.x, p.y - a.y);
          n++;
        }
      }
      return n ? sum / n : 0;
    },
  };
}

/* --- node export (for the physics validation script; ignored in browsers) -- */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CONFIG,
    flags,
    clampTo,
    mapRange,
    descendingSigmoid,
    flattenCommands,
    anchorCaptureWeight,
    resampleClosed,
    extractContours,
    installFastSolver,
    resetParticles,
    buildLetterPhysics,
  };
}
