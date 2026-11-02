# myBlobChain — web port

Web version of `myBlobChain_V2_glow2.pde` (Processing): the letter outlines of
the input text (default "alvarocassinelli") become closed chains of Verlet
particles that inflate into glowing blobs under local repulsion, and are
re-formed locally under the cursor by an "enzyme lens". Rendered as an additive
glow trail plus a crisp core. In **anchor-capture mode** (`a`), the letters
rebuild themselves — every anchor pulls its own particle in once it drifts
close enough (see below).

**Live:** https://alvarohub.github.io/florderelosss/ — GitHub Pages ·
source: https://github.com/alvarohub/florderelosss
_(repo currently **private** while calibrating — GitHub Pages is off until it
goes public again; run locally in the meantime)_

## Run locally

    python3 -m http.server 8000
    → open http://localhost:8000

(A server is required — opening `index.html` via `file://` blocks the font fetch.)

## Single-file build

    node tools/build-standalone.js
    → myblobchain_standalone.html (~2.5 MB; all fonts embedded)

One self-contained file — no server, no sibling files; it opens straight from
`file://` (double-click). This is the packaging artifact for the screensaver /
phone track: re-run the command after any edit to `js/*` or `index.html`.

## Deploy to GitHub Pages

Push this folder to a repo (keep `index.html`, `js/`, `vendor/`, `fonts/`,
`.nojekyll`), then: **Settings → Pages → Deploy from branch → `main` → `/ (root)`**.

## Controls

| key       | action                                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| `0`       | reset positions + clear trail                                                                              |
| `space`   | toggle attract-to-origin                                                                                   |
| `a`       | attraction source: cursor lens ↔ anchor capture (see below)                                                |
| `c`       | show/hide system cursor (hidden by default, like the original)                                             |
| `m`       | temporal modulation of springs & repulsion                                                                 |
| `l`       | enzyme lens on/off                                                                                         |
| `r`       | lens ring on/off                                                                                           |
| `1`       | outline-springs debug overlay                                                                              |
| `2`       | origin-springs debug overlay                                                                               |
| `3`       | anchors (scaffold) view — the points the letters form on, hue-matched to their chains                      |
| `[` `]`   | trail fade −/+ (0–100; lower = longer glow trails, each press ±10)                                         |
| `,` `.`   | visual smoothing −/+ (0 = none, 0.9 = max)                                                                 |
| `b`       | particle beads on/off — a dot on every particle; pulled ones light up                                      |
| `k`       | clock mode — the time, breathing: slow formation → short readable hold → slow dissolution                  |
| `s`       | scan mode — an enzyme zone (disk or straight bar) sweeps the stage; letters re-form along the moving front |
| `g`       | grayscale — minimal white rendering (no hues)                                                              |
| `p`       | cycle parameter modes — see `js/modes.js` (keep / chaos / storm / still)                                   |
| `t`       | cycle fonts (Shrikhand → Pacifico → Rubik Bubbles → Chewy → Archivo Black → **LED Segments**)              |
| `o`       | parameter panel — live controls for every CONFIG value (save/load JSON)                                    |
| `f`       | fullscreen                                                                                                 |
| `h` / `?` | help panel                                                                                                 |

URL params: `?text=hello%20world` (replaces the text) · `?anchors` (start in
anchor-capture mode) · `?capture=NN` (capture radius in px) · `?font=name`
(pick a bundled font at start, prefix match — `?font=pac`) · `?beads=0` (hide
the particle beads — on by default) · `?clock` (start in clock mode) ·
`?scan` (start with the scanning zone) · `?sweep=NN` (scan sweep in seconds —
8 by default) · `?scanshape=bar|disk` · `?scanaxis=x|y` ·
`?scanpattern=sweep|pingpong|bounce|rotate` · `?barwidth=NN` (scan zone shape
— see the scan section) · `?gray` (start grayscale) · `?period=NN` (clock
breathing period in seconds) · `?mode=name` (start in one of the modes — see
below) ·
`?panel` (open the parameter panel at start) · `?slow` (runs the raw
toxiclibs.js solver — for comparison).

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
the phase locks to the wall clock: readable exactly on each minute.

**Per-digit rebuild** (minute flips are surgical, not global): the clock runs
on fixed character **slots** — every digit slot uses the advance of `0` and
the colon its own, so the layout never moves when a glyph changes. On a
minute flip only the slots whose character actually changed are rebuilt: the
old digit's chains are removed from the physics (springs and behaviors
first) and the new digit's chains are added in their place, each particle
seeded at the nearest point of the **old digit's own cloud** (so the points
morph into the new glyph from where the old one was — nothing teleports and
the trail is not cleared). Untouched digits are left exactly as they were —
mid-tangle, mid-conversation — and the rest of the clock never notices the
change. Works for the LED seven-segment font too (its pitches are fixed by
construction). `?clock` starts the mode; `k`
toggles it off (back to `CONFIG.input`); `0` snaps the current time at any
moment.

**Scan alternative** (key `s`, `?scan`): instead of the global breathing, an
enzyme **zone** sweeps across the stage every `CONFIG.scanPeriodMs` (default
8 s; `?sweep=NN` in seconds) and the time re-forms as the zone passes and
re-tangles behind it. The zone is either the round lens (`scanShape: disk`)
or a straight **bar** (`scanShape: bar`) spanning the stage perpendicular to
the sweep axis; it sweeps left↔right or top↔bottom (`scanAxis`) and marches
one direction (`scanPattern: sweep`), goes smoothly **back & forth** on a
sinusoid (`scanPattern: pingpong` — no jump), bounces like a DVD-logo
**ball** (`scanPattern: bounce` — both axes reflect off the margins with
matched speed), or **rotates** about the stage centre (`scanPattern:
rotate` — the bar spins like a radar line, one full turn per period; the
disk orbits the centre instead; bar width
`scanBarWidth`). See the URL params above for the live overrides. The
zone's influence is a flat **plateau** (two sigmoids side by side): ≈1 in
the core, ≈0.5 at its nominal edge, fading over soft shoulders — and it is
evaluated at the **scaffold points** (the letters' home positions): anchors
inside the zone switch their origin springs on, so the letters re-form
exactly where the front passes, wherever the tangled loops currently roam.
With clock mode on, the scan replaces the breathing. The rings are off by
default everywhere; `r` toggles them (the bar + its edge lines when scanning
with `bar`).

## Modes (key `p`, `?mode=name`)

`js/modes.js` is the collection of **modes we found that are cool** — named
parameter sets, each overriding CONFIG keys on top of the baseline (your
hand-tuning as loaded). `p` cycles them live (physics rebuilds, the canvas
resizes if the mode needs another stage size, the trail clears);
`?mode=chaos` starts in one. A mode that names a `fontIndex` sets that font —
a look is also a typeface; otherwise your font choice survives.

Every mode declares its `flags` too, so it is a **complete look**: the
page-load flags are restored first, then the mode's own — nothing (grayscale,
trail fade, clock, scan) bleeds in from the mode you just left. `flags: {}`
means "the page-load rendering state", which is what the pure physics sets
use.

- **Physics seed set:** **keep** (`{}` — the reference hand-tuning), **chaos**
  and **storm** (more agitation + `clockStir`, which boosts the repulsion
  during the abstract dwell so the loops keep folding toward crossing, woven
  strings), **still** (calm, heavy drag).
- **Gallery** — looks promoted from the calibration snapshots in `Presets/`:
  **mitochondria-scan** (Shrikhand, fine chains, horizontal bar bouncing like
  a DVD logo), **radar-wide** (LED under a wide spinning beam),
  **radar-fire** (narrow radar line: beads invisible at rest, igniting only
  where the beam sweeps), **bouncing-lens** (Chewy on a full 1600×900 stage,
  the disk bounces, long glow), **led-vscan** (LED, grayscale, vertical
  ping-pong bar), **aneurisms** (Pacifico, anchor capture, outline springs
  drawn) and **clock-breathing** (the pure clock breath, no scan).

Add your own entries to that file — that is the point of it. Or calibrate with
the panel (`o`), **Save** a JSON, and promote the winner here.

## Parameter panel (key `o`, calibration)

A collapsible panel on the right edge with **live controls for every CONFIG
value** (+ the runtime flags), grouped in category boxes (Text & layout,
Canvas, Solver, Repulsion, Springs & anchors, Anchor capture, Enzyme lens,
Temporal modulation, Clock, Scan, Beads, Rendering & toggles) — each control
with an explanatory name and tooltip. Changes apply to the running piece
instantly; only geometry / solver changes rebuild the physics.

- **Save** downloads `myblobchain_<name>.json` — a snapshot of every
  parameter + flag (readable, diffable, shareable).
- **Load** reads it back (also accepts an entry copy-pasted from
  `js/modes.js`); **Reset** returns to the page-load baseline (URL params
  included — the font choice survives).
- The **Mode** row mirrors the `js/modes.js` set (`p` cycles it). Any hand
  edit marks the state as `custom ✎`; picking a mode restores it.
- Keyboard shortcuts still work, and the widgets follow them; keys are never
  stolen while you type in a field. `?panel` opens the panel at start (handy
  bookmark while calibrating).
- Ideas and open questions live in `IDEAS.md`; the project journal — status,
  milestones, the preset catalog and the to-do list — is `JOURNAL.md`.

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
- Enzyme activation is evaluated at each chain point's **home (scaffold)**
  position instead of at the wandering loop particle (the .pde — and this
  port, until Oct 5 — used the particle: a swept disk then flung entangled
  loops toward their far-away anchors). The scan zone (`s`) uses the same
  rule, so letters re-form exactly under the moving front.
- Web additions: `o` parameter panel (`js/panel.js`; `?panel`; save/load
  named JSON parameter files), `f` fullscreen, `h` help, `t` font cycling,
  `b` particle
  beads (dark dots on every particle; the ones being pulled heat up to white,
  so the pull is visible as it travels along the chain), `g` grayscale
  (minimal white rendering), `k` clock mode (slow formation → short readable
  hold → slow dissolution → long abstract dwell), `s` scan mode (an enzyme
  zone — disk or straight bar — sweeps the stage; one-way or sinusoidal
  back & forth; the letters re-form along the moving front), `p` parameter
  modes (`js/modes.js`), `?text=`,
  `?slow`, `?font=`, `?beads=0`, `?clock`, `?scan`, `?sweep=NN`,
  `?scanshape=bar`, `?scanaxis=y`, `?scanpattern=pingpong`, `?barwidth=NN`,
  `?gray`,
  `?period=NN`, `?mode=name`, letterboxed responsive scaling (the stage
  stays 1600×720 logical; DPR-independent).
- `vendor/opentype.min.js` is **not** loaded by the page (p5 bundles opentype);
  it is used by `tools/validate.js` and kept for reference.

## Files

    index.html                    page: canvas + hint / help / error overlays
    js/blobchain.js               the sketch (config, contours, fast solver, p5 code)
    js/modes.js                   named parameter modes (key 'p' cycles them)
    js/panel.js                   parameter panel UI (key 'o') — effects live in BC_CTL
    vendor/p5.min.js              p5.js 1.11.3
    vendor/toxiclibs.min.js       toxiclibs.js 0.3.3
    vendor/LICENSE-toxiclibs.txt  LGPL 2.1
    vendor/opentype.min.js        only for tools/validate.js
    fonts/*.ttf                   bundled fonts (Shrikhand, Pacifico, Rubik
                                  Bubbles, Chewy, Archivo Black) + licences
    tools/validate.js             physics equivalence + perf validation (node)
    tools/validate-zone.js        zone/scan unit tests (plateau profile, sweeps)
    tools/capture-demo.js         anchor-capture dynamics demo / radius tuner (node)
    tools/build-standalone.js     single-file build → myblobchain_standalone.html
    Presets/*.json                calibration snapshots (the panel's Save output)
    myblobchain_standalone.html   generated single-file build (file:// ready;
                                  git-ignored — regenerate with the command above)
    myBlobChain_V2_glow2.pde      original Processing sketch (not used by the web version)
    data/JCfg-48.vlw              original Processing font cache (not used)
    JOURNAL.md                    project journal, milestones, preset catalog, to-dos & session handoff
    IDEAS.md                      working notebook (integrated into JOURNAL.md)
    .nojekyll                     GitHub Pages hygiene

## Credits / licenses

- Original sketch: `myBlobChain_V2_glow2.pde` (Processing)
- p5.js — LGPL-2.1 · toxiclibs.js — LGPL-2.1 (port of K. Schmidt's toxiclibs) ·
  opentype.js — MIT
- Fonts — Shrikhand, Pacifico, Rubik Bubbles, Archivo Black: SIL OFL 1.1 ·
  Chewy: Apache License 2.0 (all from the google/fonts repository)
