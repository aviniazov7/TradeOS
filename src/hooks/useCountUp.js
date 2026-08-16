import { useEffect, useRef, useState } from 'react';

// Animate an integer from its previous value up to `target` (ease-out cubic).
// Respects reduced-motion by snapping straight to the target.
export function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    const end = Number(target) || 0;
    const start = from.current;
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || start === end) { from.current = end; setVal(end); return undefined; }

    let raf;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - (1 - p) ** 3;
      setVal(Math.round(start + (end - start) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = end;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return val;
}
