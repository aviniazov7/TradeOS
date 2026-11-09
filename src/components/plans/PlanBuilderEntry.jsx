import { useState } from 'react';
import { Crown, Lock, Sparkles } from 'lucide-react';
import Modal from '../shared/Modal';
import { headerAiBtn } from '../shared/headerStyles';

// Premium gate for the builder. Non-premium users get the upgrade prompt
// and never see the questions. Demo bypasses the gate and still cannot save.
export default function PlanBuilderEntry({ isPremium, demo = false, onOpen }) {
  const [locked, setLocked] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`${headerAiBtn} flex-1 sm:flex-none`}
        onClick={() => {
          if (isPremium || demo) onOpen();
          else setLocked(true);
        }}
      >
        <Sparkles className="h-4 w-4 shrink-0" />
        בנה תוכנית עם AI
      </button>
      <Modal isOpen={locked} onClose={() => setLocked(false)} title="Premium" maxWidth="max-w-md">
        <div className="py-2 text-center">
          <span className="mx-auto mb-4 inline-grid h-14 w-14 place-items-center rounded-2xl" style={{ background: 'var(--accent-gradient)' }}>
            <Lock className="h-6 w-6" style={{ color: '#06060a' }} />
          </span>
          <h2 className="text-lg font-bold text-text-primary">בניית תוכנית עם AI היא חלק מ-Premium</h2>
          <p className="mt-2 mb-5 text-sm leading-relaxed text-text-secondary">
            עונים על כמה שאלות ומקבלים טיוטה שאפשר לערוך. השמירה נשארת אצלכם.
          </p>
          <a href="/premium" className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent-muted px-5 text-sm font-bold text-white">
            <Crown className="h-4 w-4" /> שדרוג ל-Premium
          </a>
        </div>
      </Modal>
    </>
  );
}
