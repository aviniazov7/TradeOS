// Page transition
export const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};
export const pageTransition = { duration: 0.3, ease: 'easeOut' };

// Stagger container (for card grids)
export const staggerContainer = {
  initial: {},
  animate: { transition: { staggerChildren: 0.06 } },
};

// Individual card in stagger
export const staggerItem = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3 } },
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
  boxShadow: '0 0 20px rgba(0, 123, 167, 0.08)',
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
