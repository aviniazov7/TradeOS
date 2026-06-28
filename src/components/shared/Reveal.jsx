import { motion, useReducedMotion } from 'framer-motion';

/**
 * Scroll-reveal wrapper — fades + lifts its children into view the first time
 * they enter the viewport (once). Honors prefers-reduced-motion (renders static).
 * Wrap a section/card; pass `delay` to stagger neighbours.
 */
export default function Reveal({ children, delay = 0, y = 18, className }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
