import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, PlusCircle, Link2 } from 'lucide-react';
import { getUserProfile, setUserProfile } from '../../services/firestoreService';
import { useAuth } from '../../contexts/AuthContext';
import { modalBackdrop, modalContent, onboardingStep } from '../../utils/animations';
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
          {/* Wizard card */}
          <motion.div
            className="relative max-w-lg w-full rounded-2xl overflow-hidden shadow-2xl"
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid rgba(0,191,255,0.22)',
              boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset',
            }}
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 22, stiffness: 320 }}
          >
            {/* Top glow */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-40 rounded-full pointer-events-none transition-colors duration-500"
              style={{ background: `radial-gradient(circle, ${current.glowColor} 0%, transparent 70%)`, top: -60 }}
            />

            {/* Step counter */}
            <div className="absolute top-4 left-4 text-[10px] text-text-muted font-medium">
              {step + 1}/{ONBOARDING_STEPS.length}
            </div>

            {/* Step content */}
            <div className="px-8 pt-10 pb-6 min-h-[340px] flex flex-col items-center justify-center text-center overflow-hidden relative">
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={step}
                  custom={direction}
                  variants={onboardingStep}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="flex flex-col items-center"
                >
                  {/* Icon with glow ring */}
                  <div className="relative mb-6">
                    <div
                      className="absolute inset-0 rounded-2xl blur-xl opacity-40 transition-colors duration-500"
                      style={{ background: current.glowColor }}
                    />
                    <div className={`relative w-16 h-16 rounded-2xl ${current.bgColor} flex items-center justify-center border border-white/5`}>
                      <Icon className={`w-8 h-8 ${current.color}`} />
                    </div>
                  </div>

                  {/* Title + subtitle */}
                  <h2 className="text-xl font-bold text-text-primary mb-1">{current.title}</h2>
                  <p className="text-xs text-text-muted mb-4">{current.subtitle}</p>

                  {/* Description */}
                  <p className="text-sm text-text-secondary leading-relaxed max-w-sm mb-5">{current.description}</p>

                  {/* Feature highlights */}
                  {current.highlights && (
                    <div className="flex flex-wrap justify-center gap-2">
                      {current.highlights.map((h) => (
                        <span
                          key={h}
                          className={`text-[11px] px-2.5 py-1 rounded-full border font-medium ${current.bgColor} ${current.color} border-current/20`}
                        >
                          {h}
                        </span>
                      ))}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border-primary/50 flex items-center justify-between bg-bg-tertiary/30">
              {/* Skip / finish-without-action */}
              <button
                onClick={complete}
                className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              >
                {isLast ? 'סיים' : 'דלג'}
              </button>

              {/* Step dots */}
              <div className="flex gap-1.5">
                {ONBOARDING_STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === step ? `w-6 ${current.bgColor.replace('/15', '')}` : 'w-1.5 bg-bg-tertiary'
                    }`}
                  />
                ))}
              </div>

              {/* Nav buttons */}
              <div className="flex gap-2">
                {step > 0 && (
                  <button
                    onClick={back}
                    className="p-2 rounded-lg bg-bg-tertiary text-text-primary hover:bg-border-hover transition-colors cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
                {isLast ? (
                  <>
                    {/* Real first actions instead of a dead "let's go" */}
                    <button
                      onClick={() => completeAnd('/exchange')}
                      className="flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-lg border border-accent-primary/40 text-accent-primary hover:bg-accent-primary/10 transition-colors cursor-pointer"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      חבר בורסה
                    </button>
                    <button
                      onClick={() => completeAnd('/journal?new=1')}
                      className="flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-lg bg-accent-primary text-bg-primary hover:bg-accent-hover transition-colors cursor-pointer"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      הוסף עסקה ראשונה
                    </button>
                  </>
                ) : (
                  <button
                    onClick={next}
                    className="flex items-center gap-1 px-4 py-2 text-xs font-semibold rounded-lg bg-accent-primary text-bg-primary hover:bg-accent-hover transition-colors cursor-pointer"
                  >
                    הבא
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
