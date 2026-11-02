# myBlobChain — ideas & notes

> **Note:** This notebook has been integrated into [JOURNAL.md](./JOURNAL.md), which now serves as the main project journal, milestone log, preset catalog, to-do list, and session-handoff document.

Working notebook for the web port: things to try, decisions to remember,
results worth keeping. Nothing here is code — the living code is in `js/`
(and the parameter sets in `js/modes.js`). Edit freely.

_(Long-term: idea files like this live in every project — one day they can be
compiled to see the larger creative view.)_

## Calibration phase (current)

Goal: find the final interaction feel (forces, lens/capture, clock pacing,
blending) **before** deploying the piece for real.

- **Parameter panel** — key `o` (or `?panel` to start open): live sliders for
  every CONFIG value + the runtime flags, grouped in category boxes.
  `Save` writes `myblobchain_<name>.json` (values + flags snapshot);
  `Load` restores it; `Reset` returns to the page-load values (URL params
  included). Keyboard shortcuts still work — the widgets follow them.
- Workflow: calibrate with the panel → Save promising sets (e.g.
  `myblobchain_soft-05.json`) → later we bake the winners into the `CONFIG`
  defaults and/or as new entries in `js/modes.js`.

## Scan mode — variants (updated Oct 6 2026: implemented)

The scan (`s`, `?scan`) rides the enzyme **zone** across the stage. Shape /
axis / pattern are all live CONFIG values — panel section **Scan**, or URL:
`?scanshape=bar|disk`, `?scanaxis=x|y`, `?scanpattern=sweep|pingpong|bounce|rotate`,
`?barwidth=NN`. Implemented:

- ✅ **Ping-pong** — `scanPattern: pingpong`: sinusoidal back & forth
  (cosine), dwelling naturally at the two ends, no jump. `sweep` keeps the
  one-directional march (with an offstage margin at both ends).
- ✅ **Axis** — `scanAxis: y` sweeps top→bottom (bar becomes horizontal).
- ✅ **Bar instead of disk** — `scanShape: bar`: a straight _invisible_ bar
  spanning the stage, weight = 1-D **plateau** along the sweep axis only
  (flat core, soft sigmoid shoulders; ≈0.5 at half-width). `r` reveals it
  (bar line + two edge lines).
- ✅ **Bouncing ball** (Oct 6) — `scanPattern: bounce`: the disk bounces
  like a DVD-logo — both axes are triangle waves over [−margin, span+margin]
  (the exact solution of a reflection), |vx| = |vy| so it keeps a 45°-ish
  heading and never jumps. Works for the bar too (its axis-bounce).
- ✅ **Rotating line** (Oct 6) — `scanPattern: rotate`: the bar becomes a
  **spinning beam** about the stage centre (one full turn per period; the
  weight is the perpendicular distance to the line, same plateau profile);
  with the disk the zone instead **orbits** the centre. `r` draws the beam
  - its two plateau-edge lines.
- ✅ **Zone activation fix (the real bug!)**: the zone weight is now
  evaluated at the **scaffold/anchor** point — `zoneWeightAt(s.b…)` in
  `applyEnzymeLens` — not at the loop particle. Before, a swept disk grabbed
  whatever loop happened to be under it and flung it toward its anchor
  (often far away): reading as the disk _repelling_ the loops to the other
  side of the screen. Now: scaffold points inside the zone switch their pull
  on, so the letters re-form exactly where the beam passes. (The .pde even
  had `// <-- particle, not anchor` marking the old behavior.)
- Open: rounded bar ends? diagonal bar? bar softness as its own parameter?

## Clock as an alert surface (ideas — Alvaro, Oct 5 2026)

- **Notifications & alarms drive the piece**: an alert's _urgency_ maps to
  the graphics' agitation — low = a gentle stir; high = the field goes wild /
  "explodes", + some sound. The time keeps forming on top of it.
- **Music visualization**: live audio as another kinetic source (bands →
  repulsion / jitter / anchor strength?), keeping the blob-chain DNA.
- These live in the "clock/companion app" thread (macOS screensaver /
  Android) — see Deployment below.

## Clock

- ✅ **Per-digit minute flips** (Oct 6 2026 — Alvaro's request): a minute flip
  used to rebuild the WHOLE clock (all contours, global carry-pool re-seed +
  ink-bbox re-centring → an unsightly global glitch). Now: fixed character
  **slots** (every digit slot uses the '0' advance, colon its own → the layout
  never moves) and only the digits whose character changed are rebuilt — the
  old chains leave the physics (springs/behaviors first) and the new chains
  are seeded from the **old digit's own cloud** (nearest-neighbour carry: new
  particles start exactly on old points, verified 0.000 px). Unchanged digits
  keep their particles/springs/tangles untouched (verified via per-slot build
  ids across a flip); the trail is not cleared. LED font included.
- After calibration: production period = 60 s (one formation per minute).
- Consider making the clock its own **mode preset** (envelope + clockStir +
  rendering flags) so `p` can bring the whole look back instantly.
- Open question: is the _dissolution_ the moment to watch, more than the
  readable instant? (Current weighting says yes: readable only ~12–18 %.)

## Deployment / screensaver track (Oct 5 2026)

- Repo renamed **florderelosss**; currently **private** → GitHub Pages is
  off (Pages needs a public repo on the free plan). When ready to deploy:
  make it public again + re-enable Pages (branch `main`, `/ (root)`); the
  README checklist still applies.
- **macOS screensaver target**: the piece is a web page → wrap it.
  **WebViewScreenSaver** (open source, prebuilt `.saver` — Homebrew cask or
  release zip; accepts local file paths or URLs; no Xcode needed) or
  **Plash** (free; any website as the desktop wallpaper — the "living
  background" variant). Both load local files → the piece must become a
  **single self-contained HTML** (inline css/js; fonts as base64 data URIs;
  fix `file://` font loading). ✅ DONE (Oct 5 2026): `node tools/build-standalone.js`
  → `myblobchain_standalone.html` (2.5 MB, 5 fonts embedded; runs from
  `file://` — verified, 0 errors).
- **Android (later)**: none of the dev tooling is installed on this Mac yet
  (no Android Studio/SDK). Options: KLWP _Web item_ (a Kustom live-wallpaper
  layer that renders a webpage — verify current docs), or a small custom
  app (DreamService screensaver / WallpaperService). Widgets can't host
  web content — not possible.
- **Final build = a selection of modes**, not the full parameter panel.
  Calibration stays a dev tool; the shipped thing "just plays".
- One day: idea files like this one compiled into the larger creative view.

## Rendering / look

- Grayscale (`g`) + beads = the minimal register; maybe also worth its own
  preset (silver ghost clock).
- LED font: segment thickness / aspect could become panel parameters too.

## Physics / modes (`js/modes.js`)

- Current sets: `keep` (reference), `chaos`, `storm`, `still`.
- `chaos` reached true crossing entanglement (repulsionStrength 0.9,
  jitter 0.35, drag 0.015, clockStir 1.2).
- Record here which **saved JSON files** produced which look — the file name
  is the receipt.

## Testing habits

- Run `python3 -m http.server` in this folder (fonts need a server; `file://`
  blocks them).
- Console hooks: `window.__BC` (status, setPointer, meanOffset — physics
  probes) and `window.BCPanel` (`get` / `set` / `saveObject` / `loadObject`).
