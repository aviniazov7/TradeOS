import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Archive } from 'lucide-react';

export default function ArchiveAnimation({ isOpen, journalName, onComplete }) {
  const [phase, setPhase] = useState('idle');

  useEffect(() => {
    if (isOpen) {
      setPhase('opening');
      const t1 = setTimeout(() => setPhase('closing'), 800);
      const t2 = setTimeout(() => {
        setPhase('done');
        onComplete?.();
      }, 1600);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    } else {
      setPhase('idle');
    }
  }, [isOpen, onComplete]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Archive box */}
          <motion.div
            initial={{ scale: 0.3, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          >
            <Archive className="w-20 h-20 text-amber-500" />
          </motion.div>

          {/* Journal name floating into archive */}
          <motion.p
            className="text-lg font-semibold text-text-primary mt-6"
            initial={{ opacity: 1, y: 0 }}
            animate={phase === 'closing' || phase === 'done'
              ? { opacity: 0, y: -30, scale: 0.5 }
              : { opacity: 1, y: 0 }
            }
            transition={{ duration: 0.5 }}
          >
            {journalName}
          </motion.p>

          {/* "Archived" text */}
          <motion.p
            className="text-sm text-amber-500 mt-3 font-medium"
            initial={{ opacity: 0, y: 10 }}
            animate={phase === 'closing' || phase === 'done'
              ? { opacity: 1, y: 0 }
              : { opacity: 0, y: 10 }
            }
            transition={{ duration: 0.4 }}
          >
            הועבר לארכיון
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
