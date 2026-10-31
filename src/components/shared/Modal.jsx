import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { m, AnimatePresence } from 'framer-motion';

let modalCount = 0;

// footer (optional): pinned to the bottom of the card while the body scrolls —
// for action bars. A submit button in it can target a form in the body via the
// `form` attribute. The safe-area inset moves from the body to the footer.
export default function Modal({ isOpen, onClose, title, ariaLabel, children, maxWidth = 'max-w-xl', footer = null }) {
  const cardRef = useRef(null);
  const backdropRef = useRef(null);
  const prevFocusRef = useRef(null);
  // A backdrop press only counts when it starts AND ends on the backdrop.
  // Portaled menus close on mousedown; the click then lands on the backdrop
  // and used to dismiss the dialog mid-edit. A press that starts inside the
  // card (or on a popover) must not.
  const dismissArmedRef = useRef(false);
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
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (depthRef.current !== modalCount) return; // not the topmost modal
      // An open menu or calendar consumes Escape. The popover is still in
      // the DOM here (its own handler closes it with setState).
      if (document.querySelector('[data-popover], .react-datepicker')) return;
      onCloseRef.current?.();
    };
    // Capture runs before a menu's own outside-mousedown handler unmounts it,
    // so we can see that this gesture belongs to the popover, not the dialog.
    const onPointerDown = (e) => {
      if (document.querySelector('[data-popover], .react-datepicker')) {
        dismissArmedRef.current = false;
        return;
      }
      dismissArmedRef.current = e.target === backdropRef.current;
    };
    const onPointerUp = (e) => {
      const armed = dismissArmedRef.current;
      dismissArmedRef.current = false;
      if (!armed || e.target !== backdropRef.current) return;
      if (document.querySelector('[data-popover], .react-datepicker')) return;
      onCloseRef.current?.();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerup', onPointerUp, true);
    return () => {
      clearTimeout(t);
      dismissArmedRef.current = false;
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerup', onPointerUp, true);
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
          <m.div
            ref={backdropRef}
            className="fixed inset-0 z-50 bg-black/55"
            style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />

          {/* Centering wrapper */}
          <div className="fixed inset-0 z-50 flex items-center justify-center px-3 pt-14 pb-4 md:px-6 pointer-events-none">
            {/* Card — iOS-style black glass: translucent + heavy blur. The
                entrance is opacity+slide only (no scale) so the backdrop-filter
                doesn't flicker on Safari. */}
            <m.div
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
              <div className="relative overflow-y-auto overflow-x-hidden overscroll-contain" style={{ maxHeight: 'calc(100dvh - 4.5rem)', touchAction: 'pan-y' }}>
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
                  style={{ paddingBottom: footer ? '1.25rem' : 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
                >
                  {children}
                </div>

                {footer && (
                  <div
                    className="sticky bottom-0 z-10 px-5 md:px-6 pt-3"
                    style={{
                      borderTop: '1px solid var(--glass-border)',
                      background: 'var(--modal-header-solid)',
                      paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
                    }}
                  >
                    {footer}
                  </div>
                )}
              </div>
            </m.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
