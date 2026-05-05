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
        /* Outer wrapper — same as GuideModal: backdrop blur on the whole overlay */
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center px-3 pt-14 pb-4 md:px-6 bg-black/80"
          style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          onClick={onClose}
        >
          {/* Card — transparent like GuideModal, glow gives it the glass feel */}
          <motion.div
            className={`relative ${maxWidth} w-full rounded-2xl overflow-hidden shadow-2xl`}
            style={{
              background: 'var(--color-bg-secondary)',   /* rgba(255,255,255,0.05) — near-transparent */
              border: '1px solid rgba(0,191,255,0.22)',
              boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset',
              maxHeight: 'calc(100vh - 4.5rem)',
            }}
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 22, stiffness: 320 }}
            onClick={e => e.stopPropagation()}
          >
            {/* Top cyan glow — identical to GuideModal's exchange.glow */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse, rgba(0,191,255,0.35) 0%, transparent 70%)' }}
            />

            {/* Scrollable inner */}
            <div className="relative overflow-y-auto" style={{ maxHeight: 'calc(100vh - 4.5rem)' }}>
              {/* Header */}
              <div
                className="flex items-center justify-between px-5 py-3 sticky top-0 z-10"
                style={{
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(255,255,255,0.02)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                }}
              >
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer text-text-muted hover:text-text-primary"
                >
                  <X className="w-4 h-4" />
                </button>
                <h2 className="text-base font-bold text-text-primary">{title}</h2>
              </div>

              {/* Content */}
              <div className="p-5 md:px-6 md:py-5">{children}</div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
