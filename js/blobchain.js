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
 *     (dots on every particle; pulled ones light up), 'g' grayscale (minimal
 *     white rendering), 'k' clock mode (the text becomes the time and
 *     breathes: slow formation -> short readable hold -> slow dissolution ->
 *     long abstract dwell; 's' scans a virtual cursor left->right instead;
 *     'p' cycles the parameter modes in js/modes.js),
 *     't' cycles the fonts (Shrikhand -> Pacifico -> Rubik Bubbles -> Chewy
 *     -> Archivo Black -> LED Segments — a seven-segment clock display
 *     generated as chains; ?font=led),
 *     `?text=` / `?slow` / `?anchors` / `?capture=NN` / `?font=name` URL
 *     params, pointer-position fallback for the (hidden) system cursor.
 *   - NEW 'a' mode — "anchor capture": instead of the cursor lens, every
 *     anchor pulls its own particle in once it comes within a capture radius
 *     (soft edge); neighbors follow through the outline springs and the chain
 *     zips the letter back together, hands-free. See tools/capture-demo.js.
 * URL PARAMS:  ?text=some%20text   ?slow   ?anchors   ?capture=NN   ?font=name   ?beads=0   ?clock   ?scan   ?period=NN   ?sweep=NN   ?gray   ?mode=name
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
  segLen: 2, // .pde: lengthSegmentPoligonizer
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
  /* web addition — clock-mode dynamics: the origin springs breathe (slowly
   * attract -> slowly release), phase-locked to Date.now() so that at 60000
   * the letters are fully formed exactly on each minute; 10000 for checking */
  clockPeriodMs: 2000,
  /* envelope shape (fractions of the cycle): the readable hold is SHORT and
   * centred on the cycle boundary; the abstract dwell (the remainder) is the
   * longest phase. Formation/dissolution stay slow (smoothstep). */
  clockAttackFrac: 0.18, // slow formation, ending just before the boundary
  clockHoldFrac: 0.12, // readable window, centred on the boundary
  clockReleaseFrac: 0.24, // slow dissolution after the boundary
  /* extra repulsion during the abstract dwell (0 = off): scales with
   * (1 - envelope) so the loops keep folding toward crossing, woven strings */
  clockStir: 0,
  scanPeriodMs: 8000, // scan mode: virtual cursor sweep, left->right in this period (?sweep=NN seconds)
  /* bundled fonts — key 't' cycles live; ?font=name picks one at start */
  fonts: [
    { name: 'Shrikhand', url: 'fonts/Shrikhand-Regular.ttf' },
    { name: 'Pacifico', url: 'fonts/Pacifico-Regular.ttf' },
    { name: 'Rubik Bubbles', url: 'fonts/RubikBubbles-Regular.ttf' },
    { name: 'Chewy', url: 'fonts/Chewy-Regular.ttf' },
    { name: 'Archivo Black', url: 'fonts/ArchivoBlack-Regular.ttf' },
    { name: 'LED Segments', type: 'led' }, // 7-segment clock display, built from chains (no ttf)
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
// Check if 'location' and 'location.search' exist (i.e., if there are URL parameters)
// If so, create a URLSearchParams object from the query string and extract specific parameters ('text', 'slow', 'capture', 'font') and update CONFIG accordingly.
// If not, the default values in CONFIG are used.
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
// Compared with CONFIG, these are the runtime flags that control various visual and interactive aspects of the simulation
const flags = {
  attractToOrigin: true, // .pde: attractToOrigin
  attractMode: 'cursor', // 'cursor' | 'anchor' (key 'a'; ?anchors in the URL)
  modulateSprings: true, // .pde: modulateSprings
  showCursor: false, // .pde: showCursor (setup() called noCursor())
  lensEnabled: true, // .pde: lensEnabled
  showLensRing: false, // .pde: showLensRing
  renderOutlineSprings: false, // .pde default was true but never rendered; here it draws, so start off
  renderOriginSprings: false, // .pde: renderOriginSprings
  /* trail fade = the per-frame black-rect alpha (0..100): LOWER = longer glow
   * trails. The .pde's 255 clamp was dead above 100 (colorMode HSB/100 caps
   * alpha) — fixed here so every key press actually changes the blending. */
  trailFade: 100, // 100 = no trails (current look); try 40..60 for the long glow

  visualLerp: 0.05, // .pde: float visualLerp
  showBeads: true, // web addition: draw the particle "beads" (key 'b')
  clockOn: true, // web addition: clock mode (key 'k'; ?clock) — the time as text
  scanMode: false, // web addition: virtual scanning cursor, lens mode (key 's'; ?scan)
  grayMode: false, // web addition: pure grayscale rendering (key 'g'; ?gray)
};
if (_params && _params.has('anchors')) flags.attractMode = 'anchor';
if (_params && _params.has('beads')) flags.showBeads = _params.get('beads') !== '0';
if (_params && _params.has('clock')) flags.clockOn = true;
if (_params && _params.has('scan')) flags.scanMode = true;
if (_params && _params.has('gray')) flags.grayMode = true;
const _per = _params ? parseFloat(_params.get('period')) : NaN;
if (_per > 0) CONFIG.clockPeriodMs = _per * 1000; // ?period=NN — breathing period in seconds
const _sweep = _params ? parseFloat(_params.get('sweep')) : NaN;
if (_sweep > 0) CONFIG.scanPeriodMs = _sweep * 1000; // ?sweep=NN — scan sweep period in seconds

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

/* --- LED 7-segment "font" (web addition) --------------------------------- */
/* A digital-clock LED display drawn as chains: every LIT segment is its own
 * closed contour (the classic bar with 45-degree bevels), and digits are
 * assembled from the seven standard segments a..g. Renders digits 0-9 and
 * ':' — other characters ride as blank cells (letters are skipped). Same
 * contract as extractContours: canvas coordinates, auto-fit to maxWidth,
 * points spaced ~segLen apart. */
const LED_SEGMENTS = {
  0: 'abcdef',
  1: 'bc',
  2: 'abged',
  3: 'abgcd',
  4: 'fgbc',
  5: 'afgcd',
  6: 'afgecd',
  7: 'abc',
  8: 'abcdefg',
  9: 'abcdfg',
};

/* one segment bar (pointed tips) between two node points; `gap` retracts
 * both ends so neighbouring segments keep the classic black diagonal gaps */
function ledBarPath(x0, y0, x1, y1, T, gap) {
  const bevel = T * 0.8;
  if (y0 === y1) {
    const xa = Math.min(x0, x1) + gap,
      xb = Math.max(x0, x1) - gap;
    return [
      { x: xa, y: y0 },
      { x: xa + bevel, y: y0 - T / 2 },
      { x: xb - bevel, y: y0 - T / 2 },
      { x: xb, y: y0 },
      { x: xb - bevel, y: y0 + T / 2 },
      { x: xa + bevel, y: y0 + T / 2 },
    ];
  }
  const ya = Math.min(y0, y1) + gap,
    yb = Math.max(y0, y1) - gap;
  return [
    { x: x0, y: ya },
    { x: x0 + T / 2, y: ya + bevel },
    { x: x0 + T / 2, y: yb - bevel },
    { x: x0, y: yb },
    { x: x0 - T / 2, y: yb - bevel },
    { x: x0 - T / 2, y: ya + bevel },
  ];
}

function ledDigitPaths(digit, x, y, w, h, T, gap, out) {
  const segs = LED_SEGMENTS[digit];
  if (!segs) return;
  const nl = T / 2,
    nr = w - T / 2,
    nt = T / 2,
    nb = h - T / 2,
    nv = h / 2;
  const bar = (x0, y0, x1, y1) => out.push(ledBarPath(x + x0, y + y0, x + x1, y + y1, T, gap));
  if (segs.includes('a')) bar(nl, nt, nr, nt);
  if (segs.includes('g')) bar(nl, nv, nr, nv);
  if (segs.includes('d')) bar(nl, nb, nr, nb);
  if (segs.includes('f')) bar(nl, nt, nl, nv);
  if (segs.includes('b')) bar(nr, nt, nr, nv);
  if (segs.includes('e')) bar(nl, nv, nl, nb);
  if (segs.includes('c')) bar(nr, nv, nr, nb);
}

/* the colon: two square dots */
function ledColonPaths(x, y, w, h, T, out) {
  const s = T * 1.05,
    cx = x + w / 2;
  for (const cy of [y + h * 0.34, y + h * 0.66]) {
    out.push([
      { x: cx + s / 2, y: cy - s / 2 },
      { x: cx - s / 2, y: cy - s / 2 },
      { x: cx - s / 2, y: cy + s / 2 },
      { x: cx + s / 2, y: cy + s / 2 },
    ]);
  }
}

function extractLedContours(text, size, segLen, offsetX, offsetY, maxWidth) {
  const h0 = Math.max(10, size); // digit cell height
  const w0 = h0 * 0.62; // digit cell width
  const t0 = w0 * 0.115; // segment thickness (thin -> elongated bars like a real display)
  const gap0 = t0 * 0.5; // retraction at each node (the black gaps)
  const adv0 = w0 + t0 * 1.6; // digit pitch
  const col0 = t0 * 2.2 + t0 * 1.6; // colon cell + spacing
  let total = 0;
  for (const ch of text) total += ch === ':' ? col0 : adv0;
  let scale = 1;
  if (maxWidth > 0 && total > maxWidth) scale = maxWidth / total;
  const H = h0 * scale,
    W = w0 * scale,
    T = t0 * scale,
    gap = gap0 * scale,
    adv = adv0 * scale,
    col = col0 * scale;
  const top = offsetY - H; // digits sit on the offsetY baseline
  const polys = [];
  let x = offsetX;
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') {
      ledDigitPaths(ch, x, top, W, H, T, gap, polys);
      x += adv;
    } else if (ch === ':') {
      ledColonPaths(x, top, col - T * 1.25, H, T, polys);
      x += col;
    } else {
      x += adv; // blank cell (letters, spaces)
    }
  }
  return polys.map((pts) => resampleClosed(pts, Math.max(0.5, segLen)));
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

/* the active CONFIG.fonts entry — the LED "font" (type 'led') has no ttf */
function activeFontEntry() {
  return (CONFIG.fonts && CONFIG.fonts[CONFIG.fontIndex || 0]) || null;
}
function isLedFont() {
  const e = activeFontEntry();
  return !!(e && e.type === 'led');
}
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
let activeInput = CONFIG.input; // web addition: the text currently built (clock mode swaps it)
let lastClockKey = null; // web addition: last built "HH:MM" (clock mode)
let carryPool = null; // web addition: tangled positions carried over a clock rebuild
const pointer = { x: 0, y: 0 }; // .pde: mouseX / mouseY (logical canvas px)
const state = { fps: 0, errors: [] };
let _fpsFrames = 0,
  _fpsTime = 0;

/* --- p5 lifecycle -------------------------------------------------------- */

function preload() {
  const list = CONFIG.fonts || [{ name: 'Archivo Black', url: CONFIG.fontUrl }];
  blobFonts = list.map((f) => (f.url ? loadFont(f.url) : null)); // the LED entry has no ttf
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
  const _fontEntry = activeFontEntry();
  blobFont = blobFonts[CONFIG.fontIndex || 0] || blobFonts.find((f) => f && f.font);

  if (typeof toxi === 'undefined') {
    showFatal('toxiclibs.js did not load.\nCheck vendor/toxiclibs.min.js.');
    return;
  }
  if (!(_fontEntry && _fontEntry.type === 'led') && (!blobFont || !blobFont.font)) {
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

  snapshotBase(); // modes restore to this baseline
  const _m = _params ? _params.get('mode') : null;
  if (!_m || !applyMode(_m, false)) applyMode('keep', false); // ?mode=name (no rebuild: initPhysics follows)

  if (flags.clockOn) {
    activeInput = clockString(); // ?clock: start on the current time
    lastClockKey = activeInput;
  }
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

  let contours;
  if (isLedFont()) {
    // LED display: digits + ':' only; with no digits at all, show a live
    // clock instead (nothing else would be drawn)
    const maxW = CONFIG.W - CONFIG.offsetX - 40;
    contours = extractLedContours(activeInput, CONFIG.textSize, CONFIG.segLen, CONFIG.offsetX, CONFIG.offsetY, maxW);
    if (contours.length === 0) {
      contours = extractLedContours(
        clockString(),
        CONFIG.textSize,
        CONFIG.segLen,
        CONFIG.offsetX,
        CONFIG.offsetY,
        maxW,
      );
    }
  } else {
    contours = extractContours(
      blobFont.font,
      activeInput,
      CONFIG.textSize,
      CONFIG.segLen,
      CONFIG.offsetX,
      CONFIG.offsetY,
      CONFIG.W - CONFIG.offsetX - 40,
    );
  }

  // clock mode (web addition): centre the time on the stage
  if (flags.clockOn) centerContours(contours);

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

  // clock mode (web addition): start from the carried (tangled) positions —
  // no teleport; the breathing envelope (or the scan) pulls the letter home
  if (flags.clockOn) seedFromCarryPool();

  applyAttractToOrigin();
  applyEnzymeLens();
}

/* .pde draw() — same order of operations */
function draw() {
  if (!ready) {
    background(0);
    return;
  }

  // clock mode (web addition): when the wall-clock minute changes, rebuild
  // the text with the new time and snap it intact — legible for a moment,
  // then the physics entangles it again over the following minute
  checkClock();
  updateScan();

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
  // the trail buffer runs in HSB/100 — alpha lives in 0..100 as well; floor 2
  // keeps the trail always fading (no unbounded accumulation)
  trail.fill(0, 0, 0, Math.max(2, Math.min(100, flags.trailFade)));
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

  // 5. lens / capture indicator — off by default; 'r' toggles it (in scan
  //    mode too: the beam just draws its ring when enabled)
  if (flags.showLensRing && flags.lensEnabled) {
    if (!flags.scanMode && flags.attractMode === 'anchor') {
      if (!flags.clockOn) drawCaptureField();
    } else drawLensRing(null);
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
    flags.trailFade = Math.max(0, flags.trailFade - 10); // longer glow trails (−10, 0..100)
  } else if (key === ']') {
    flags.trailFade = Math.min(100, flags.trailFade + 10); // shorter trails (+10; 100 = none)
  } else if (key === ',') {
    flags.visualLerp = Math.max(0, flags.visualLerp - 0.05); // can reach 0 = no smoothing
  } else if (key === 'b' || key === 'B') {
    flags.showBeads = !flags.showBeads; // web addition
  } else if (key === 'k' || key === 'K') {
    toggleClock(); // web addition: clock mode (the time, one-minute cycle)
  } else if (key === 's' || key === 'S') {
    flags.scanMode = !flags.scanMode; // web addition: scanning virtual cursor
  } else if (key === 'g' || key === 'G') {
    flags.grayMode = !flags.grayMode; // web addition: pure grayscale rendering
  } else if (key === 'p' || key === 'P') {
    cycleMode(); // web addition: cycle the parameter modes (js/modes.js)
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
  /* clock breathing (web addition): clockEnvelope() over one clockPeriodMs
   * cycle — a short readable hold centred on the cycle boundary (at 60000 ms,
   * the wall-clock minute), slow formation before it, slow dissolution after
   * it, and a long abstract dwell in between. While clocking (and not
   * scanning), the envelope replaces the lens/capture activation. */
  const clockEnv =
    flags.clockOn && !flags.scanMode ? clockEnvelope((Date.now() % CONFIG.clockPeriodMs) / CONFIG.clockPeriodMs) : null;
  for (let i = 0; i < originSprings.length; i++) {
    const s = originSprings[i];
    let activation = 0;
    if (clockEnv !== null) {
      activation = clockEnv;
    } else if (flags.lensEnabled) {
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
  /* clock stir (web addition): while clocking, boost the repulsion during the
   * abstract dwell (envelope low) by CONFIG.clockStir — the extra agitation
   * that keeps the loops folding toward real entanglement (crossing strings) */
  const repulsionStir = clockEnv !== null ? 1 + CONFIG.clockStir * (1 - clockEnv) : 1;
  for (let k = 0; k < repulsionBehaviors.length; k++) {
    repulsionBehaviors[k].setStrength(-CONFIG.repulsionStrength * repulsionFactor * repulsionStir);
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
    const hue = flags.grayMode ? 0 : (ii * 37) % 100; // .pde: (ii * 37) % 100
    const sat = flags.grayMode ? 0 : 90; // grayscale mode ('g'): no hue at all
    if (glow) {
      one(pts, hue, sat, 100, 12, 9); // wide, faint
      one(pts, hue, sat, 100, 28, 4.5); // narrow, brighter
    } else {
      one(pts, hue, flags.grayMode ? 0 : 25, 100, 100, 1.4); // crisp pale core
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
    const hue = flags.grayMode ? 0 : (ii * 37) % 100; // same hue as the chain
    const anchors = originalPathParticles ? originalPathParticles[ii] : null;

    // pass A — the whole string of beads: DARK dots on the glowing wire,
    // so they read against both the pale core and the saturated glow
    strokeWeight(base);
    stroke(hue, flags.grayMode ? 0 : 100, 30, 90);
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
      stroke(hue, flags.grayMode ? 0 : 100 * (1 - w), 30 + 70 * w, 100); // dark -> blazing white as w -> 1
      point(pts[i].x, pts[i].y);
    }
  }
}

function drawOriginSprings() {
  strokeWeight(1);
  let indexCol = 0; // .pde increments a float per spring
  for (const s of originSprings) {
    stroke((indexCol + 50) % 100, flags.grayMode ? 0 : 100, 100, 60);
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

/* ---- web addition: MODES (key 'p'; ?mode=name) -------------------------- */
/* Named parameter sets live in js/modes.js (window.BC_MODES): each entry is
 * { name, params, flags? } where params overrides CONFIG keys on top of the
 * BASELINE (the hand-tuning as loaded, incl. URL params). Selecting a mode
 * restores the baseline first, so switching is clean; the physics rebuilds
 * and the trail clears. Your font choice ('t') survives mode changes. */
let CONFIG_BASE = null; // baseline snapshot (taken in setup)

function snapshotBase() {
  CONFIG_BASE = Object.assign({}, CONFIG);
  CONFIG.modeName = 'keep';
}

function applyMode(name, rebuild = true) {
  const list = (typeof window !== 'undefined' && window.BC_MODES) || [];
  const m = list.find((mm) => mm && mm.name === name);
  if (!CONFIG_BASE || !m) return false;
  const keepFont = CONFIG.fontIndex; // font choice survives mode changes
  Object.assign(CONFIG, CONFIG_BASE);
  CONFIG.fontIndex = keepFont;
  Object.assign(CONFIG, m.params || {});
  if (m.flags) Object.assign(flags, m.flags);
  CONFIG.modeName = m.name;
  if (rebuild && (isLedFont() || (blobFont && blobFont.font))) {
    initPhysics();
    clearTrail();
  }
  return true;
}

function cycleMode() {
  const list = (typeof window !== 'undefined' && window.BC_MODES) || [];
  if (!list.length || !CONFIG_BASE) return;
  let i = list.findIndex((m) => m.name === CONFIG.modeName);
  i = (i + 1) % list.length;
  applyMode(list[i].name);
}

/* ---- web addition: clock mode (key 'k') --------------------------------- */
/* The stage shows the current time "HH:MM" (centred). The origin springs
 * breathe with the clockEnvelope() below — the time is FORMING for longer
 * than it is readable: a short hold centred on the cycle boundary (at 60000
 * ms, the wall-clock minute), a slow formation before it, a slow dissolution
 * after it, and a long abstract dwell in between where the loops live on the
 * jitter and modulation. Text changes morph (carry-over seeding, no
 * teleport). Toggling off restores CONFIG.input. See also updateScan(). */
function clockString() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/* clock breathing envelope, as a function of cycle phase p in [0,1):
 *   - hold (readable, env = 1): clockHoldFrac, centred on p = 0 (the cycle
 *     boundary — at 60000 ms, the wall-clock minute);
 *   - slow formation (0 -> 1, smoothstep) just before the boundary;
 *   - slow dissolution (1 -> 0, smoothstep) just after it;
 *   - abstract dwell (env = 0) for the remainder — the longest phase. */
function clockEnvelope(p) {
  const h = clampTo(CONFIG.clockHoldFrac, 0, 0.95) / 2;
  const attack = clampTo(CONFIG.clockAttackFrac, 0, 1);
  const release = clampTo(CONFIG.clockReleaseFrac, 0, 1);
  const smooth = (t) => t * t * (3 - 2 * t);
  if (p < h || p >= 1 - h) return 1; // readable hold, centred on the boundary
  if (release > 0 && p < h + release) return 1 - smooth((p - h) / release); // dissolution
  const riseStart = 1 - h - attack;
  if (attack > 0 && p >= riseStart) return smooth((p - riseStart) / attack); // formation
  return 0; // abstract dwell
}

/* remember the current free-particle positions — a clock rebuild then starts
 * from the tangled mess instead of teleporting to the new anchors */
function captureCarryPool() {
  carryPool = null;
  if (!pathParticles) return;
  const pool = [];
  for (const pp of pathParticles) for (const p of pp) pool.push({ x: p.x, y: p.y });
  if (pool.length) carryPool = pool;
}

/* seed the freshly built physics from the carried positions (at rest) */
function seedFromCarryPool() {
  if (!carryPool || !carryPool.length) return;
  const n = carryPool.length;
  let k = 0;
  for (let ii = 0; ii < pathParticles.length; ii++) {
    const pp = pathParticles[ii];
    const vv = visual[ii];
    for (let i = 0; i < pp.length; i++) {
      const src = carryPool[k % n];
      pp[i].set(src);
      pp[i].clearVelocity();
      pp[i].clearForce();
      vv[i].x = src.x;
      vv[i].y = src.y;
      k++;
    }
  }
  carryPool = null; // consume once
}

/* swap the active text and rebuild the physics from its outlines */
function setInputText(text) {
  activeInput = text;
  if (!isLedFont() && (!blobFont || !blobFont.font)) return;
  captureCarryPool(); // keep the tangled positions for a smooth morph
  initPhysics();
  if (trail) clearTrail();
}

/* centre a contour set on the stage (clock mode) */
function centerContours(contours) {
  let x1 = Infinity,
    y1 = Infinity,
    x2 = -Infinity,
    y2 = -Infinity;
  for (const c of contours) {
    for (const p of c) {
      if (p.x < x1) x1 = p.x;
      if (p.x > x2) x2 = p.x;
      if (p.y < y1) y1 = p.y;
      if (p.y > y2) y2 = p.y;
    }
  }
  if (!isFinite(x1)) return;
  const dx = (CONFIG.W - (x2 - x1)) / 2 - x1;
  const dy = (CONFIG.H - (y2 - y1)) / 2 - y1;
  for (const c of contours) {
    for (const p of c) {
      p.x += dx;
      p.y += dy;
    }
  }
}

/* called every frame while the mode is on: rebuild when the minute changes */
function checkClock() {
  if (!flags.clockOn) return;
  const s = clockString();
  if (s !== lastClockKey) {
    lastClockKey = s;
    setInputText(s);
  }
}

/* web addition: scan mode — a virtual cursor sweeps left -> right across the
 * stage in scanPeriodMs; the enzyme lens rides it, so the letters re-form as
 * the beam passes (key 's'; ?scan). Mouse input is ignored while on. */
function updateScan() {
  if (!flags.scanMode) return;
  const period = Math.max(200, CONFIG.scanPeriodMs);
  const frac = (Date.now() % period) / period;
  const R = Math.max(1.0, CONFIG.lensRadius);
  pointer.x = -R + (CONFIG.W + 2 * R) * frac;
  pointer.y = CONFIG.H / 2;
}

/* key 'k': on = time on stage; off = back to the configured text */
function toggleClock() {
  flags.clockOn = !flags.clockOn;
  if (flags.clockOn) {
    lastClockKey = clockString();
    setInputText(lastClockKey);
  } else {
    setInputText(CONFIG.input);
  }
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
    const e = CONFIG.fonts && CONFIG.fonts[i];
    if ((e && e.type === 'led') || (blobFonts[i] && blobFonts[i].font)) break;
  }
  CONFIG.fontIndex = i;
  blobFont = blobFonts[i] || blobFont; // keep a font for cycling away from LED
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
  if (!cnvEl || flags.scanMode) return; // scan mode ignores the mouse
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
    'k      clock mode            ' + yn(flags.clockOn),
    's      scan mode             ' + yn(flags.scanMode),
    'g      grayscale             ' + yn(flags.grayMode),
    'p      mode                  ' + (CONFIG.modeName || 'keep'),
    't      font                  ' +
      (CONFIG.fonts && CONFIG.fonts[CONFIG.fontIndex] ? CONFIG.fonts[CONFIG.fontIndex].name : 'n/a'),
    'f      fullscreen',
    'h      hide this panel',
    '',
    'solver: toxiclibs.js' + (physics && physics.__fastSolver ? ' + fast overrides' : ' (raw)' + ''),
    'text:   "' + activeInput + '"   (?text=… in the URL to change)',
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
        input: activeInput,
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
    clockEnvelope,
    flattenCommands,
    anchorCaptureWeight,
    resampleClosed,
    extractContours,
    extractLedContours,
    installFastSolver,
    resetParticles,
    buildLetterPhysics,
  };
}
