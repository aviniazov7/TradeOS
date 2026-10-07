import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, PlusCircle, Link2, Check } from 'lucide-react';
import { getUserProfile, setUserProfile } from '../../services/firestoreService';
import { useAuth } from '../../contexts/AuthContext';
import { onboardingStep } from '../../utils/animations';
import { ONBOARDING_STEPS } from './onboardingSteps';

export default function OnboardingWizard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    if (!user) return;
    const check = async () => {
      const { exists, data } = await getUserProfile(user.uid);
      if (exists && data.onboardingCompleted === false) {
        setShow(true);
      }
    };
    check();
  }, [user]);

  const complete = async () => {
    setShow(false);
    await setUserProfile(user.uid, { onboardingCompleted: true });
  };

  // Finish the wizard AND land the user on a concrete first action — the
  // last slide used to end with a dead "בואו נתחיל!" that left new users
  // staring at an empty dashboard.
  const completeAnd = (path) => {
    complete();
    navigate(path);
  };

  const next = () => {
    setDirection(1);
    setStep((s) => Math.min(s + 1, ONBOARDING_STEPS.length - 1));
  };

  const back = () => {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 0));
  };

  const isLast = step === ONBOARDING_STEPS.length - 1;
  const current = ONBOARDING_STEPS[step];
  const Icon = current.icon;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80"
          style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="הגדרה ראשונית"
            className="relative max-w-md w-full rounded-2xl overflow-hidden border border-border-primary bg-bg-secondary"
            style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.55)' }}
            initial={{ scale: 0.94, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 16 }}
            transition={{ type: 'spring', damping: 24, stiffness: 320 }}
          >
            {/* Progress — one segment per slide */}
            <div className="flex items-center gap-3 px-5 pt-5">
              <div className="flex-1 flex gap-1.5" aria-hidden="true">
                {ONBOARDING_STEPS.map((_, i) => (
                  <span key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= step ? 'bg-accent-primary' : 'bg-bg-tertiary'}`} />
                ))}
              </div>
              <span className="text-xs text-text-muted num-mono" dir="ltr">{step + 1}/{ONBOARDING_STEPS.length}</span>
            </div>

            {/* Slide */}
            <div className="px-6 pt-6 pb-6 min-h-[360px] overflow-hidden relative">
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={step}
                  custom={direction}
                  variants={onboardingStep}
                  initial="enter"
                  animate="center"
                  exit="exit"
                >
                  <span
                    className="w-14 h-14 rounded-2xl grid place-items-center mb-5"
                    style={{ background: 'linear-gradient(135deg, #2563eb 0%, #38bdf8 100%)', boxShadow: '0 0 32px -8px rgba(59,130,246,0.75)' }}
                  >
                    {Icon && <Icon className="w-7 h-7" style={{ color: '#06060a' }} />}
                  </span>
                  <h2 className="text-[22px] font-extrabold text-text-primary leading-tight">{current.title}</h2>
                  <p className="text-sm text-text-secondary leading-relaxed mt-2">{current.description}</p>

                  <ul className="mt-5 rounded-xl border border-border-primary bg-bg-tertiary divide-y divide-border-primary">
                    {current.highlights.map((h) => (
                      <li key={h} className="flex items-center gap-3 px-3.5 py-3">
                        <span className="w-5 h-5 shrink-0 grid place-items-center rounded-full bg-accent-primary/15">
                          <Check className="w-3 h-3 text-accent-hover" strokeWidth={3} />
                        </span>
                        <span className="text-[13px] text-text-primary">{h}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer — on the last slide the two first actions take the full
                width, so they never squeeze on a phone. */}
            <div className="px-5 py-4 border-t border-border-primary flex items-center justify-between gap-2 flex-wrap">
              {isLast ? (
                <div className="w-full grid grid-cols-2 gap-2">
                  <button
                    onClick={() => completeAnd('/exchange')}
                    className="h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border-hover text-text-primary text-sm font-bold hover:bg-bg-tertiary transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Link2 className="w-4 h-4" /> חיבור בורסה
                  </button>
                  <button
                    onClick={() => completeAnd('/journal?new=1')}
                    className="h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent-muted hover:bg-accent-primary text-white text-sm font-bold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <PlusCircle className="w-4 h-4" /> עסקה ראשונה
                  </button>
                  <button onClick={complete} className="col-span-2 h-8 text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer">
                    אעשה את זה אחר כך
                  </button>
                </div>
              ) : (
                <>
                  <button onClick={complete} className="h-10 px-2 text-sm text-text-muted hover:text-text-primary transition-colors cursor-pointer">
                    דלג
                  </button>
                  <div className="flex gap-2">
                    {step > 0 && (
                      <button
                        onClick={back}
                        aria-label="הקודם"
                        className="w-10 h-10 grid place-items-center rounded-xl border border-border-primary text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={next}
                      className="h-10 inline-flex items-center gap-1 px-5 rounded-xl bg-accent-muted hover:bg-accent-primary text-white text-sm font-bold transition-colors cursor-pointer"
                    >
                      הבא <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
