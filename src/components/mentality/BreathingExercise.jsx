import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wind, Play, Pause, RotateCcw } from 'lucide-react';
import Modal from '../shared/Modal';

// Simple comfortable breathing: 4-4-6
const PHASES = [
  { key: 'inhale', label: 'שאיפה', duration: 4, instruction: 'שאף דרך האף', color: '#22c55e' },
  { key: 'hold', label: 'החזקה', duration: 4, instruction: 'החזק בעדינות', color: '#eab308' },
  { key: 'exhale', label: 'נשיפה', duration: 6, instruction: 'נשוף דרך הפה', color: '#3b82f6' },
];

export default function BreathingExercise() {
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
      {/* Card */}
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 20 },
          visible: { opacity: 1, y: 0 },
        }}
        onClick={() => setModalOpen(true)}
        className="relative bg-bg-secondary border border-border-primary rounded-xl p-6 transition-all cursor-pointer hover:border-accent-primary/30 hover:bg-bg-secondary/80"
      >
        <span className="absolute top-3 left-3 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-accent-primary/15 text-accent-primary">
          4-4-6
        </span>

        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-accent-primary/15">
            <Wind className="w-7 h-7 text-accent-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary mb-1">תרגיל נשימה</h3>
            <p className="text-xs text-text-secondary leading-relaxed">הרגעה מהירה לפני עסקה — שאיפה 4, החזקה 4, נשיפה 6</p>
          </div>
          <span className="text-[11px] font-medium px-3 py-1 rounded-full bg-accent-primary/10 text-accent-primary">
            התחל תרגיל
          </span>
        </div>
      </motion.div>

      {/* Modal */}
      <Modal isOpen={modalOpen} onClose={handleClose} title="תרגיל נשימה 4-4-6" maxWidth="max-w-md">
        <div className="flex flex-col items-center gap-5 py-2">
          {/* Cycles counter */}
          <div className="text-xs text-text-muted">
            מחזורים שהושלמו: <span className="text-accent-primary font-bold">{cyclesDone}</span>
          </div>

          {/* Breathing Circle */}
          <div className="relative w-56 h-56 flex items-center justify-center">
            <motion.div
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

            <motion.div
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
                  <motion.div
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
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          </div>

          {/* Instruction */}
          <AnimatePresence mode="wait">
            <motion.p
              key={currentPhase.key}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.3 }}
              className="text-sm text-text-secondary text-center min-h-[20px]"
            >
              {isRunning ? currentPhase.instruction : 'לחץ "התחל" כדי להתחיל'}
            </motion.p>
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
            💡 <strong>טיפ:</strong> 3-4 מחזורים לפני עסקה מפחיתים סטרס
          </div>
        </div>
      </Modal>
    </>
  );
}
