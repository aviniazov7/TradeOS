import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, BarChart3 } from 'lucide-react';
import { pageVariants, pageTransition } from '../../utils/animations';
import AIChat from './AIChat';
import ChartAnalyzer from './ChartAnalyzer';

const TABS = [
  { id: 'chat', label: 'צ׳אט', icon: MessageCircle },
  { id: 'analyze', label: 'ניתוח גרפים', icon: BarChart3 },
];

export default function TradeAIPage() {
  const [tab, setTab] = useState('chat');

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

  const heightClass = 'h-[calc(100dvh-13.5rem)] md:h-[calc(100vh-218px)]';

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="overflow-hidden"
    >
      {/* Tab switch: chat ↔ chart analysis */}
      <div className="max-w-2xl mx-auto w-full mb-3">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-bg-secondary/50 border border-border-primary">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                tab === t.id
                  ? 'bg-accent-primary text-bg-primary shadow-lg shadow-accent-primary/20'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'chat'
        ? <AIChat heightClass={heightClass} />
        : <ChartAnalyzer heightClass={heightClass} />
      }
    </motion.div>
  );
}
