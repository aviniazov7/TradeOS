import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

let modalCount = 0;

export default function Modal({ isOpen, onClose, title, ariaLabel, children, maxWidth = 'max-w-xl' }) {
  const cardRef = useRef(null);
  const prevFocusRef = useRef(null);
  // Depth at which this modal opened. With nested modals (a form inside a
  // workspace) only the topmost may act on Escape — otherwise one keypress
  // closes the child AND its parent, discarding the form.
  const depthRef = useRef(0);
  // onClose via ref so the Escape/focus effect can depend on [isOpen] only (a
  // parent that recreates onClose each render must not re-run it and steal focus).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (isOpen) {
      modalCount++;
      depthRef.current = modalCount;
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

  // Dialog a11y: move focus into the dialog on open, close on Escape, and
  // restore focus to the trigger on close.
  useEffect(() => {
    if (!isOpen) return undefined;
    prevFocusRef.current = document.activeElement;
    const t = setTimeout(() => cardRef.current?.focus(), 0);
    // Focusable descendants, in DOM order, skipping anything inert.
    const focusables = () => Array.from(
      cardRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) || []
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    const onKey = (e) => {
      if (depthRef.current !== modalCount) return; // not the topmost modal
      if (e.key === 'Escape') { onCloseRef.current?.(); return; }
      // Trap Tab inside the dialog. Focus was set on open and restored on
      // close, but never confined, so tabbing walked straight out into the
      // page behind the modal — invisible to a keyboard user and meaningless
      // to a screen reader.
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) { e.preventDefault(); cardRef.current?.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!cardRef.current?.contains(active)) { e.preventDefault(); first.focus(); return; }
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      if (prevFocusRef.current instanceof HTMLElement) prevFocusRef.current.focus();
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
              ref={cardRef}
              role="dialog"
              aria-modal="true"
              aria-label={ariaLabel || (typeof title === 'string' ? title : 'חלון')}
              tabIndex={-1}
              className={`relative ${maxWidth} w-full rounded-2xl overflow-hidden pointer-events-auto outline-none`}
              style={{
                // Subtle top specular sheen over the dark glass — the 21st.dev
                // "black glass" highlight — layered on top of the translucent fill.
                background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0) 160px), var(--glass-bg)',
                backdropFilter: 'blur(28px)',
                WebkitBackdropFilter: 'blur(28px)',
                border: '1px solid var(--glass-border)',
                boxShadow: 'var(--glass-shadow)',
                // dvh, not vh: on mobile Safari 100vh includes the area behind
                // the browser chrome, so the card was taller than the visible
                // viewport and its bottom edge fell off-screen — the modal
                // looked like it simply had no end. The app already relies on
                // dvh elsewhere.
                maxHeight: 'calc(100dvh - 4.5rem)',
              }}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 18 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320, mass: 0.85 }}
            >
              {/* Scrollable inner */}
              <div className="relative overflow-y-auto overscroll-contain" style={{ maxHeight: 'calc(100dvh - 4.5rem)' }}>
                {/* Header — opaque strip: a translucent one let scrolled
                    content read through and collide with the title. */}
                <div
                  className="flex items-center justify-between px-5 py-3 sticky top-0 z-10"
                  style={{
                    borderBottom: '1px solid var(--glass-border)',
                    // Opaque — no blur needed once nothing shows through.
                    background: 'var(--modal-header-solid)',
                  }}
                >
                  <h2 className="text-base font-bold text-text-primary">{title}</h2>
                  <button
                    onClick={onClose}
                    aria-label="סגור"
                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer text-text-muted hover:text-text-primary"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Content */}
                <div
                  className="p-5 md:px-6 md:py-5"
                  style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
                >
                  {children}
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
