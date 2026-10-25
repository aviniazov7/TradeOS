import { useLocation, useOutlet } from 'react-router-dom';
// eslint-disable-next-line no-unused-vars -- motion is used as <m.div> (JSX-uses-vars false positive)
import { AnimatePresence, m } from 'framer-motion';

const ease = [0.22, 1, 0.36, 1];

// Route changes: the leaving page rises a few pixels and fades, then the next
// page mounts and plays its own slide-up (pageVariants). This wrapper does
// not also enter, so the two don't stack into one long rise.
// Keyed on the pathname only — a tab query (?tab=) stays on the same page.
export default function PageRise() {
  const { pathname } = useLocation();
  const outlet = useOutlet();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={pathname}
        className="min-w-0"
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8, pointerEvents: 'none' }}
        transition={{ duration: 0.22, ease }}
      >
        {outlet}
      </m.div>
    </AnimatePresence>
  );
}
