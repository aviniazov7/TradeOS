import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  UI_TOUR_REPLAY_EVENT,
  UI_TOUR_STEPS,
  UI_TOUR_WIZARD_EVENT,
  isTourCandidate,
  isTourTargetVisible,
  noteTourCandidate,
  readTourSeen,
  shouldShowUiTour,
  tourCardPosition,
  visibleTourSteps,
  writeTourSeen,
} from '../../utils/uiTour';

function measureTarget(selector) {
  const el = selector ? document.querySelector(selector) : null;
  if (!isTourTargetVisible(el)) return null;
  const rect = el.getBoundingClientRect();
  const pad = 6;
  return {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
    bottom: rect.bottom + pad,
  };
}

export default function UiTour() {
  const { user, profile } = useAuth();
  const uid = user?.uid;
  const [seenUid, setSeenUid] = useState(null);
  const [seen, setSeen] = useState(false);
  const [replay, setReplay] = useState(false);
  const [wizardGate, setWizardGate] = useState('unknown');
  const [stepIndex, setStepIndex] = useState(0);
  const [steps, setSteps] = useState(() => UI_TOUR_STEPS.filter((step) => !step.optional));
  const [frame, setFrame] = useState(null);

  if (uid && uid !== seenUid) {
    setSeenUid(uid);
    setSeen(readTourSeen(uid));
    setReplay(false);
    setStepIndex(0);
  }

  useEffect(() => {
    noteTourCandidate(uid, profile?.onboardingCompleted);
  }, [uid, profile?.onboardingCompleted]);

  useEffect(() => {
    const onWizard = (event) => setWizardGate(event.detail?.open ? 'open' : 'closed');
    const onReplay = () => {
      setReplay(true);
      setStepIndex(0);
    };
    window.addEventListener(UI_TOUR_WIZARD_EVENT, onWizard);
    window.addEventListener(UI_TOUR_REPLAY_EVENT, onReplay);
    return () => {
      window.removeEventListener(UI_TOUR_WIZARD_EVENT, onWizard);
      window.removeEventListener(UI_TOUR_REPLAY_EVENT, onReplay);
    };
  }, []);

  const open = shouldShowUiTour({
    uid,
    profileKnown: profile != null,
    wizardClosed: wizardGate === 'closed',
    seen,
    candidate: isTourCandidate(uid, profile?.onboardingCompleted),
    replay,
  });

  useEffect(() => {
    if (!open) return undefined;
    const measure = () => {
      const nextSteps = visibleTourSteps(
        UI_TOUR_STEPS,
        (step) => isTourTargetVisible(document.querySelector(step.target)),
      );
      const usable = nextSteps.length ? nextSteps : UI_TOUR_STEPS.filter((step) => !step.optional);
      setSteps((prev) => {
        const same = prev.length === usable.length && prev.every((step, i) => step.id === usable[i].id);
        return same ? prev : usable;
      });
      setStepIndex((index) => Math.min(index, usable.length - 1));
      const current = usable[Math.min(stepIndex, usable.length - 1)];
      const rect = measureTarget(current?.target);
      const card = tourCardPosition(rect, { width: window.innerWidth, height: window.innerHeight });
      const light = document.documentElement.classList.contains('light');
      setFrame({ rect, card, shade: light ? 'rgba(15, 23, 42, 0.46)' : 'rgba(0, 0, 0, 0.62)' });
    };
    measure();
    window.addEventListener('resize', measure);
    document.getElementById('app-scroll')?.addEventListener('scroll', measure, { passive: true });
    return () => {
      window.removeEventListener('resize', measure);
      document.getElementById('app-scroll')?.removeEventListener('scroll', measure);
    };
  }, [open, stepIndex]);

  const finish = useCallback(() => {
    if (uid) writeTourSeen(uid);
    setSeen(true);
    setReplay(false);
    setStepIndex(0);
  }, [uid]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, finish]);

  if (!open) return null;
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  if (!step || !frame) return null;
  const last = stepIndex >= steps.length - 1;

  return (
    <div className="fixed inset-0 z-[95]" role="dialog" aria-modal="true" aria-labelledby="ui-tour-title" dir="rtl" data-testid="ui-tour">
      {frame.rect && (
        <div
          className="absolute rounded-2xl border-2 border-accent-primary pointer-events-none"
          data-testid="ui-tour-ring"
          style={{
            top: frame.rect.top,
            left: frame.rect.left,
            width: frame.rect.width,
            height: frame.rect.height,
            boxShadow: `0 0 0 9999px ${frame.shade}`,
          }}
        />
      )}
      <div
        className="absolute z-10 rounded-2xl border border-border-primary bg-bg-secondary p-4 text-text-primary"
        style={{ top: frame.card.top, left: frame.card.left, width: frame.card.width, boxShadow: '0 24px 60px rgba(0,0,0,0.45)' }}
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 flex gap-1" aria-hidden="true">
            {steps.map((item, index) => (
              <span key={item.id} className={`h-1 flex-1 rounded-full ${index <= stepIndex ? 'bg-accent-primary' : 'bg-bg-tertiary'}`} />
            ))}
          </div>
          <span className="text-[11px] text-text-muted num-mono" dir="ltr">{stepIndex + 1}/{steps.length}</span>
        </div>
        <h2 id="ui-tour-title" className="text-base font-bold">{step.title}</h2>
        <p className="text-sm text-text-secondary leading-relaxed mt-1">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={finish} className="h-10 px-2 text-sm text-text-muted hover:text-text-primary cursor-pointer">
            דלג
          </button>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
                aria-label="הקודם"
                className="w-10 h-10 grid place-items-center rounded-xl border border-border-primary text-text-secondary hover:text-text-primary hover:bg-bg-tertiary cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? finish() : setStepIndex((index) => index + 1))}
              className="h-10 inline-flex items-center gap-1 px-4 rounded-xl bg-accent-muted hover:bg-accent-primary text-white text-sm font-bold cursor-pointer"
            >
              {last ? 'סיום' : 'הבא'}
              {!last && <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
