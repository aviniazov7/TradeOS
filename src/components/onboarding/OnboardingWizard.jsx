import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { m, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, PlusCircle, Link2, Check, FlaskConical } from 'lucide-react';
import toast from 'react-hot-toast';
import { getUserProfile, setUserProfile, timestamp } from '../../services/firestoreService';
import { receivesMarketingEmail } from '../../utils/marketingConsent';
import { useAuth } from '../../contexts/AuthContext';
import { useDemoMode } from '../../hooks/useDemoMode';
import { onboardingStep } from '../../utils/animations';
import {
  ONBOARDING_DISMISS_KEY, ONBOARDING_REOPEN_EVENT, shouldShowOnboarding,
  dismissOnboardingSession, readOnboardingStep, writeOnboardingStep, clearOnboardingStep,
} from '../../utils/onboardingGate';
import { ONBOARDING_STEPS } from './onboardingSteps';

function readDismissed() {
  try { return sessionStorage.getItem(ONBOARDING_DISMISS_KEY) === '1'; } catch { return false; }
}

export default function OnboardingWizard() {
  const { user, profile } = useAuth();
  const demo = useDemoMode();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  // null until the user touches the box, so a late profile snapshot still wins.
  const [emailChoice, setEmailChoice] = useState(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const emailOn = emailChoice ?? (profile ? receivesMarketingEmail(profile) : false);
  // Apply the saved step when the user id arrives. Doing it in render (not an
  // effect) avoids writing step 0 before the read and wiping the resume point.
  const [stepUid, setStepUid] = useState(null);
  if (user?.uid && user.uid !== stepUid) {
    setStepUid(user.uid);
    setStep(readOnboardingStep(user.uid, localStorage, ONBOARDING_STEPS.length - 1));
  }

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    getUserProfile(user.uid).then(({ exists, data }) => {
      if (!cancelled) setNeedsOnboarding(exists && data.onboardingCompleted === false);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  const rememberStep = (next) => {
    setStep(next);
    if (user?.uid) writeOnboardingStep(user.uid, next);
  };

  useEffect(() => {
    const onReopen = () => setDismissed(false);
    window.addEventListener(ONBOARDING_REOPEN_EVENT, onReopen);
    return () => window.removeEventListener(ONBOARDING_REOPEN_EVENT, onReopen);
  }, []);

  // Derived, not stored: a route change or a dismissal hides the dialog on
  // the same render, including a remount on /journal before the profile write
  // has landed.
  const show = shouldShowOnboarding({
    onboardingCompleted: needsOnboarding ? false : true,
    pathname,
    dismissed,
  });

  const complete = async () => {
    dismissOnboardingSession();
    setDismissed(true);
    setNeedsOnboarding(false);
    if (user?.uid) clearOnboardingStep(user.uid);
    await setUserProfile(user.uid, { onboardingCompleted: true });
  };

  // Hide for this visit only. The profile stays unfinished, so the checklist
  // (or the next session) can open the wizard again on the same step.
  const skip = () => {
    dismissOnboardingSession();
    setDismissed(true);
  };

  // Finish the wizard AND land the user on a concrete first action — the
  // last slide used to end with a dead "בואו נתחיל!" that left new users
  // staring at an empty dashboard.
  const completeAnd = (path) => {
    complete();
    navigate(path);
  };

  const toggleEmailUpdates = async () => {
    if (!user?.uid || emailBusy) return;
    const next = !emailOn;
    setEmailChoice(next);
    setEmailBusy(true);
    try {
      await setUserProfile(user.uid, { marketingEmails: next, marketingEmailsAt: timestamp() });
    } catch {
      setEmailChoice(!next);
      toast.error('שמירת הבחירה נכשלה. נסה שוב');
    } finally {
      setEmailBusy(false);
    }
  };

  const exploreDemo = () => {
    demo.enter();
    skip();
    navigate('/');
  };

  const next = () => {
    setDirection(1);
    rememberStep(Math.min(step + 1, ONBOARDING_STEPS.length - 1));
  };

  const back = () => {
    setDirection(-1);
    rememberStep(Math.max(step - 1, 0));
  };

  const isLast = step === ONBOARDING_STEPS.length - 1;
  const current = ONBOARDING_STEPS[step];
  const Icon = current.icon;

  return (
    <AnimatePresence>
      {show && (
        <m.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80"
          style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          <m.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-title"
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
                <m.div
                  key={step}
                  custom={direction}
                  variants={onboardingStep}
                  initial="enter"
                  animate="center"
                  exit="exit"
                >
                  <span
                    className="w-14 h-14 rounded-2xl grid place-items-center mb-5"
                    style={{ background: 'linear-gradient(135deg, #005e80 0%, #007ba7 100%)', boxShadow: '0 0 32px -8px rgba(0,123,167,0.75)' }}
                  >
                    {Icon && <Icon className="w-7 h-7" style={{ color: '#ffffff' }} />}
                  </span>
                  <h2 id="onboarding-title" className="text-[22px] font-extrabold text-text-primary leading-tight">{current.title}</h2>
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
                </m.div>
              </AnimatePresence>
            </div>

            {/* Footer — on the last slide the two first actions take the full
                width, so they never squeeze on a phone. */}
            <div className="px-5 py-4 border-t border-border-primary flex flex-col gap-3">
              <label data-testid="onboarding-email-consent" className="flex items-start gap-2.5 text-sm text-text-secondary leading-relaxed cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={emailOn}
                  disabled={emailBusy}
                  onChange={toggleEmailUpdates}
                  className="mt-0.5 w-4 h-4 shrink-0 accent-[#007ba7] cursor-pointer"
                />
                <span>אני מעוניין/ת לקבל עדכונים ותזכורות במייל</span>
              </label>
              <div className="flex items-center justify-between gap-2 flex-wrap">
              {isLast ? (
                <div className="w-full flex flex-col gap-2">
                  <button
                    onClick={() => completeAnd('/exchange')}
                    className="h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent-muted hover:bg-accent-primary text-white text-sm font-bold transition-colors cursor-pointer"
                  >
                    <Link2 className="w-4 h-4" /> חיבור בורסה
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => completeAnd('/journal?new=1')}
                      className="h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border-hover text-text-primary text-sm font-bold hover:bg-bg-tertiary transition-colors cursor-pointer"
                    >
                      <PlusCircle className="w-4 h-4" /> עסקה ראשונה
                    </button>
                    <button
                      onClick={exploreDemo}
                      className="h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border-hover text-text-primary text-sm font-bold hover:bg-bg-tertiary transition-colors cursor-pointer"
                    >
                      <FlaskConical className="w-4 h-4" /> נתוני דמו
                    </button>
                  </div>
                  <button onClick={skip} className="h-8 text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer">
                    אעשה את זה אחר כך
                  </button>
                </div>
              ) : (
                <>
                  <button onClick={skip} className="h-10 px-2 text-sm text-text-muted hover:text-text-primary transition-colors cursor-pointer">
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
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
