import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Radar } from 'lucide-react';

// Count from 0 → target on mount (and whenever the target changes), eased.
function useCountUp(target, duration = 900) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return n;
}

// Uniform stat chip — all three (scanned / active / live) share the exact size.
function Chip({ value = 0, label, live = false }) {
  const n = useCountUp(value);
  return (
    <div className="w-[82px] h-[60px] shrink-0 rounded-2xl flex flex-col items-center justify-center gap-0.5 bg-white/[0.03] border border-white/10 backdrop-blur-sm transition-all duration-200 hover:border-accent-primary/40 hover:-translate-y-0.5 hover:shadow-[0_0_22px_-8px_rgba(56,189,248,0.6)]">
      {live ? (
        <span className="relative flex h-2.5 w-2.5 mb-0.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-profit opacity-60 animate-ping" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-profit shadow-[0_0_8px_rgba(46,204,155,0.9)]" />
        </span>
      ) : (
        <b className="text-xl font-extrabold leading-none num-mono text-text-primary">{n}</b>
      )}
      <span className={`text-[10.5px] ${live ? 'text-profit font-bold' : 'text-text-muted'}`}>{label}</span>
    </div>
  );
}

// Live radar sweep — a rotating conic wedge over concentric rings, with two
// "blips" that flash as the sweep passes. Pure motion, sits behind the title.
function RadarField() {
  const blip = (delay) => ({
    animate: { opacity: [0, 1, 0.35, 0, 0] },
    transition: { duration: 3.6, times: [0, 0.08, 0.45, 0.9, 1], repeat: Infinity, delay, ease: 'linear' },
  });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute top-1/2 -translate-y-1/2 -right-16 w-[300px] h-[300px] rounded-full">
        <div className="absolute inset-0 rounded-full border border-accent-primary/10" />
        <div className="absolute inset-[46px] rounded-full border border-accent-primary/10" />
        <div className="absolute inset-[94px] rounded-full border border-accent-primary/10" />
        <div className="absolute inset-[136px] rounded-full border border-accent-primary/10" />
        <div className="absolute top-1/2 inset-x-0 h-px bg-accent-primary/10" />
        <div className="absolute inset-y-0 right-1/2 w-px bg-accent-primary/10" />
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: 'conic-gradient(from 0deg, transparent 0deg, rgba(56,189,248,0.30) 34deg, rgba(56,189,248,0.02) 60deg, transparent 62deg)' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 3.6, repeat: Infinity, ease: 'linear' }}
        />
        <motion.span className="absolute w-1.5 h-1.5 rounded-full bg-accent-primary shadow-[0_0_10px_2px_rgba(56,189,248,0.8)]" style={{ top: '34%', right: '38%' }} {...blip(0.6)} />
        <motion.span className="absolute w-1.5 h-1.5 rounded-full bg-accent-primary shadow-[0_0_10px_2px_rgba(56,189,248,0.8)]" style={{ top: '62%', right: '24%' }} {...blip(1.9)} />
      </div>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 88% 30%, rgba(56,189,248,0.10), transparent 55%)' }} />
    </div>
  );
}

// Scanner hero — true-black card, live radar sweep, uniform stat chips.
export default function ScannerHero({ taggedCount = 0, activeCount = 0 }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#050609] mb-6">
      <RadarField />
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-accent-primary"
            style={{ background: 'linear-gradient(145deg, rgba(56,189,248,0.2), transparent)', boxShadow: 'inset 0 0 0 1px rgba(56,189,248,0.32), 0 0 24px -6px rgba(56,189,248,0.6)' }}
          >
            <motion.span animate={{ opacity: [1, 0.55, 1] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
              <Radar className="w-6 h-6" />
            </motion.span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-extrabold text-text-primary tracking-tight">מנוע ויקוף</h1>
            </div>
            <p className="text-[12px] text-text-muted leading-snug max-w-[44ch]">זיהוי אוטומטי של סטאפי ויקוף — LPS / LPSY על שלושה טיימפריימים</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Chip value={taggedCount} label="נסרקים" />
          <Chip value={activeCount} label="פעילים" />
          <Chip live label="פעיל" />
        </div>
      </div>
    </div>
  );
}
