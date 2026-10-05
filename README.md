# myBlobChain — web port

Web version of `myBlobChain_V2_glow2.pde` (Processing): the letter outlines of
the input text (default "alvarocassinelli") become closed chains of Verlet
particles that inflate into glowing blobs under local repulsion, and are
re-formed locally under the cursor by an "enzyme lens". Rendered as an additive
glow trail plus a crisp core. In **anchor-capture mode** (`a`), the letters
rebuild themselves — every anchor pulls its own particle in once it drifts
close enough (see below).

**Live:** https://alvarohub.github.io/myBlobChain_web/ — GitHub Pages ·
source: https://github.com/alvarohub/myBlobChain_web

## Run locally

    python3 -m http.server 8000
    → open http://localhost:8000

(A server is required — opening `index.html` via `file://` blocks the font fetch.)

## Deploy to GitHub Pages

Push this folder to a repo (keep `index.html`, `js/`, `vendor/`, `fonts/`,
`.nojekyll`), then: **Settings → Pages → Deploy from branch → `main` → `/ (root)`**.

## Controls

| key       | action                                                                                        |
| --------- | --------------------------------------------------------------------------------------------- |
| `0`       | reset positions + clear trail                                                                 |
| `space`   | toggle attract-to-origin                                                                      |
| `a`       | attraction source: cursor lens ↔ anchor capture (see below)                                   |
| `c`       | show/hide system cursor (hidden by default, like the original)                                |
| `m`       | temporal modulation of springs & repulsion                                                    |
| `l`       | enzyme lens on/off                                                                            |
| `r`       | lens ring on/off                                                                              |
| `1`       | outline-springs debug overlay                                                                 |
| `2`       | origin-springs debug overlay                                                                  |
| `[` `]`   | trail fade −/+ (0–100; lower = longer glow trails, each press ±10)                            |
| `,` `.`   | visual smoothing −/+ (0 = none, 0.9 = max)                                                    |
| `b`       | particle beads on/off — a dot on every particle; pulled ones light up                         |
| `k`       | clock mode — the time, breathing: slow formation → short readable hold → slow dissolution     |
| `s`       | scan mode — a slow virtual cursor sweeps left → right; the lens rides it                      |
| `g`       | grayscale — minimal white rendering (no hues)                                                 |
| `p`       | cycle parameter modes — see `js/modes.js` (keep / chaos / storm / still)                      |
| `t`       | cycle fonts (Shrikhand → Pacifico → Rubik Bubbles → Chewy → Archivo Black → **LED Segments**) |
| `f`       | fullscreen                                                                                    |
| `h` / `?` | help panel                                                                                    |

URL params: `?text=hello%20world` (replaces the text) · `?anchors` (start in
anchor-capture mode) · `?capture=NN` (capture radius in px) · `?font=name`
(pick a bundled font at start, prefix match — `?font=pac`) · `?beads=0` (hide
the particle beads — on by default) · `?clock` (start in clock mode) ·
`?scan` (start with the scanning beam) · `?sweep=NN` (scan sweep in seconds —
8 by default) · `?gray` (start grayscale) · `?period=NN` (clock breathing
period in seconds) · `?mode=name` (start in one of the modes — see below) ·
`?slow` (runs the raw toxiclibs.js solver — for comparison).

## Anchor-capture mode (key `a`)

Instead of the mouse-centred enzyme lens, every anchor gets its own **capture
radius** (soft-edged): when a blob particle drifts close enough to _its own_
anchor, its origin spring engages and pulls it home — its neighbours follow
through the outline springs into range of _their_ anchors, and the chain
**zips the letter back together**, hands-free. Enter/leave with `a`
(`?anchors` starts in it; `?capture=NN` sets the radius — smaller = more
selective and rarer rebuilds, larger = even far-drifted contours get
re-captured). While active, `r` shows the _capture front_ (anchors
mid-transition) instead of the lens ring. With the particle beads on (key
`b`, default), the rebuild is legible bead-by-bead: each pulled particle
heats from dark to white the moment the enzyme grabs it, and you can watch
the pull travelling along the chain.

Measured with `tools/capture-demo.js` (node; same event cadence as the page):

- current CONFIG (1359 particles): blobs settle at ~112 px mean offset →
  12/14 contours captured within 1 s at R=90 (13/14 at R=120); letters stay
  pinned at ~3 px; one small contour can drift out of reach as a stray loop.
- .pde-era values (`original` preset): 21/22 contours rebuilt in < 1 s.

  node tools/capture-demo.js [radius] [seconds] [warmup] [preset]

  # preset: 'current' (default) | 'original'

## Clock mode (key `k`)

The text becomes the current time (`HH:MM`, centred on the stage), and the
origin springs **breathe** with a shaped envelope (`CONFIG.clockPeriodMs`,
10 s default for checking; `?period=NN` in seconds): the readable time is a
SHORT hold (clockHoldFrac, 12% of the cycle) centred on the cycle boundary; a
slow **formation** (smoothstep, 18%) gathers the loops into the digits just
before the boundary; a slow **dissolution** (24%) lets them bloom back into
entangled superstrings; and the remainder — the longest phase — is an
**abstract dwell** where the loops drift on the jitter and modulation. The
piece is about the _formation_ of the time as much as reading it. At 60000
the phase locks to the wall clock: readable exactly on each minute. When the
text flips, it morphs to the new time without teleporting (the rebuild seeds
the free particles from the tangled positions). `?clock` starts the mode; `k`
toggles it off (back to `CONFIG.input`); `0` snaps the current time at any
moment.

**Scan alternative** (key `s`, `?scan`): instead of the global breathing, a
virtual cursor sweeps left → right across the stage every
`CONFIG.scanPeriodMs` (default 8 s; `?sweep=NN` in seconds) and the enzyme
lens rides it — the time re-forms as the beam passes and re-tangles behind
it. With clock mode on, the scan replaces the breathing. The rings are off
by default everywhere; `r` toggles them (the scan beam included).

## Modes (key `p`, `?mode=name`)

`js/modes.js` is the collection of **modes we found that are cool** — named
parameter sets, each overriding CONFIG keys on top of the baseline (your
hand-tuning as loaded). `p` cycles them live (physics rebuilds, trail
clears); `?mode=chaos` starts in one; your font choice survives the switch.
The seed set: **keep** (`{}` — the reference hand-tuning), **chaos** and
**storm** (more agitation + `clockStir`, which boosts the repulsion during
the abstract dwell so the loops keep folding toward crossing, woven
strings), **still** (calm, heavy drag). Add your own entries to that file —
that is the point of it.

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
  Note (Oct 2026) — the current experimental tuning is much heavier:
  `segLen: 1` polygonizes "alvarocassinelli" into ~3.8k particles (≈7.6k
  springs, ≈3.8k repulsion behaviors). The fast solver still runs, but node
  measures ≈ 0.9 s/frame and the browser settles at a few fps (≈4 idle, 3821
  particles). The repulsion behaviors dominate the cost; the springs are cheap
  thanks to the fast solver. Knobs, if you want it lighter: `substeps: 2–3`
  with `drag ≈ 0.4` keeps a similar feel at ~4× less; a larger `segLen` (2–3)
  cuts the particle count roughly proportionally; a further ~2–3× on the
  repulsion loop is possible with an allocation-free inline pass (not enabled
  by default).

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

## Fonts

Five open-licence fonts are bundled and loaded at startup — **Shrikhand**
(default), Pacifico, Rubik Bubbles, Chewy, Archivo Black — all verified
byte-identical to their builds in the
[google/fonts](https://github.com/google/fonts) repository:

- press **`t`** to cycle them live (the physics rebuilds from the new outlines,
  trail cleared — each font starts clean);
- `?font=name` picks one at start (prefix match: `?font=pac` → Pacifico);
- license files sit next to the fonts in `fonts/` (Shrikhand, Pacifico,
  Rubik Bubbles, Archivo Black: SIL OFL 1.1; Chewy: Apache License 2.0).

A sixth, built-in "font" rides the same cycle: **LED Segments** — the
seven-segment display of a digital clock, with every lit segment generated
as its own chain. It renders digits `0-9` and `:` (letters ride as blank
cells; with no digits at all it shows a live clock demo — perfect with clock
mode). `?font=led` jumps straight to it.

ReplicaBold (the original typeface) is commercial — it stays in `data/`
locally for archival reference and is **not** part of the repo. To use any
other font: drop a `.ttf` into `fonts/` and add it to the `CONFIG.fonts`
array in `js/blobchain.js`. The layout auto-fits the type size if the text is
wider than the stage.

## Notes / deviations from the .pde

- `fixedAttractor` was created but never added to the physics in the original
  (dead code) — omitted here.
- Key `1` (`renderOutlineSprings`) was toggled but never rendered in the
  original — here it actually draws the debug overlay (default off, so the
  default look matches the original).
- Web additions: `f` fullscreen, `h` help, `t` font cycling, `b` particle
  beads (dark dots on every particle; the ones being pulled heat up to white,
  so the pull is visible as it travels along the chain), `g` grayscale
  (minimal white rendering), `k` clock mode (slow formation → short readable
  hold → slow dissolution → long abstract dwell), `s` scan mode (slow
  sweeping virtual cursor), `p` parameter modes (`js/modes.js`), `?text=`,
  `?slow`, `?font=`, `?beads=0`, `?clock`, `?scan`, `?sweep=NN`, `?gray`,
  `?period=NN`, `?mode=name`, letterboxed responsive scaling (the stage
  stays 1600×720 logical; DPR-independent).
- `vendor/opentype.min.js` is **not** loaded by the page (p5 bundles opentype);
  it is used by `tools/validate.js` and kept for reference.

## Files

    index.html                    page: canvas + hint / help / error overlays
    js/blobchain.js               the sketch (config, contours, fast solver, p5 code)
    js/modes.js                   named parameter modes (key 'p' cycles them)
    vendor/p5.min.js              p5.js 1.11.3
    vendor/toxiclibs.min.js       toxiclibs.js 0.3.3
    vendor/LICENSE-toxiclibs.txt  LGPL 2.1
    vendor/opentype.min.js        only for tools/validate.js
    fonts/*.ttf                   bundled fonts (Shrikhand, Pacifico, Rubik
                                  Bubbles, Chewy, Archivo Black) + licences
    tools/validate.js             physics equivalence + perf validation (node)
    tools/capture-demo.js         anchor-capture dynamics demo / radius tuner (node)
    myBlobChain_V2_glow2.pde      original Processing sketch (not used by the web version)
    data/JCfg-48.vlw              original Processing font cache (not used)
    .nojekyll                     GitHub Pages hygiene

## Credits / licenses

- Original sketch: `myBlobChain_V2_glow2.pde` (Processing)
- p5.js — LGPL-2.1 · toxiclibs.js — LGPL-2.1 (port of K. Schmidt's toxiclibs) ·
  opentype.js — MIT
- Fonts — Shrikhand, Pacifico, Rubik Bubbles, Archivo Black: SIL OFL 1.1 ·
  Chewy: Apache License 2.0 (all from the google/fonts repository)
