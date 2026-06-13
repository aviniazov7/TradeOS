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
          {/* Backdrop — blur sits here only, NOT on the card */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/80"
            style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Centering wrapper */}
          <div className="fixed inset-0 z-50 flex items-center justify-center px-3 pt-14 pb-4 md:px-6 pointer-events-none">
            {/* Card — NO backdrop-filter (avoids Safari scale+blur flicker) */}
            <motion.div
              className={`relative ${maxWidth} w-full rounded-2xl overflow-hidden shadow-2xl pointer-events-auto`}
              style={{
                background: 'var(--color-bg-solid)',
                border: '1px solid rgba(0,191,255,0.22)',
                boxShadow: '0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset',
                maxHeight: 'calc(100vh - 4.5rem)',
              }}
              initial={{ scale: 0.93, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.93, opacity: 0, y: 16 }}
              transition={{ type: 'spring', damping: 24, stiffness: 340, mass: 0.8 }}
            >
              {/* Top cyan glow */}
              <div
                className="absolute top-0 left-1/2 -translate-x-1/2 w-56 h-24 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse, rgba(0,191,255,0.30) 0%, transparent 70%)' }}
              />

              {/* Scrollable inner */}
              <div className="relative overflow-y-auto" style={{ maxHeight: 'calc(100vh - 4.5rem)' }}>
                {/* Header — solid background that matches the modal card so
                    scrolled content can't bleed through and turn the title
                    illegible. backdrop-filter as a secondary safety net on
                    browsers that respect alpha + blur cleanly. */}
                <div
                  className="flex items-center justify-between px-5 py-3 sticky top-0 z-10"
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    background: 'var(--color-bg-solid)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
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
