/* ============================================================================
 * myBlobChain — PARAMETER PANEL (calibration UI)
 * ============================================================================
 * A collapsible panel on the right edge with LIVE controls for every value in
 * CONFIG (+ the runtime flags), grouped in category boxes — each control has
 * an explanatory label and a tooltip. Made for the calibration phase: tweak
 * the forces with sliders, watch the piece, and save named parameter files
 * (JSON) instead of editing numbers in the code.
 *
 *   open/close : key 'o'   (add ?panel to the URL to start open)
 *   Save       : downloads myblobchain_<name>.json — a snapshot of every
 *                parameter + flag (readable, diffable, shareable)
 *   Load       : reads such a file back (assigns everything, rebuilds once);
 *                also accepts a js/modes.js entry ({ name, params, flags })
 *   Reset      : back to the page-load baseline (URL params included; the
 *                font choice survives — it is taste, not tuning)
 *   Mode       : the js/modes.js set — same cycling as key 'p'. Any hand
 *                edit marks the state as “custom”; 'p' then starts from the
 *                named modes again.
 *
 * The panel is PURE UI: all side-effect knowledge (what needs a physics
 * rebuild, what is live per-frame, what needs an instance update) lives in
 * blobchain.js as window.BC_CTL, right next to the physics it drives. After
 * every key press / mode change, blobchain.js calls BCPanel.sync() so the
 * widgets always show the live state.
 * ========================================================================== */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  const CTL = () => window.BC_CTL; // resolved lazily (script-order safe)

  /* ------------------------------- schema -------------------------------- */
  /* Every CONFIG value (+ runtime flags) with a human name, range and tip.
     item = { path, label, type, min, max, step, mul, unit, tip, defer }
       path  : 'key' for CONFIG, 'flags.key' for a runtime flag
       type  : 'range' | 'check' | 'select' | 'text' | 'font'
       mul   : display = stored * mul   (ms -> s: 0.001; fraction -> %: 100)
       defer : apply on release only (heavy changes: canvas size)            */
  const R = (path, label, o) => Object.assign({ path, label, type: 'range' }, o || {});
  const CHK = (path, label, tip) => ({ path, label, type: 'check', tip: tip || '' });

  const SECTIONS = [
    {
      title: 'Text & layout',
      items: [
        {
          path: 'input',
          label: 'Text',
          type: 'text',
          tip: 'The text to build — Enter/blur applies. While clock mode is on, the stage shows the time instead.',
        },
        {
          path: 'fontIndex',
          label: 'Font',
          type: 'font',
          tip: "Same set as key 't' — selecting rebuilds the chains from the new outlines.",
        },
        R('textSize', 'Text size', {
          min: 40,
          max: 400,
          step: 5,
          unit: 'px',
          tip: 'Glyph size (auto-fits if too wide).',
        }),
        R('offsetX', 'Offset X', {
          min: 0,
          max: 900,
          step: 5,
          unit: 'px',
          tip: 'Horizontal position of the text block.',
        }),
        R('offsetY', 'Offset Y (baseline)', {
          min: 0,
          max: 600,
          step: 5,
          unit: 'px',
          tip: 'Vertical baseline — letters sit on / above it.',
        }),
        R('segLen', 'Chain segment length', {
          min: 0.5,
          max: 10,
          step: 0.25,
          unit: 'px',
          tip: 'Particle spacing along the outlines — smaller = more particles (heavier).',
        }),
      ],
    },
    {
      title: 'Canvas',
      items: [
        R('W', 'Width', {
          min: 400,
          max: 1600,
          step: 20,
          unit: 'px',
          tip: 'Resizes the stage and rebuilds (applies on release).',
          defer: true,
        }),
        R('H', 'Height', {
          min: 240,
          max: 900,
          step: 20,
          unit: 'px',
          tip: 'Resizes the stage and rebuilds (applies on release).',
          defer: true,
        }),
      ],
    },
    {
      title: 'Solver & integration',
      items: [
        R('substeps', 'Substeps per frame', {
          min: 1,
          max: 12,
          step: 1,
          tip: 'Physics integration steps per rendered frame — higher = more stable, slower.',
        }),
        R('drag', 'Velocity drag', {
          min: 0,
          max: 0.5,
          step: 0.005,
          tip: 'Fraction of velocity kept... (1 - drag) kept per step: 0 = frictionless, 0.4 = the .pde value.',
        }),
        CHK('fastSolver', 'Fast solver (grid repulsion)', 'Instance-level overrides — off = raw toxiclibs (≈20 fps).'),
      ],
    },
    {
      title: 'Repulsion (blob inflation)',
      items: [
        R('repulsionRadius', 'Inter-particle repulsion radius', {
          min: 5,
          max: 150,
          step: 1,
          unit: 'px',
          tip: 'Reach of the push that inflates the chains into blobs.',
        }),
        R('repulsionStrength', 'Repulsion strength', {
          min: 0,
          max: 3,
          step: 0.025,
          tip: '.pde repulsionStrength (applied as negative attraction).',
        }),
        R('repulsionJitter', 'Repulsion jitter', {
          min: 0,
          max: 1,
          step: 0.01,
          tip: 'Randomness added to each push — what keeps the tangle alive.',
        }),
      ],
    },
    {
      title: 'Springs & anchors',
      items: [
        R('outlineSpringStrength', 'Chain (outline) spring stiffness', {
          min: 0,
          max: 0.05,
          step: 0.0005,
          tip: 'How tightly each chain holds its shape.',
        }),
        R('originSpringStrength', 'Origin spring stiffness (initial)', {
          min: 0,
          max: 0.5,
          step: 0.005,
          tip: 'Set at build time; overwritten every frame by the capture / lens pull strength.',
        }),
        R('maxAnchorStrength', 'Anchor pull — maximum strength', {
          min: 0,
          max: 1,
          step: 0.01,
          tip: 'The strongest pull toward home (reached at full activation).',
        }),
      ],
    },
    {
      title: "Anchor capture (mode 'a')",
      items: [
        R('anchorCaptureRadius', 'Capture radius', {
          min: 20,
          max: 400,
          step: 5,
          unit: 'px',
          tip: 'Particles closer than this to their anchor get pulled home — hands-free rebuild.',
        }),
        R('anchorCaptureSoftness', 'Capture edge softness', { min: 1, max: 60, step: 1, unit: 'px', tip: '' }),
        R('anchorCaptureMidpointFrac', 'Capture midpoint (fraction of radius)', {
          min: 0,
          max: 1,
          step: 0.05,
          tip: '',
        }),
      ],
    },
    {
      title: 'Enzyme lens (cursor)',
      items: [
        R('lensRadius', 'Lens radius', {
          min: 20,
          max: 400,
          step: 5,
          unit: 'px',
          tip: 'Reference radius — the plateau edge sits at radius × core (below); the r indicator draws this circle.',
        }),
        R('lensSoftness', 'Zone edge softness', {
          min: 1,
          max: 100,
          step: 1,
          unit: 'px',
          tip: 'Width of the smooth sigmoid shoulders — used by both the cursor lens and the scan bar.',
        }),
        R('lensMidpointFrac', 'Zone core (fraction of radius)', {
          min: 0,
          max: 1,
          step: 0.05,
          tip: 'Where the zone weight is ≈ half (the plateau edge, as a fraction of the radius) — the disk half-width.',
        }),
      ],
    },
    {
      title: "Temporal modulation ('m')",
      items: [
        R('modPeriodMs', 'Modulation period', {
          min: 1,
          max: 60,
          step: 0.5,
          mul: 0.001,
          unit: 's',
          tip: 'The sine period of the springs / repulsion breathing.',
        }),
        R('modMinFactor', 'Minimum factor', { min: 0, max: 1, step: 0.001, tip: '' }),
        R('modMaxFactor', 'Maximum factor', {
          min: 0,
          max: 50,
          step: 0.5,
          tip: 'sin() maps between min and max factor.',
        }),
      ],
    },
    {
      title: "Clock ('k')",
      items: [
        R('clockPeriodMs', 'Breathing period', {
          min: 2,
          max: 120,
          step: 0.5,
          mul: 0.001,
          unit: 's',
          tip: '60 s = one minute (production); 2 s = fast check.',
        }),
        R('clockHoldFrac', 'Readable hold', {
          min: 0,
          max: 45,
          step: 1,
          mul: 100,
          unit: '%',
          tip: 'Fraction of the period the time is legible — centred on the minute.',
        }),
        R('clockAttackFrac', 'Formation time', {
          min: 0,
          max: 45,
          step: 1,
          mul: 100,
          unit: '%',
          tip: 'Slow formation just before the readable hold.',
        }),
        R('clockReleaseFrac', 'Dissolution time', {
          min: 0,
          max: 50,
          step: 1,
          mul: 100,
          unit: '%',
          tip: 'Slow dissolution after the readable hold.',
        }),
        R('clockStir', 'Chaos stir during the abstract dwell', {
          min: 0,
          max: 3,
          step: 0.05,
          tip: 'Extra repulsion while the time is unreadable — feeds the entanglement.',
        }),
      ],
    },
    {
      title: "Scan ('s')",
      items: [
        R('scanPeriodMs', 'Sweep period', {
          min: 1,
          max: 60,
          step: 0.5,
          mul: 0.001,
          unit: 's',
          tip: 'One pass (or one complete back-and-forth cycle) takes this long.',
        }),
        {
          path: 'scanShape',
          label: 'Zone shape',
          type: 'select',
          options: [
            { v: 'disk', l: 'disk (round lens)' },
            { v: 'bar', l: 'bar (straight beam)' },
          ],
          tip: 'The zone the sweep rides: the round enzyme lens, or a straight invisible bar spanning the stage.',
        },
        {
          path: 'scanAxis',
          label: 'Sweep axis',
          type: 'select',
          options: [
            { v: 'x', l: 'x — left ↔ right' },
            { v: 'y', l: 'y — top ↔ bottom' },
          ],
          tip: 'Direction of travel; the bar spans the perpendicular axis.',
        },
        {
          path: 'scanPattern',
          label: 'Sweep pattern',
          type: 'select',
          options: [
            { v: 'sweep', l: 'one direction' },
            { v: 'pingpong', l: 'back & forth (sinusoidal)' },
            { v: 'bounce', l: 'bouncing ball (DVD logo)' },
            { v: 'rotate', l: 'rotate (spin / orbit)' },
          ],
          tip: 'One-directional passes, a sinusoidal back-and-forth, a DVD-style bouncing ball (both axes reflect, equal speed), or rotation about the stage centre — the bar spins like a radar line, the disk orbits.',
        },
        R('scanBarWidth', 'Bar width', {
          min: 20,
          max: 600,
          step: 5,
          unit: 'px',
          tip: 'Full width of the bar zone (weight ≈ 1 in the core, ≈ 0.5 at the edges); the edges use the lens softness.',
        }),
      ],
    },
    {
      title: "Beads ('b')",
      items: [
        R('beadSize', 'Bead size', { min: 0, max: 10, step: 0.1, unit: 'px', tip: '' }),
        R('beadPullGrow', 'Pulled-bead growth', {
          min: 0,
          max: 10,
          step: 0.1,
          unit: 'px',
          tip: 'Extra dot size at full pull — pulled beads also whiten.',
        }),
      ],
    },
    {
      title: 'Rendering & toggles',
      items: [
        CHK('flags.attractToOrigin', 'Attract to origin (space)', ''),
        {
          path: 'flags.attractMode',
          label: 'Attraction source (a)',
          type: 'select',
          options: [
            { v: 'cursor', l: 'cursor lens' },
            { v: 'anchor', l: 'anchor capture' },
          ],
          tip: '',
        },
        CHK('flags.lensEnabled', 'Lens / capture enabled (l)', ''),
        CHK('flags.modulateSprings', 'Temporal modulation (m)', ''),
        CHK('flags.clockOn', 'Clock mode (k)', 'Rebuilds the stage text to / from the time, like key k.'),
        CHK('flags.scanMode', 'Scan mode (s)', ''),
        CHK('flags.grayMode', 'Grayscale (g)', ''),
        CHK('flags.showBeads', 'Particle beads (b)', ''),
        R('flags.trailFade', 'Trail fade ( [ ] )', {
          min: 0,
          max: 100,
          step: 1,
          tip: 'Per-frame fade of the glow buffer — LOWER = longer glowing trails.',
        }),
        R('flags.visualLerp', 'Visual smoothing ( , . )', { min: 0, max: 0.9, step: 0.01, tip: '' }),
        CHK('flags.showCursor', 'Show system cursor (c)', ''),
        CHK('flags.showLensRing', 'Ring / capture field (r)', ''),
        CHK('flags.renderOutlineSprings', 'Debug — outline springs (1)', ''),
        CHK('flags.renderOriginSprings', 'Debug — origin springs (2)', ''),
        CHK(
          'flags.showAnchors',
          'Debug — anchors / scaffold (3)',
          'The anchor points the letters form on, hue-matched to their chains — watch a digit flip travel home.',
        ),
      ],
    },
  ];

  /* known keys (for save/load filtering) */
  const CONFIG_KEYS = new Set();
  const FLAG_KEYS = new Set();
  for (const s of SECTIONS) {
    for (const it of s.items) {
      if (it.path.indexOf('flags.') === 0) FLAG_KEYS.add(it.path.slice(6));
      else CONFIG_KEYS.add(it.path);
    }
  }

  /* ------------------------------- styles -------------------------------- */
  const CSS = `
#bc-panel {
  position: fixed; top: 0; right: 0; height: 100vh; width: 336px; z-index: 40;
  box-sizing: border-box; padding: 10px 12px 70px;
  overflow-y: auto; overscroll-behavior: contain;
  background: rgba(8, 10, 14, 0.94);
  border-left: 1px solid rgba(255, 255, 255, 0.10);
  color: #c9d1dd;
  font: 11.5px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  transition: transform 0.22s ease;
}
#bc-panel.bc-collapsed { transform: translateX(103%); }
#bc-panel-tab {
  position: fixed; top: 50%; right: 0; z-index: 39; transform: translateY(-50%);
  writing-mode: vertical-rl; padding: 12px 6px; cursor: pointer;
  background: rgba(8, 10, 14, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.14); border-right: 0;
  border-radius: 8px 0 0 8px;
  color: #9aa6b8; letter-spacing: 2px; user-select: none;
  font: 10px ui-monospace, Menlo, monospace;
}
body.bc-panel-open #bc-panel-tab { display: none; }
.bc-title-row { display: flex; align-items: center; justify-content: space-between; margin: 2px 0 8px; }
.bc-title { color: #e8edf5; letter-spacing: 2px; font-weight: 700; }
button.bc-btn {
  background: #1b2330; color: #c9d1dd; border: 1px solid rgba(255,255,255,0.14);
  border-radius: 5px; padding: 2px 8px; font: inherit; cursor: pointer;
}
button.bc-btn:hover { background: #243044; }
.bc-filebar, .bc-modebar { display: flex; gap: 6px; margin-bottom: 8px; }
.bc-filebar .bc-name { flex: 1 1 auto; min-width: 0; }
.bc-modebar select { flex: 1 1 auto; min-width: 0; }
select.bc-select, input.bc-text, input.bc-num, input.bc-name {
  background: #111722; color: #dbe4f0;
  border: 1px solid rgba(255,255,255,0.14); border-radius: 5px;
  padding: 2px 6px; font: inherit; box-sizing: border-box;
}
input.bc-num { width: 64px; text-align: right; }
details.bc-sec {
  border: 1px solid rgba(255,255,255,0.09); border-radius: 7px;
  margin: 0 0 8px; background: rgba(255,255,255,0.02);
}
details.bc-sec > summary {
  cursor: pointer; list-style: none; padding: 6px 9px;
  color: #9fb3d1; letter-spacing: 1.2px; text-transform: uppercase;
  font-size: 10px; user-select: none;
}
details.bc-sec > summary::-webkit-details-marker { display: none; }
details.bc-sec > summary::before { content: '▸ '; color: #5c6b80; }
details.bc-sec[open] > summary::before { content: '▾ '; }
.bc-body { padding: 2px 9px 9px; }
.bc-row { margin: 0 0 9px; }
.bc-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 2px; }
.bc-lab { color: #b9c4d4; flex: 1 1 auto; }
.bc-unit { color: #6d7889; margin-left: 3px; }
input.bc-range { width: 100%; accent-color: #ffd27b; height: 14px; margin: 0; }
.bc-checkrow { display: flex; align-items: center; gap: 7px; margin: 0 0 7px; color: #b9c4d4; cursor: pointer; }
.bc-checkrow input { accent-color: #ffd27b; }
.bc-selrow { margin: 0 0 8px; }
.bc-selrow .bc-lab { display: block; margin-bottom: 2px; }
.bc-selrow select { width: 100%; }
.bc-note { color: #6d7889; margin: 10px 2px 0; line-height: 1.5; }
.bc-note b { color: #9aa6b8; }
`;

  /* ------------------------------ helpers -------------------------------- */
  const mulOf = (it) => (it.mul ? it.mul : 1);
  const fmt = (v) => String(Math.round(v * 1000) / 1000);
  const clampNum = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  function el(tag, cls, attrs) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function getVal(path) {
    const c = CTL();
    if (!c) return undefined;
    if (path === 'input') return c.text();
    if (path.indexOf('flags.') === 0) return c.flags[path.slice(6)];
    return c.CONFIG[path];
  }
  function setVal(path, v) {
    const c = CTL();
    if (c) c.apply(path, v);
  }

  /* --------------------------- UI construction --------------------------- */
  let root = null;
  let tab = null;
  let modeSel = null;
  let nameInput = null;
  let fileInput = null;
  let built = false;
  const refs = new Map(); // path -> { type, range, num, input, select, check }
  let lastModeKey = '';

  function buildRow(it) {
    const r = el('div', 'bc-row');
    if (it.type === 'range') {
      const head = el('div', 'bc-head');
      const lab = el('span', 'bc-lab', { title: it.tip || '' });
      lab.textContent = it.label;
      const num = el('input', 'bc-num', {
        type: 'number',
        min: it.min,
        max: it.max,
        step: it.step,
        'data-bc-num': it.path,
        title: it.tip || '',
      });
      head.appendChild(lab);
      const wrap = el('span');
      wrap.appendChild(num);
      if (it.unit) {
        const u = el('span', 'bc-unit');
        u.textContent = it.unit;
        wrap.appendChild(u);
      }
      head.appendChild(wrap);
      const range = el('input', 'bc-range', {
        type: 'range',
        min: it.min,
        max: it.max,
        step: it.step,
        'data-bc-path': it.path,
        title: it.tip || '',
      });
      r.appendChild(head);
      r.appendChild(range);
      const applyDisplay = (d) => {
        num.value = fmt(d);
        setVal(it.path, d / mulOf(it));
      };
      range.addEventListener('input', () => {
        const d = parseFloat(range.value);
        if (!it.defer) applyDisplay(d);
        else num.value = fmt(d); // deferred: only show; apply on release
      });
      range.addEventListener('change', () => applyDisplay(parseFloat(range.value)));
      num.addEventListener('change', () => {
        let d = parseFloat(num.value);
        if (!isFinite(d)) {
          syncOne(it);
          return;
        }
        d = clampNum(d, it.min, it.max);
        range.value = d;
        applyDisplay(d);
      });
      refs.set(it.path, { type: 'range', range, num });
    } else if (it.type === 'check') {
      const lab = el('label', 'bc-checkrow', { title: it.tip || '' });
      const box = el('input', '', { type: 'checkbox', 'data-bc-check': it.path });
      const span = el('span');
      span.textContent = it.label;
      lab.appendChild(box);
      lab.appendChild(span);
      box.addEventListener('change', () => setVal(it.path, box.checked));
      r.appendChild(lab);
      refs.set(it.path, { type: 'check', box });
    } else if (it.type === 'select') {
      const lab = el('span', 'bc-lab', { title: it.tip || '' });
      lab.textContent = it.label;
      const sel2 = el('select', 'bc-select', { 'data-bc-select': it.path, title: it.tip || '' });
      for (const o of it.options || []) {
        const op = el('option', '', { value: o.v });
        op.textContent = o.l;
        sel2.appendChild(op);
      }
      sel2.addEventListener('change', () => {
        setVal(it.path, sel2.value);
        sel2.blur();
      });
      const wrap = el('div', 'bc-selrow');
      wrap.appendChild(lab);
      wrap.appendChild(sel2);
      r.appendChild(wrap);
      refs.set(it.path, { type: 'select', select: sel2 });
    } else if (it.type === 'text') {
      const lab = el('span', 'bc-lab', { title: it.tip || '' });
      lab.textContent = it.label;
      const inp = el('input', 'bc-text', { type: 'text', 'data-bc-text': it.path, title: it.tip || '' });
      const apply = () => {
        if (inp.value !== getVal(it.path)) setVal(it.path, inp.value);
      };
      inp.addEventListener('change', apply);
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          apply();
          inp.blur();
        }
      });
      const wrap = el('div', 'bc-selrow');
      wrap.appendChild(lab);
      wrap.appendChild(inp);
      inp.style.width = '100%';
      r.appendChild(wrap);
      refs.set(it.path, { type: 'text', input: inp });
    } else if (it.type === 'font') {
      const lab = el('span', 'bc-lab', { title: it.tip || '' });
      lab.textContent = it.label;
      const sel2 = el('select', 'bc-select', { 'data-bc-font': it.path, title: it.tip || '' });
      sel2.addEventListener('change', () => {
        setVal(it.path, parseInt(sel2.value, 10));
        sel2.blur();
      });
      const wrap = el('div', 'bc-selrow');
      wrap.appendChild(lab);
      wrap.appendChild(sel2);
      r.appendChild(wrap);
      refs.set(it.path, { type: 'font', select: sel2 });
    }
    return r;
  }

  function refreshFontOptions() {
    const c = CTL();
    const reg = refs.get('fontIndex');
    if (!c || !reg || !reg.select) return;
    const sel2 = reg.select;
    const names = c.fonts();
    if (sel2.options.length !== names.length) {
      sel2.innerHTML = '';
      names.forEach((n, i) => {
        const op = el('option', '', { value: String(i) });
        op.textContent = n;
        sel2.appendChild(op);
      });
    }
  }

  function refreshModeOptions() {
    const c = CTL();
    if (!c || !modeSel) return;
    const names = c.modeNames();
    const cur = c.modeName();
    const custom = cur && names.indexOf(cur) < 0;
    const key = names.join('|') + (custom ? '|custom' : '');
    if (key !== lastModeKey) {
      lastModeKey = key;
      modeSel.innerHTML = '';
      names.forEach((n) => {
        const op = el('option', '', { value: n });
        op.textContent = n;
        modeSel.appendChild(op);
      });
      if (custom) {
        const op = el('option', '', { value: 'custom' });
        op.textContent = 'custom ✎';
        modeSel.appendChild(op);
      }
    }
    modeSel.value = custom ? 'custom' : cur;
  }

  function syncOne(it) {
    const reg = refs.get(it.path);
    if (!reg) return;
    const v = getVal(it.path);
    if (v === undefined || v === null) return;
    if (it.type === 'range') {
      const disp = v * mulOf(it); // display = stored × mul (12000 ms → 12 s)
      if (document.activeElement !== reg.range) reg.range.value = disp;
      if (document.activeElement !== reg.num) reg.num.value = fmt(disp);
    } else if (it.type === 'check') {
      reg.box.checked = !!v;
    } else if (it.type === 'select') {
      if (document.activeElement !== reg.select) reg.select.value = v;
    } else if (it.type === 'font') {
      if (document.activeElement !== reg.select) reg.select.value = String(v);
    } else if (it.type === 'text') {
      if (document.activeElement !== reg.input) reg.input.value = v;
    }
  }

  function sync() {
    if (!built || !CTL()) return;
    for (const s of SECTIONS) for (const it of s.items) syncOne(it);
    refreshFontOptions();
    refreshModeOptions();
  }

  /* ------------------------------- save/load ----------------------------- */
  function saveObject() {
    const c = CTL();
    const values = {};
    const flagValues = {};
    for (const k of CONFIG_KEYS) values[k] = c.CONFIG[k];
    for (const k of FLAG_KEYS) flagValues[k] = c.flags[k];
    return {
      app: 'myBlobChain/params',
      version: 1,
      name: (nameInput && nameInput.value ? nameInput.value : 'params').trim(),
      savedAt: new Date().toISOString(),
      values: values,
      flags: flagValues,
    };
  }

  function download(obj) {
    const name = (obj.name || 'params').replace(/[^\w.-]+/g, '_');
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'myblobchain_' + name + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function loadObject(o) {
    const c = CTL();
    if (!c || !o || typeof o !== 'object') return false;
    const vals = o.values || o.params || o; // saved file / modes.js entry / flat
    const flagVals = o.flags || null;
    const v = {};
    for (const k in vals) {
      if (!CONFIG_KEYS.has(k)) continue;
      if (k === 'input') {
        if (typeof vals[k] === 'string') v[k] = vals[k];
      } else if (typeof vals[k] === 'number' && isFinite(vals[k])) v[k] = vals[k];
    }
    const f = {};
    if (flagVals) for (const k in flagVals) if (FLAG_KEYS.has(k)) f[k] = flagVals[k];
    if (o.name && nameInput) nameInput.value = o.name;
    c.applyAll(v, f);
    sync();
    return true;
  }

  /* ------------------------------ open/close ----------------------------- */
  function setOpen(open) {
    root.classList.toggle('bc-collapsed', !open);
    document.body.classList.toggle('bc-panel-open', open);
    if (open) sync();
  }
  function isOpen() {
    return !root.classList.contains('bc-collapsed');
  }
  function toggle() {
    setOpen(!isOpen());
  }

  /* -------------------------------- init --------------------------------- */
  function init() {
    if (built || !CTL()) return;
    built = true;

    const style = el('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    root = el('div', '', { id: 'bc-panel' });
    tab = el('div', '', { id: 'bc-panel-tab', title: 'parameters (o)' });
    tab.textContent = '⚙ PARAMS';

    /* header */
    const titleRow = el('div', 'bc-title-row');
    const title = el('span', 'bc-title');
    title.textContent = 'PARAMETERS';
    const collapse = el('button', 'bc-btn', { title: 'collapse (o)' });
    collapse.textContent = '▸';
    collapse.addEventListener('click', () => {
      setOpen(false);
      collapse.blur();
    });
    titleRow.appendChild(title);
    titleRow.appendChild(collapse);
    root.appendChild(titleRow);

    /* mode row */
    const modebar = el('div', 'bc-modebar');
    modeSel = el('select', 'bc-select', {
      'data-bc-modesel': '1',
      title: 'Parameter mode set (js/modes.js) — same as key p',
    });
    modeSel.addEventListener('change', () => {
      const v = modeSel.value;
      if (v !== 'custom') CTL().setMode(v);
      modeSel.blur();
    });
    const cycl = el('button', 'bc-btn', { title: 'cycle modes (p)' });
    cycl.textContent = '⟳';
    cycl.addEventListener('click', () => {
      CTL().cycleMode();
      cycl.blur();
    });
    modebar.appendChild(modeSel);
    modebar.appendChild(cycl);
    root.appendChild(modebar);

    /* file row */
    const filebar = el('div', 'bc-filebar');
    nameInput = el('input', 'bc-name', { type: 'text', placeholder: 'name', title: 'Name for the saved JSON file' });
    const saveBtn = el('button', 'bc-btn', { title: 'Download the current parameters as JSON' });
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => {
      download(saveObject());
      saveBtn.blur();
    });
    const loadBtn = el('button', 'bc-btn', { title: 'Load a parameter JSON file (also accepts a modes.js entry)' });
    loadBtn.textContent = 'Load';
    fileInput = el('input', '', { type: 'file', accept: '.json,application/json' });
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          loadObject(JSON.parse(String(reader.result)));
        } catch (e) {
          /* ignore malformed file */
        }
        fileInput.value = '';
      };
      reader.readAsText(f);
      loadBtn.blur();
    });
    loadBtn.addEventListener('click', () => fileInput.click());
    const resetBtn = el('button', 'bc-btn', { title: 'Back to the page-load baseline (font kept)' });
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => {
      CTL().resetToBaseline();
      sync();
      resetBtn.blur();
    });
    filebar.appendChild(nameInput);
    filebar.appendChild(saveBtn);
    filebar.appendChild(loadBtn);
    filebar.appendChild(resetBtn);
    root.appendChild(filebar);
    root.appendChild(fileInput);

    /* sections */
    for (const s of SECTIONS) {
      const det = el('details', 'bc-sec');
      det.open = true;
      const sum = el('summary');
      sum.textContent = s.title;
      det.appendChild(sum);
      const body = el('div', 'bc-body');
      for (const it of s.items) body.appendChild(buildRow(it));
      det.appendChild(body);
      root.appendChild(det);
    }

    /* note */
    const note = el('div', 'bc-note');
    note.innerHTML =
      'Any edit marks the state as <b>custom ✎</b>. <b>Save</b> writes a JSON snapshot; ' +
      '<b>Load</b> restores one. Widgets follow the keyboard shortcuts.';
    root.appendChild(note);

    document.body.appendChild(root);
    document.body.appendChild(tab);

    /* keep p5 from receiving keys typed into the panel (it listens on window) */
    root.addEventListener('keydown', (e) => e.stopPropagation());
    tab.addEventListener('click', () => {
      setOpen(true);
    });

    /* ?panel — start open (handy bookmark while calibrating) */
    let open = false;
    try {
      open = new URLSearchParams(location.search).has('panel');
    } catch (e) {
      open = false;
    }
    setOpen(open);
    sync();
  }

  window.BCPanel = {
    init,
    sync,
    toggle,
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen,
    saveObject,
    loadObject: (o) => {
      const ok = loadObject(o);
      return ok;
    },
    get: getVal,
    set: (path, v) => {
      setVal(path, v);
      sync();
    },
    _sections: SECTIONS,
  };
})();
