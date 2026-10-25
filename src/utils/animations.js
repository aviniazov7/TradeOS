// Vertical only. A sideways slide fights RTL (the page would enter from the
// wrong side). The same curve is used for pages and for tab bodies.
const riseEase = [0.22, 1, 0.36, 1];

// Page transition
export const pageVariants = {
  initial: { opacity: 0, y: 72 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -36 },
};
export const pageTransition = { duration: 0.65, ease: riseEase };

// Tab body. Same direction as the page, shorter, so a tab change reads as a
// smaller version of the page change and stays RTL-safe.
export const tabSlide = {
  initial: { opacity: 0, y: 48 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -28 },
};
export const tabTransition = { duration: 0.5, ease: riseEase };

// Exchange cards: a clear lift on top of the brand-colored beam / spotlight.
// `delay: 0` so the entrance delay on the same element doesn't lag the hover.
export const exchangeHover = {
  y: -16,
  transition: { type: 'spring', stiffness: 380, damping: 22, delay: 0 },
};

// Stagger container (for card grids)
export const staggerContainer = {
  initial: {},
  animate: { transition: { staggerChildren: 0.14 } },
};

// Individual card in stagger
export const staggerItem = {
  initial: { opacity: 0, y: 48 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.55 } },
};

// Modal
export const modalBackdrop = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.25, ease: 'easeOut' } },
  exit: { opacity: 0, transition: { duration: 0.2, ease: 'easeIn' } },
};

export const modalContent = {
  initial: { opacity: 0, y: 24, scale: 0.94 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 380, damping: 32, mass: 0.8 },
  },
  exit: {
    opacity: 0,
    y: 12,
    scale: 0.96,
    transition: { duration: 0.18, ease: 'easeIn' },
  },
};

// Card hover
export const cardHover = {
  scale: 1.02,
  boxShadow: '0 0 20px rgba(56, 189, 248, 0.08)',
};

// Fade in
export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.4 } },
};

// Onboarding wizard step transitions (RTL-aware)
export const onboardingStep = {
  enter: (direction) => ({ x: direction > 0 ? -80 : 80, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: (direction) => ({ x: direction > 0 ? 80 : -80, opacity: 0, transition: { duration: 0.2 } }),
};
