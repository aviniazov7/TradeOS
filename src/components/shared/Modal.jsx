import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

let modalCount = 0;

export default function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-xl' }) {
  useEffect(() => {
    if (isOpen) {
      modalCount++;
      document.body.style.overflow = 'hidden';
      window.dispatchEvent(new CustomEvent('closeSidebar'));
    }
    return () => {
      if (isOpen) {
        modalCount--;
        if (modalCount <= 0) {
          modalCount = 0;
          document.body.style.overflow = '';
        }
      }
    };
  }, [isOpen]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop — lighter dim + heavier blur so the page frosts THROUGH
              the glass card behind it (that's what reads as glass, vs a flat
              black wall). */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/55"
            style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Centering wrapper */}
          <div className="fixed inset-0 z-50 flex items-center justify-center px-3 pt-14 pb-4 md:px-6 pointer-events-none">
            {/* Card — iOS-style black glass: translucent + heavy blur. The
                entrance is opacity+slide only (no scale) so the backdrop-filter
                doesn't flicker on Safari. */}
            <motion.div
              className={`relative ${maxWidth} w-full rounded-2xl overflow-hidden pointer-events-auto`}
              style={{
                // Subtle top specular sheen over the dark glass — the 21st.dev
                // "black glass" highlight — layered on top of the translucent fill.
                background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0) 160px), var(--glass-bg)',
                backdropFilter: 'blur(28px)',
                WebkitBackdropFilter: 'blur(28px)',
                border: '1px solid var(--glass-border)',
                boxShadow: 'var(--glass-shadow)',
                maxHeight: 'calc(100vh - 4.5rem)',
              }}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 18 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320, mass: 0.85 }}
            >
              {/* Scrollable inner */}
              <div className="relative overflow-y-auto" style={{ maxHeight: 'calc(100vh - 4.5rem)' }}>
                {/* Header — subtle translucent strip over the glass */}
                <div
                  className="flex items-center justify-between px-5 py-3 sticky top-0 z-10"
                  style={{
                    borderBottom: '1px solid var(--glass-border)',
                    background: 'var(--glass-header)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                  }}
                >
                  <h2 className="text-base font-bold text-text-primary">{title}</h2>
                  <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer text-text-muted hover:text-text-primary"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Content */}
                <div className="p-5 md:px-6 md:py-5">{children}</div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
