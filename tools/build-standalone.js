#!/usr/bin/env node
/* ============================================================================
 * myBlobChain — SINGLE-FILE BUILD
 * ============================================================================
 * Assembles a self-contained HTML file (no server, no sibling files) from the
 * ordinary sources:
 *   index.html + the five <script src> files (vendor + js) + the fonts.
 *
 * Fonts are embedded as base64 data URIs into window.BC_FONT_DATA — preload()
 * in js/blobchain.js prefers them over file paths, so the piece also runs
 * straight from file:// (double-click). That is what a screen-saver wrapper
 * (WebViewScreenSaver, Plash) or a phone needs.
 *
 * The sources stay the single point of truth: edit js/*.js as usual and
 * re-run this script — nothing else to refactor.
 *
 * Usage:  node tools/build-standalone.js [outfile]
 * Default out: myblobchain_standalone.html in the project root.
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || path.join(ROOT, 'myblobchain_standalone.html');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* the source scripts, in load order (must match index.html) */
const SCRIPTS = ['vendor/p5.min.js', 'vendor/toxiclibs.min.js', 'js/modes.js', 'js/blobchain.js', 'js/panel.js'];

/* the fonts come from CONFIG.fonts in js/blobchain.js (url: 'fonts/…') */
const fontUrls = [...read('js/blobchain.js').matchAll(/url:\s*'(fonts\/[^']+)'/g)].map((m) => m[1]);
if (!fontUrls.length) throw new Error('no font urls found in js/blobchain.js');

const fontDataScript =
  '<script>\n' +
  '/* fonts embedded by tools/build-standalone.js — preload() prefers these */\n' +
  'window.BC_FONT_DATA = {\n' +
  fontUrls
    .map((u) => {
      const b64 = fs.readFileSync(path.join(ROOT, u)).toString('base64');
      return `    ${JSON.stringify(u)}: 'data:font/ttf;base64,${b64}',`;
    })
    .join('\n') +
  '\n};\n</script>';

let html = read('index.html');

for (const src of SCRIPTS) {
  const tag = `<script src="${src}"></script>`;
  if (!html.includes(tag)) throw new Error(`index.html is missing: ${tag}`);
  /* replace with a function so $& / $' sequences in the code are NOT treated
   * as substitution patterns (p5.min.js is full of $ chars) */
  const code = read(src).replace(/<\/script/gi, '<\\/script'); // safety net
  const inline = `<script>\n/* ${src} (inlined) */\n${code}\n</script>`;
  html = html.replace(tag, () => (src === 'js/blobchain.js' ? `${fontDataScript}\n    ${inline}` : inline));
}

fs.writeFileSync(OUT, html);
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`wrote ${path.relative(ROOT, OUT)} (${kb} KB, ${fontUrls.length} fonts embedded)`);
