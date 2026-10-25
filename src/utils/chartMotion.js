// Line / area draw-in. Recharts grows the stroke from the start of the series.
// Callers pass `reduce` from usePrefersReducedMotion so the line appears whole
// when the user (or the accessibility toggle) asks for no motion.
export function chartDrawProps(reduce) {
  if (reduce) return { isAnimationActive: false };
  return {
    isAnimationActive: true,
    animationDuration: 900,
    animationEasing: 'ease-out',
  };
}
