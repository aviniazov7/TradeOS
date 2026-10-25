import { useState, useEffect, useRef } from 'react';
import { m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Wind, Play, Pause, RotateCcw, Lightbulb } from 'lucide-react';
import Modal from '../shared/Modal';
import { ZoneTile } from './ZoneTiles';
import { ZONE_COLORS, tint } from './zoneStyle';

// Simple comfortable breathing: 4-4-6
const PHASES = [
  { key: 'inhale', label: 'שאיפה', duration: 4, instruction: 'שאף דרך האף', color: '#22c55e' },
  { key: 'hold', label: 'החזקה', duration: 4, instruction: 'החזק בעדינות', color: '#eab308' },
  { key: 'exhale', label: 'נשיפה', duration: 6, instruction: 'נשוף דרך הפה', color: '#007ba7' },
];

// Preview ring keyframes: grow over the inhale, hold, shrink over the exhale.
const CYCLE = PHASES.reduce((a, p) => a + p.duration, 0);
const PREVIEW_TIMES = [0, PHASES[0].duration / CYCLE, (PHASES[0].duration + PHASES[1].duration) / CYCLE, 1];
const color = ZONE_COLORS.breathing;

export default function BreathingExercise() {
  const reduceMotion = useReducedMotion();
  const [modalOpen, setModalOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(PHASES[0].duration);
  const [cyclesDone, setCyclesDone] = useState(0);
  const intervalRef = useRef(null);

  const currentPhase = PHASES[phaseIdx];

  // Countdown timer
  useEffect(() => {
    if (!isRunning) return;

    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev > 1) return prev - 1;
        const nextIdx = (phaseIdx + 1) % PHASES.length;
        setPhaseIdx(nextIdx);
        if (nextIdx === 0) setCyclesDone((c) => c + 1);
        return PHASES[nextIdx].duration;
      });
    }, 1000);

    return () => clearInterval(intervalRef.current);
  }, [isRunning, phaseIdx]);

  const handleStart = () => setIsRunning(true);
  const handlePause = () => setIsRunning(false);
  const handleReset = () => {
    setIsRunning(false);
    setPhaseIdx(0);
    setSecondsLeft(PHASES[0].duration);
    setCyclesDone(0);
  };

  const handleClose = () => {
    handleReset();
    setModalOpen(false);
  };

  const circleScale = currentPhase.key === 'inhale' ? 1.4 : currentPhase.key === 'exhale' ? 0.7 : 1.4;

  return (
    <>
      {/* Tile */}
      <ZoneTile
        as="button"
        type="button"
        onClick={() => setModalOpen(true)}
        aria-label="תרגיל נשימה 4-4-6 · התחל תרגיל"
        aria-haspopup="dialog"
        interactive
        icon={Wind}
        color={color}
        title="תרגיל נשימה"
        caption="איפוס מהיר לפני עסקה"
        footer={(
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary group-hover:text-text-primary transition-colors">
            <Play className="w-3.5 h-3.5" aria-hidden />
            התחל תרגיל
          </span>
        )}
      >
        <div className="flex items-center gap-4">
          {/* Calm preview: the ring breathes in the same 4-4-6 rhythm. */}
          <div className="relative w-16 h-16 shrink-0 grid place-items-center" aria-hidden>
            <span className="absolute inset-0 rounded-full border" style={{ borderColor: tint(color, 30) }} />
            <m.span
              className="w-12 h-12 rounded-full"
              style={{ background: `radial-gradient(circle at 50% 40%, ${tint(color, 55)}, ${tint(color, 18)})`, boxShadow: `0 0 18px ${tint(color, 30)}` }}
              initial={{ scale: 0.62 }}
              animate={reduceMotion ? { scale: 0.85 } : { scale: [0.62, 1, 1, 0.62] }}
              transition={reduceMotion ? { duration: 0 } : { duration: CYCLE, times: PREVIEW_TIMES, ease: 'easeInOut', repeat: Infinity }}
            />
          </div>
          <ul className="space-y-1 text-xs min-w-0">
            {PHASES.map((p) => (
              <li key={p.key} className="flex items-center gap-2 text-text-secondary">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.color }} aria-hidden />
                <span>{p.label}</span>
                <span className="text-text-muted"><span className="num-mono">{p.duration}</span> ש׳</span>
              </li>
            ))}
          </ul>
        </div>
      </ZoneTile>

      {/* Modal */}
      <Modal isOpen={modalOpen} onClose={handleClose} title="תרגיל נשימה 4-4-6" maxWidth="max-w-md">
        <div className="flex flex-col items-center gap-5 py-2">
          {/* Cycles counter */}
          <div className="text-xs text-text-muted">
            מחזורים שהושלמו: <span className="text-accent-primary font-bold">{cyclesDone}</span>
          </div>

          {/* Breathing Circle */}
          <div className="relative w-56 h-56 flex items-center justify-center">
            <m.div
              className="absolute inset-0 rounded-full border-2"
              animate={{
                borderColor: isRunning ? currentPhase.color : 'var(--color-border-primary)',
                opacity: isRunning ? [0.3, 0.6, 0.3] : 0.3,
              }}
              transition={{
                borderColor: { duration: 0.8 },
                opacity: { duration: 2, repeat: Infinity },
              }}
            />

            <m.div
              className="w-36 h-36 rounded-full flex items-center justify-center shadow-2xl"
              animate={{
                scale: isRunning ? circleScale : 1,
                backgroundColor: isRunning ? `${currentPhase.color}33` : 'var(--color-bg-tertiary)',
                boxShadow: isRunning ? `0 0 60px ${currentPhase.color}66` : '0 0 0 transparent',
              }}
              transition={{
                scale: { duration: currentPhase.duration, ease: 'easeInOut' },
                backgroundColor: { duration: 0.6 },
                boxShadow: { duration: 0.8 },
              }}
            >
              <div className="text-center">
                <AnimatePresence mode="wait">
                  <m.div
                    key={currentPhase.key}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="text-sm font-semibold text-text-primary">{currentPhase.label}</div>
                    <div className="text-4xl font-bold mt-1" style={{ color: currentPhase.color }}>
                      {secondsLeft}
                    </div>
                  </m.div>
                </AnimatePresence>
              </div>
            </m.div>
          </div>

          {/* Instruction */}
          <AnimatePresence mode="wait">
            <m.p
              key={currentPhase.key}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.3 }}
              className="text-sm text-text-secondary text-center min-h-[20px]"
            >
              {isRunning ? currentPhase.instruction : 'לחץ "התחל" כדי להתחיל'}
            </m.p>
          </AnimatePresence>

          {/* Phase Dots */}
          <div className="flex items-center gap-2">
            {PHASES.map((phase, idx) => (
              <div key={phase.key} className="flex items-center gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-full transition-all"
                  style={{
                    backgroundColor: isRunning && idx === phaseIdx ? phase.color : 'rgba(156, 163, 175, 0.3)',
                    boxShadow: isRunning && idx === phaseIdx ? `0 0 10px ${phase.color}` : 'none',
                  }}
                />
                <span className={`text-[10px] ${isRunning && idx === phaseIdx ? 'text-text-primary font-semibold' : 'text-text-muted'}`}>
                  {phase.label} {phase.duration}s
                </span>
                {idx < PHASES.length - 1 && <span className="text-text-muted">←</span>}
              </div>
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 w-full max-w-xs">
            {!isRunning ? (
              <button
                onClick={handleStart}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-accent-primary text-bg-primary font-semibold hover:bg-accent-hover transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4" />
                {cyclesDone > 0 ? 'המשך' : 'התחל'}
              </button>
            ) : (
              <button
                onClick={handlePause}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-bg-tertiary text-text-primary font-semibold hover:bg-border-hover transition-colors cursor-pointer"
              >
                <Pause className="w-4 h-4" />
                השהה
              </button>
            )}
            <button
              onClick={handleReset}
              disabled={cyclesDone === 0 && phaseIdx === 0 && !isRunning}
              className="flex items-center justify-center p-2.5 rounded-lg bg-bg-tertiary text-text-muted hover:text-text-primary hover:bg-border-hover transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="איפוס"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Tip */}
          <div className="text-[11px] text-text-muted text-center px-4 leading-relaxed">
            <Lightbulb className="inline w-3.5 h-3.5 -mt-0.5 ml-1" aria-hidden />
            <strong>טיפ:</strong> 3-4 מחזורים לפני עסקה מפחיתים סטרס
          </div>
        </div>
      </Modal>
    </>
  );
}
