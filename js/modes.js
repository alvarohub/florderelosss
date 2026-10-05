/* ============================================================================
 * myBlobChain — MODES: the collection of "parameters we found that are cool".
 *
 * Each entry is { name, params, flags? }:
 *   - params: CONFIG overrides (ANY CONFIG key: physics, clock envelope,
 *     clock dynamics, beads...). They are applied ON TOP OF THE BASELINE —
 *     the hand-tuning as loaded (including ?text=, ?capture=NN, etc.) — and
 *     switching modes restores that baseline first, so cycling is clean.
 *   - flags: optional live flags to force (rarely needed).
 *
 * Use: ?mode=name in the URL, or key 'p' to cycle the modes live (the
 * physics rebuilds and the trail clears; your font choice survives).
 *
 * 'keep' is {} — the shipped reference hand-tuning (the breathing/filament
 * look: parameters to keep!). Add new entries as we discover them.
 * ========================================================================== */
window.BC_MODES = [
  {
    name: 'keep', // the reference hand-tuning — current look, keep it!
    params: {},
  },
  {
    /* aim: crossing, woven strings (real entanglement). More agitation,
     * more persistence, and clockStir — extra repulsion while the clock is
     * in its abstract dwell, so the loops keep folding into each other
     * instead of settling into big lazy curves. */
    name: 'chaos',
    params: { repulsionStrength: 0.9, repulsionJitter: 0.35, drag: 0.015, clockStir: 1.2 },
  },
  {
    /* wilder still: blast the chains into each other. */
    name: 'storm',
    params: { repulsionStrength: 1.8, repulsionJitter: 0.7, drag: 0.01, substeps: 6, clockStir: 2.0 },
  },
  {
    /* calm contrast: heavy drag, lazy drift, tighter curves. */
    name: 'still',
    params: { repulsionStrength: 0.25, repulsionJitter: 0.05, drag: 0.15, clockStir: 0 },
  },
];
