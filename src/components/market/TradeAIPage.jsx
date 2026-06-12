import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { pageVariants, pageTransition } from '../../utils/animations';
import AIChat from './AIChat';

export default function TradeAIPage() {
  // Lock body scroll while the chat is open on mobile (iOS needs
  // position:fixed) — the chat manages its own internal scrolling.
  useEffect(() => {
    const scrollY = window.scrollY;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, []);

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="overflow-hidden"
    >
      <AIChat heightClass="h-[calc(100dvh-10.5rem)] md:h-[calc(100vh-170px)]" />
    </motion.div>
  );
}
