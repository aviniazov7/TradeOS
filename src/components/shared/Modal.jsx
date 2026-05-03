import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { modalBackdrop, modalContent } from '../../utils/animations';

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
        <div className="fixed inset-0 z-50 flex items-center justify-center px-3 pt-14 pb-4 md:pt-14 md:pb-4 md:px-6">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={onClose}
            variants={modalBackdrop}
            initial="initial"
            animate="animate"
            exit="exit"
          />

          {/* Modal */}
          <motion.div
            className={`relative ${maxWidth} w-full rounded-2xl max-h-[calc(100vh-4.5rem)] overflow-y-auto`}
            style={{
              background: 'rgba(14,14,14,0.88)',
              border: '1px solid rgba(255,255,255,0.09)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              boxShadow: '0 32px 64px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
            variants={modalContent}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 md:px-6 md:py-3 border-b border-white/8 sticky top-0 z-10 rounded-t-2xl"
              style={{ background: 'rgba(14,14,14,0.92)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}>
              <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 md:px-6 md:py-4">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
