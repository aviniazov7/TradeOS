const MIN_CHIP = 64;

/**
 * How many position chips fit in `available` px. An overflow chip is reserved
 * whenever a position would stay hidden (past the cap, or past the width).
 * Unmeasured layout (width 0) falls back to the cap so the strip still renders.
 * Returns the number of position chips to show, not counting the +N chip.
 * A slot only a little shorter than one full chip still returns 1, so the
 * chip can squeeze and the +N stays on screen.
 */
export function chipsThatFit({ chipWidths, overflowWidth, gap, available, total, max = 3 }) {
  const cap = Math.min(max, total, chipWidths.length);
  const fallback = Math.min(max, total);
  if (!(available > 0) || chipWidths.slice(0, cap).some((w) => !(w > 0))) return fallback;
  let used = 0;
  let n = 0;
  for (let i = 0; i < cap; i += 1) {
    const chipCost = (n > 0 ? gap : 0) + chipWidths[i];
    const needsOverflow = i + 1 < total;
    const cost = used + chipCost + (needsOverflow ? gap + overflowWidth : 0);
    if (cost > available + 0.5) break;
    used += chipCost;
    n = i + 1;
  }
  if (n === 0 && total > 0) {
    const floor = Math.min(chipWidths[0] || MIN_CHIP, MIN_CHIP);
    const need = total > 1 ? floor + gap + overflowWidth : floor;
    if (available + 0.5 >= need) return 1;
  }
  return n;
}
