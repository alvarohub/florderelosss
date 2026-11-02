# myBlobChain — Project Journal & Session Handoff

> **Purpose of this file:** A single, self-contained project journal and technical handoff document.
> Drop `@JOURNAL.md` into any new chat session to give the assistant full context (where we are, how the system works, what has been built, saved presets, and what is next) **without reading the entire codebase into the context window**.

---

## 1. Where We Are Right Now (Status Snapshot)

- **Current Phase:** **Gallery consolidation → deployment.** The calibration looks are now promoted into `js/modes.js` (11 modes, cycled with `p`) and the repo is clean. Next: GitHub Pages, then the macOS screensaver / wallpaper wrapper.
- **Working State:** Everything runs and passes automated checks (`tools/validate.js`, `tools/validate-zone.js`), and mode switching was verified in a real browser (canvas resize, per-mode flags, clock text, zero console errors).
- **Git Status:**
  - `e825877` (_"Clock mode, parameter modes, grayscale, blend fixes, LED Segments font"_) — the last commit before the Oct 5–7 calibration work.
  - **2026-11-02 — the Oct 5–7 work is committed** (`js/panel.js`, scan variants, surgical per-digit clock flips, `tools/build-standalone.js`, `tools/validate-zone.js`, `Presets/`, `JOURNAL.md`, the demo videos).
  - Deliberately **not** in Git: `myblobchain_standalone.html` (2.5 MB, regenerable) and `DocumentaionPicsVideos/blobClock_1.mov` (265 MB — above GitHub's 100 MB file limit). Both are in `.gitignore`.
- **Repository / Deployment:** `alvarohub/florderelosss` is currently **private** while calibrating (so GitHub Pages is paused until it goes public again).

---

## 2. Fast Context Handoff (Architecture & Invariants)

### Core Concept
Web port of `myBlobChain_V2_glow2.pde` (originally Processing + Geomerative + toxiclibs). Letter outlines of input text (or live `HH:MM` clock digits) become closed chains of Verlet particles connected by outline springs, inflated into glowing/entangled loops by local inter-particle repulsion, and pulled back to their home scaffold ("anchor") positions by an **enzyme lens**, **anchor-capture radius**, **clock breathing envelope**, or **sweeping/rotating scan beam**.

### File Map
| File / Folder | Role |
| :--- | :--- |
| `index.html` | Entry page: canvas container, HUD/help overlays, loads `vendor/*` and `js/*`. |
| `js/blobchain.js` | Main sketch (~2,170 lines): `CONFIG`, `flags`, pure math helpers, `extractContours()`, `installFastSolver()`, per-digit clock builder, rendering, keyboard shortcuts, and `window.BC_CTL` / `window.__BC` bridges. |
| `js/modes.js` | Named parameter presets (`window.BC_MODES`: `keep`, `chaos`, `storm`, `still`), cycled with key `p` or `?mode=`. |
| `js/panel.js` | Live collapsible calibration UI (key `o` or `?panel`): sliders/toggles for all `CONFIG` + `flags`, JSON Save/Load/Reset (`window.BCPanel`). |
| `Presets/*.json` | 12 saved calibration snapshots from the parameter panel. |
| `tools/build-standalone.js` | Bundles `index.html` + `vendor/*` + `js/*` + base64-encoded `fonts/*.ttf` into a single `file://`-ready `myblobchain_standalone.html` (~2.5 MB). |
| `tools/validate.js` | Node test: verifies `installFastSolver()` is bit-exact against raw `toxiclibs.js` (jitter=0) and benchmarks ms/frame. |
| `tools/validate-zone.js` | Node unit tests: verifies `plateauWeight()`, `scanPointer()`, and scaffold-side `zoneWeightAt()` across all scan shapes/axes/patterns. |
| `tools/capture-demo.js` | Node simulation for tuning anchor-capture radius (`a` mode). |
| `fonts/` | 5 open-license `.ttf` fonts (Shrikhand, Pacifico, Rubik Bubbles, Chewy, Archivo Black) + licenses. (A 6th font, **LED Segments**, is generated procedurally in `js/blobchain.js`). |
| `vendor/` | Pinned `p5.min.js` (1.11.3), `toxiclibs.min.js` (0.3.3), `opentype.min.js` (used by Node tools). |

### Key Technical Invariants (Do Not Break)
1. **Scaffold-Side Zone Activation (`zoneWeightAt`):** Enzyme lens and scan zone weights **must** be evaluated at the home anchor position (`s.b`), never at the wandering loop particle (`s.a`). Evaluating at the particle flings distant loops across the screen (appearing as repulsion).
2. **Double-Sigmoid Plateau Profile (`plateauWeight`):** Both the disk lens and scan bar use a flat-core double-sigmoid profile (`≈1` in core, `≈0.5` at nominal half-width, smooth shoulders of width `lensSoftness`, hard `0` past `half + 8·softness`).
3. **Surgical Per-Digit Clock Rebuilds:** Clock mode (`k`) uses 5 fixed character slots (`HH:MM` where digits use `'0'` advance and `:` uses its own). On a minute flip, **only** slots whose character changed are removed from physics and rebuilt, seeding new particles via nearest-neighbor carry from that digit's old particle cloud (`0.000 px` jump; unchanged digits keep their tangles; trail is not cleared).
4. **Instance-Level Fast Solver (`installFastSolver`):** Replaces `AttractionBehavior` n² loop with a uniform spatial grid and inlines the 50-iteration spring loop without allocations on the `VerletPhysics2D` instance (`vendor/toxiclibs.min.js` is never modified).
5. **UI ↔ Sketch Bridge:** `js/panel.js` is pure UI and mutates state exclusively through `window.BC_CTL` in `js/blobchain.js`; keyboard shortcuts call `BCPanel.sync()` so UI widgets stay in sync.

### Commands & Console Hooks
```bash
# Run locally (required for index.html font loading)
python3 -m http.server 8000

# Run Node validation suites
node tools/validate.js
node tools/validate-zone.js
node tools/capture-demo.js

# Rebuild single-file standalone HTML (for file:// or screensaver)
node tools/build-standalone.js
```
- **Browser Console Hooks:** `window.__BC` (physics status, `setPointer`, `meanOffset`) and `window.BCPanel` (`get`, `set`, `saveObject`, `loadObject`).

---

## 3. Chronological Journal & Milestones

### Milestone 1 — Faithful Web Port & Fast Physics Solver (`95a4ac1`)
- Ported `myBlobChain_V2_glow2.pde` to `p5.js` + `toxiclibs.js`.
- Built `extractContours()` using `p5.Font.font` (opentype.js) to replace Processing's Geomerative `UNIFORMLENGTH` polygonizer.
- Implemented `installFastSolver()` (spatial grid repulsion + allocation-free springs), boosting browser performance from ~15 fps to 60 fps (`82.9 ms` → `14.4 ms/frame` in Node) with bit-exact equivalence verified by `tools/validate.js`.
- Added **Anchor-Capture Mode (`a`)** for hands-free letter zipping + `tools/capture-demo.js`.

### Milestone 2 — Curated Open-License Fonts (`d6646c1`)
- Bundled 5 open-license Google Fonts in `fonts/`: **Shrikhand**, **Pacifico**, **Rubik Bubbles**, **Chewy**, and **Archivo Black** (replacing the commercial `ReplicaBold` for web distribution).
- Added live font cycling (`t`) and `?font=` URL prefix matching with automatic text-size fitting.

### Milestone 3 — Particle Beads Visualization (`573d6b5`)
- Added **Particle Beads (`b`)**: renders a dot at each Verlet particle (`beadSize`) that heats from dark to bright white and grows (`beadPullGrow`) in proportion to its origin-spring pull activation, making the wave of re-formation visible along each chain.

### Milestone 4 — Clock Mode, Parameter Modes, Grayscale & LED Font (`e825877`)
- Added **Clock Mode (`k`, `?clock`)**: displays live `HH:MM` time governed by a 4-stage breathing envelope (`clockAttackFrac` slow formation → `clockHoldFrac` short readable hold → `clockReleaseFrac` slow dissolution → long abstract dwell with `clockStir` extra repulsion).
- Added procedural **LED Segments** 7-segment display font (`?font=led`, 6th entry in the `t` cycle) where each lit segment is an independent closed particle chain.
- Added named **Parameter Modes (`p`, `js/modes.js`)**: `keep`, `chaos`, `storm`, `still`.
- Added **Grayscale Mode (`g`, `?gray`)** and fixed the `.pde`'s HSB(100) `trailFade` alpha clamping bug so `[` and `]` smoothly control glow persistence across `0..100`.

### Milestone 5 — Live Calibration Panel, Scan Suite, Surgical Clock Flips & Standalone Build (Oct 5–6, 2026)
- **Parameter Panel (`js/panel.js`, key `o` / `?panel`):** Built collapsible right-hand calibration UI exposing every `CONFIG` value and runtime flag with tooltips, live updates, mode selector, and JSON Save/Load/Reset.
- **Single-File Standalone Build (`tools/build-standalone.js`):** Generates `myblobchain_standalone.html` (~2.5 MB) with all scripts inlined and all 5 `.ttf` fonts embedded as base64 data URIs (`window.BC_FONT_DATA`), running directly from `file://` with 0 errors.
- **Full Scan Mode Suite (`s`, `?scan`):**
  - Shapes (`?scanshape=`): `disk` (round lens) or `bar` (full-stage straight beam with `scanBarWidth`).
  - Axes (`?scanaxis=`): `x` (horizontal) or `y` (vertical).
  - Patterns (`?scanpattern=`): `sweep` (one-way with offstage margins), `pingpong` (smooth cosine back-and-forth), `bounce` (45° DVD-logo triangle-wave reflection on both axes), and `rotate` (spinning radar beam through stage center, or orbiting disk).
  - Unit-tested in `tools/validate-zone.js`.
- **Critical Zone Activation Fix:** Switched `applyEnzymeLens` to evaluate `zoneWeightAt` at the **scaffold/anchor point (`s.b`)** rather than the wandering particle (`s.a`), plus added key `3` (`showAnchors`) debug scaffold overlay.
- **Surgical Per-Digit Minute Flips:** Replaced full-clock rebuilds on minute changes with fixed character slots and per-slot rebuilds seeded via nearest-neighbor carry from the old digit's particle cloud (`0.000 px` start offset, untouched digits stay mid-tangle, no trail clear).

### Milestone 6 — Calibration & Preset Harvesting (Oct 5–7, 2026)
- Explored scan, bounce, rotating radar, and breathing behaviors using the panel; recorded 4 demo videos in `DocumentaionPicsVideos/` and saved 12 parameter presets in `Presets/` (cataloged below).

---

## 4. Catalog of Saved Presets (`Presets/`)

> _Note: until 2026-11-02 all 12 JSON files carried the placeholder `"name": "digital Blobs Scan"` (the panel's name field wasn't filled before Save), so the **filenames** carried the real descriptions. The internal names now match the filenames._

**Promoted into `js/modes.js` (2026-11-02)** — each preset became a complete mode (params **and** flags):

| Preset file | Mode name |
| :--- | :--- |
| `Hscan_mitochondria_1.json` | `mitochondria-scan` |
| `rotatingScan_colorful_fireCorners.json` | `radar-wide` |
| `rotatingScan_colorful_fireCorners2.json` | `radar-fire` |
| `bouncing_colorful_mitochondria.json` | `bouncing-lens` |
| `digital_Vscan_mitochondria.json` | `led-vscan` |
| `breathing_colorful_aneurisms.json` | `aneurisms` |
| `niceSimpleBreathing1.json` | `clock-breathing` |

The other five (`myblobchain_digital_Blobs_Scan`, `…_Scan2`, `digital_Vscan_mitochondria_2`, `digital_Vscan_mitochondria_3`, `rotatingScan_colorful`) were left as presets — variations close to a promoted one; load them from the panel if needed.

| Preset File | Saved Date | Canvas / Font / SegLen | Mode & Scan / Clock Highlights | Visual Character |
| :--- | :--- | :--- | :--- | :--- |
| `myblobchain_digital_Blobs_Scan.json` | Oct 5, 02:55 | `820×480` · LED (`5`) · `segLen: 4` | Clock + Scan (early format, pre-`scanShape` fields), high drag (`0.5`), strong repulsion (`1.775`), no trail (`trailFade: 100`). | Chunky LED segments with heavy drag and crisp scan rebuild. |
| `myblobchain_digital_Blobs_Scan2.json` | Oct 5, 03:06 | `640×480` · LED (`5`) · `segLen: 0.75` | Clock + Scan + Modulation + **Grayscale**, tight repulsion radius (`10`), dense particles. | Fine-grained silver/white cellular chains. |
| `digital_Vscan_mitochondria.json` | Oct 5, 17:00 | `640×480` · LED (`5`) · `segLen: 0.75` | Clock + Scan (`bar`, `y`, `pingpong`, width `40`), **Grayscale**, `drag: 0`, `showLensRing: true`. | Vertical ping-pong beam revealing cellular/mitochondria-like LED loops in monochrome. |
| `digital_Vscan_mitochondria_2.json` | Oct 5, 17:03 | `640×480` · Archivo Black (`4`) · `segLen: 0.75` | Same as above but with **Archivo Black** (`textSize: 140`). | Bold typographic outlines morphing into cellular loops under vertical bar scan. |
| `digital_Vscan_mitochondria_3.json` | Oct 5, 17:06 | `640×480` · Archivo Black (`4`) · `segLen: 1` | Horizontal ping-pong bar (`axis: x`, width `40`), **Grayscale**, higher smoothing (`visualLerp: 0.17`). | Smooth horizontal bar scan over monochrome mitochondria loops. |
| `rotatingScan_colorful.json` | Oct 5, 17:09 | `640×480` · Archivo Black (`4`) · `segLen: 1` | Color, rotating narrow bar (`rotate`, width `20`), **Origin Springs rendered (`2` ON)**, no beads. | Radar-beam origin-spring rays sweeping colorful tangled loops. |
| `rotatingScan_colorful_fireCorners.json` | Oct 5, 17:16 | `640×480` · LED (`5`) · `segLen: 1` | Color, rotating wide bar (`rotate`, width `300`), **Beads ON**, glow trail (`trailFade: 80`). | Wide spinning radar beam with glowing bead trails and corner flareups. |
| `rotatingScan_colorful_fireCorners2.json` | Oct 5, 17:20 | `640×480` · Shrikhand (`0`) · `segLen: 1` | Color, rotating medium bar (`rotate`, width `90`), `beadSize: 0` + `beadPullGrow: 5.6`, long glow (`trailFade: 40`). | Invisible resting beads that ignite into glowing sparks only when swept by the rotating beam. |
| `Hscan_mitochondria_1.json` | Oct 5, 17:38 | `640×480` · Shrikhand (`0`) · `segLen: 1.25` | Color, bouncing bar (`bar`, `x`, `bounce`, width `85`), Modulation ON, high `beadPullGrow: 9.4`, `visualLerp: 0.67`. | Silky-smooth horizontal bouncing beam with large glowing pulled beads. |
| `breathing_colorful_aneurisms.json` | Oct 6, 01:26 | `640×480` · Pacifico (`1`) · `segLen: 2.25` | **Anchor-capture (`anchor`)** + Scan (`bar`, `y`, `pingpong`) + Modulation + **Outline Springs (`1` ON)**, very weak max anchor pull (`0.03`). | Organic, pulsing "aneurism" pouches with visible outline spring mesh. |
| `bouncing_colorful_mitochondria.json` | Oct 6, 02:27 | `1600×900` · Chewy (`3`) · `segLen: 3.25` | Full HD stage, **bouncing disk (`disk`, `bounce`)**, large `textSize: 395`, long glow (`trailFade: 20`), `beadSize: 0` / `beadPullGrow: 10`. | DVD-logo bouncing enzyme lens lighting up giant colorful loops on a wide stage. |
| `niceSimpleBreathing1.json` | Oct 7, 16:30 | `1600×900` · Chewy (`3`) · `segLen: 3.25` | Pure **Clock Breathing** (`scanMode: false`), fast 4s cycle (`clockPeriodMs: 4000`) + fast 1s modulation (`modPeriodMs: 1000`), glow trail (`trailFade: 60`). | Clean, rhythmic full-stage clock breathing without a scan beam. |

---

## 5. To-Do List & Next Milestones

### Immediate Hygiene & Consolidation — ✅ done 2026-11-02
- [x] **Commit current work to Git:** the Oct 5–7 additions (`js/panel.js`, scan variants & per-digit clock flip in `js/blobchain.js`, `tools/build-standalone.js`, `tools/validate-zone.js`, `Presets/`, `README.md`, `JOURNAL.md`, the 3 small demo clips).
- [x] **Update internal `"name"` fields in `Presets/*.json`** — each now matches its filename.
- [x] **Curate `js/modes.js`** — 7 favourites promoted as complete modes (`flags` included); `keep`/`chaos`/`storm`/`still` now declare `flags: {}` so they no longer inherit the previous mode's scan/grayscale.
- [x] **Rebuild standalone artifact** — `myblobchain_standalone.html` (2557 KB, 5 fonts). It is **git-ignored** (regenerable); rerun after any `js/*` change.

**Two Git constraints discovered:** GitHub rejects files over 100 MB, so `blobClock_1.mov` (265 MB) stays out of the repo (if it must be versioned, that needs Git LFS). The standalone HTML is 2.5 MB because p5 + toxiclibs + the sketch + 5 base64 fonts are inlined — regenerable, so not tracked.

### Calibration & Polish
- [ ] **Production Clock Timing:** Set default `clockPeriodMs` to `60000` (60 s, phase-locked to the wall-clock minute) for the shipped clock mode once fast-cycle testing is complete.
- [ ] **Shipped Mode vs. Dev Mode:** Keep the parameter panel (`o`) as a dev/calibration tool, while the shipped build boots directly into a curated mode selection that "just plays".
- [ ] **Performance Option (Optional):** If ultra-dense `segLen <= 1` presets need higher frame rates on large `1600×900` canvases, consider enabling an allocation-free inline repulsion pass (~2–3× faster than calling `applyBehavior` per neighbor pair).

### Deployment & Companion-App Track
- [ ] **GitHub Pages:** Make `alvarohub/florderelosss` public again and re-enable GitHub Pages (`main` branch, `/ (root)`).
- [ ] **macOS Screensaver / Living Wallpaper:**
  - Test `myblobchain_standalone.html` in **WebViewScreenSaver** (prebuilt `.saver` via Homebrew cask, loads local `file://` HTML) and **Plash** (living desktop wallpaper).
- [ ] **Android Track (Later):**
  - Evaluate **KLWP (Kustom Live Wallpaper)** _Web item_ layer vs. a lightweight native Android wrapper (`WallpaperService` / `DreamService` hosting a `WebView` with `myblobchain_standalone.html`).

---

## 6. Ideas to Explore (Creative Backlog)

_(Integrated from `IDEAS.md` — add new creative sparks here)_

1. **Clock as an Alert / Notification Surface (Alvaro, Oct 5, 2026):**
   - Notifications and alarms drive the physics agitation: low urgency = a gentle stir; high urgency = the field goes wild / "explodes" (with sound), while the time continues forming on top of the turbulence.
2. **Live Audio / Music Visualization:**
   - Use Web Audio API / microphone frequency bands as a kinetic source mapped to `repulsionStrength`, `repulsionJitter`, or `maxAnchorStrength`, preserving the blob-chain DNA.
3. **Scan & Geometry Variations:**
   - Rounded bar ends (capsule zone instead of infinite line)?
   - Fixed diagonal bar angle?
   - Independent bar edge softness parameter (separate from `lensSoftness`)?
   - Expose **LED Segments** thickness and aspect ratio as sliders in the parameter panel.
4. **Aesthetic Registers:**
   - **Silver Ghost Clock:** Dedicated preset combining `grayMode: true` (`g`) + `showBeads: true` (`b`).
   - **Dissolution vs. Readability:** Continue exploring envelope weighting where the _dissolution_ and _formation_ are the primary drama, and the readable instant is fleeting (~5–15% of the cycle).
5. **Cross-Project Idea Compilation:**
   - Long-term: compile journal/idea files across Alvaro's media-art projects into a unified creative overview.

---

## 7. Session Log (Append New Entries Below)

- **2026-10-05 → 2026-10-07:** Built live calibration panel (`js/panel.js`), single-file standalone bundler (`tools/build-standalone.js`), scan mode variants (`bar`/`disk`, `sweep`/`pingpong`/`bounce`/`rotate` + `tools/validate-zone.js`), fixed scaffold-side enzyme activation (`zoneWeightAt` at anchor `s.b`), implemented surgical per-digit clock minute flips with nearest-neighbor particle carry, and harvested 12 presets in `Presets/`.
- **2026-11-02:** Created `JOURNAL.md` consolidating project state, technical invariants, milestone history, preset catalog, roadmap, and `IDEAS.md` backlog for lightweight multi-session continuity.
- **2026-11-02 (hygiene session):** Fixed the 12 preset `name` fields; generated the 7-mode gallery into `js/modes.js` **from the preset JSONs** (no hand-copied numbers); made every mode a complete look by having `applyMode()` restore the page-load flags before applying a mode's own (`flags: {}` = page-load state) — this also fixed modes inheriting the previous mode's scan/grayscale; `applyMode()` now resizes the stage when a mode needs another canvas size, swaps the stage text when `clockOn` changes, and honours a mode's `fontIndex`; modes are applied before `createCanvas()` so `?mode=` boots at the right size. Verified in the browser: all 11 modes switch with zero console errors, canvas 1600×900 ↔ 640×480, flags reset per mode, `p` key cycling works. Rebuilt the standalone (2557 KB). Added `.gitignore` entries for the regenerable HTML and the 265 MB video.
