# myBlobChain — web port

Web version of `myBlobChain_V2_glow2.pde` (Processing): the letter outlines of
"feliz cumplegonz" become closed chains of Verlet particles that inflate into
glowing blobs under local repulsion, and are re-formed locally under the cursor
by an "enzyme lens". Rendered as an additive glow trail plus a crisp core.
In **anchor-capture mode** (`a`), the letters rebuild themselves — every anchor
pulls its own particle in once it drifts close enough (see below).

## Run locally

    python3 -m http.server 8000
    → open http://localhost:8000

(A server is required — opening `index.html` via `file://` blocks the font fetch.)

## Deploy to GitHub Pages

Push this folder to a repo (keep `index.html`, `js/`, `vendor/`, `fonts/`,
`.nojekyll`), then: **Settings → Pages → Deploy from branch → `main` → `/ (root)`**.

## Controls

| key       | action                                                         |
| --------- | -------------------------------------------------------------- |
| `0`       | reset positions + clear trail                                  |
| `space`   | toggle attract-to-origin                                       |
| `a`       | attraction source: cursor lens ↔ anchor capture (see below)    |
| `c`       | show/hide system cursor (hidden by default, like the original) |
| `m`       | temporal modulation of springs & repulsion                     |
| `l`       | enzyme lens on/off                                             |
| `r`       | lens ring on/off                                               |
| `1`       | outline-springs debug overlay                                  |
| `2`       | origin-springs debug overlay                                   |
| `[` `]`   | trail fade −/+                                                 |
| `,` `.`   | visual smoothing −/+                                           |
| `f`       | fullscreen                                                     |
| `h` / `?` | help panel                                                     |

URL params: `?text=hello%20world` (replaces the text) · `?anchors` (start in
anchor-capture mode) · `?capture=NN` (capture radius in px) · `?slow` (runs the
raw toxiclibs.js solver — for comparison).

## Anchor-capture mode (key `a`)

Instead of the mouse-centred enzyme lens, every anchor gets its own **capture
radius** (soft-edged): when a blob particle drifts close enough to _its own_
anchor, its origin spring engages and pulls it home — its neighbours follow
through the outline springs into range of _their_ anchors, and the chain
**zips the letter back together**, hands-free. Enter/leave with `a`
(`?anchors` starts in it; `?capture=NN` sets the radius — smaller = more
selective and rarer rebuilds, larger = even far-drifted contours get
re-captured). While active, `r` shows the _capture front_ (anchors
mid-transition) instead of the lens ring.

Measured with `tools/capture-demo.js` (node; same event cadence as the page):

- current CONFIG (1359 particles): blobs settle at ~112 px mean offset →
  12/14 contours captured within 1 s at R=90 (13/14 at R=120); letters stay
  pinned at ~3 px; one small contour can drift out of reach as a stray loop.
- .pde-era values (`original` preset): 21/22 contours rebuilt in < 1 s.

  node tools/capture-demo.js [radius] [seconds] [warmup] [preset]

  # preset: 'current' (default) | 'original'

## Stack & fidelity

- **p5.js 1.11.3** — drawing & main loop (vendored). `setup()/draw()/keyPressed()`
  map 1:1 onto the `.pde`: HSB(100) color mode, PGraphics trail buffer,
  `blendMode(ADD)` compositing, lens ring, debug overlays.
- **toxiclibs.js 0.3.3** — the JavaScript port of the _same_ physics library the
  original used through toxiclibs for Java (LGPL 2.1, see
  `vendor/LICENSE-toxiclibs.txt`). Every formula was checked against the Java
  sources before use:
  - engine defaults `numIterations = 50`, `timeStep = 1`;
    `setDrag(0.4)` keeps velocity × 0.6 per update (their internal drag = 1 − d);
  - update order: behaviors (forces) → `scaleVelocity(drag)` → integrate →
    50× spring solver → world-bounds clamp;
  - `VerletSpring2D.update()`: `dist = |b−a| + 1e-6`,
    `k = (dist − rest) / (dist·(invWa + invWb)) · strength`, ends move by
    `delta·(±k·invW)`;
  - `AttractionBehavior`: force = `delta.normalizeTo(1 − d²/r²)·jitter·(strength·dt)`
    (magSquared falloff — exactly as in the Java original), used with negative
    strength as repulsion (r = 30, s = −10, jitter 0.01).
- **Text outlines** — Geomerative has no JS port; `extractContours()` in
  `js/blobchain.js` (~60 lines) replicates `getPointsInPaths()` plus the
  UNIFORMLENGTH polygonizer, using the opentype.js font object bundled inside
  p5 (`p5.Font.font`). Each glyph contour (incl. holes) becomes an independent
  closed chain, exactly like the original.
  Note (Oct 2026) — with the current experimental tuning (`segLen: 3`,
  `substeps: 8`, `repulsionRadius: 50`) frame cost rises sharply: profile at
  ~1359 particles gives blob state ≈ 103 ms/frame and rebuilt state ≈
  297 ms/frame (node), of which the repulsion behaviours are ~280 ms (the
  springs are ~3 ms thanks to the fast solver). Browser-measured: 24 fps
  blobby / 11 fps rebuilt. If you want it lighter, `substeps: 2–3` with `drag`
  ≈ 0.4 keeps a similar feel at ~4× less; a further ~2–3× on the repulsion loop
  is possible with an allocation-free inline pass (not enabled by default).

## Performance — measured, and the two overrides

Raw toxiclibs.js runs this sketch at **~15 fps in the browser** (83 ms/frame in
node at ~1200 particles): the n² repulsion loop plus an allocating
50-iteration spring solver. `installFastSolver()` replaces two methods **on the
physics instance** (the vendored library file stays untouched):

- **repulsion**: identical `applyBehavior()` calls, but candidates are found via
  a uniform grid — pairs beyond the radius contribute exactly zero in the
  library's own formula;
- **springs**: same formulas, same iteration order, inlined without allocations.

Equivalence is validated numerically (re-run anytime: `node tools/validate.js`):

| test                                         | result                                   |
| -------------------------------------------- | ---------------------------------------- |
| deterministic (jitter off), 180 updates      | max \|Δ\| = **0 — bit-exact**            |
| stochastic (jitter on): raw-vs-raw (control) | max ≈ 19.7 px (run-dependent)            |
| stochastic: raw-vs-fast (cross)              | max ≈ 19.3 px — **within natural noise** |
| perf, node                                   | 82.9 → **14.4 ms/frame**                 |
| perf, browser (same scene)                   | **15 fps → 60 fps**                      |

## Font

ReplicaBold (the original) is a commercial typeface, so Archivo Black
(SIL OFL, see `fonts/OFL.txt`) is bundled instead — a similarly heavy
grotesque. To use another font: drop a `.ttf` into `fonts/` and change
`CONFIG.fontUrl` in `js/blobchain.js`. The layout auto-fits the type size if
the text is wider than the stage.

## Notes / deviations from the .pde

- `fixedAttractor` was created but never added to the physics in the original
  (dead code) — omitted here.
- Key `1` (`renderOutlineSprings`) was toggled but never rendered in the
  original — here it actually draws the debug overlay (default off, so the
  default look matches the original).
- Web additions: `f` fullscreen, `h` help, `?text=`, `?slow`, letterboxed
  responsive scaling (the stage stays 1600×720 logical; DPR-independent).
- `vendor/opentype.min.js` is **not** loaded by the page (p5 bundles opentype);
  it is used by `tools/validate.js` and kept for reference.

## Files

    index.html                    page: canvas + hint / help / error overlays
    js/blobchain.js               the sketch (config, contours, fast solver, p5 code)
    vendor/p5.min.js              p5.js 1.11.3
    vendor/toxiclibs.min.js       toxiclibs.js 0.3.3
    vendor/LICENSE-toxiclibs.txt  LGPL 2.1
    vendor/opentype.min.js        only for tools/validate.js
    fonts/ArchivoBlack-Regular.ttf + OFL.txt
    tools/validate.js             physics equivalence + perf validation (node)
    myBlobChain_V2_glow2.pde      original Processing sketch (not used by the web version)
    tools/capture-demo.js         anchor-capture dynamics demo / radius tuner (node)
    data/JCfg-48.vlw              original Processing font cache (not used)
    .nojekyll                     GitHub Pages hygiene

## Credits / licenses

- Original sketch: `myBlobChain_V2_glow2.pde` (Processing)
- p5.js — LGPL-2.1 · toxiclibs.js — LGPL-2.1 (port of K. Schmidt's toxiclibs) ·
  opentype.js — MIT · Archivo Black — SIL OFL 1.1
