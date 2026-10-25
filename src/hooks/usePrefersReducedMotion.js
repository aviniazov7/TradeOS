import { useEffect, useState } from 'react';

function readReduced() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
      || document.documentElement.classList.contains('a11y-stop-motion');
  } catch {
    return false;
  }
}

// OS "reduce motion" plus the in-app "עצירת אנימציות" toggle (html.a11y-stop-motion).
// framer-motion already follows MotionConfig; Recharts does not, so charts ask here.
export function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(readReduced);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const sync = () => setReduce(readReduced());
    sync();
    mq?.addEventListener?.('change', sync);
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      mq?.removeEventListener?.('change', sync);
      mo.disconnect();
    };
  }, []);
  return reduce;
}
