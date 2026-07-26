import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot } from 'lucide-react';

// "TradeAI is thinking" indicator that cycles through `steps` while a report
// generates. Shared by AICoachPanel + BacktestAICoachPanel, which had near
// duplicate copies differing only in step text (issue #216) — the step labels
// are now a prop.
export default function ThinkingIndicator({ steps }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % steps.length), 1600);
    return () => clearInterval(id);
  }, [steps.length]);
  return (
    <div className="flex items-start gap-3 bg-bg-secondary border border-border-primary rounded-2xl p-4">
      <div className="shrink-0 w-9 h-9 rounded-full bg-accent-primary/15 border border-accent-primary/30 flex items-center justify-center">
        <Bot className="w-4.5 h-4.5 text-accent-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-text-primary">TradeAI</span>
          <span className="inline-flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-pulse" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-pulse" style={{ animationDelay: '180ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-pulse" style={{ animationDelay: '360ms' }} />
          </span>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className="text-xs text-text-secondary mt-1"
          >
            {steps[i]}…
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
