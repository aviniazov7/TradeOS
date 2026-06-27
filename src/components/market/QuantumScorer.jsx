import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, Save, RotateCcw, History, ChevronDown, Trash2,
  TrendingUp, AlertTriangle, XCircle, CheckCircle2,
  BarChart2, ArrowLeftRight, Eye, RefreshCw, Layers, Calendar,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { addToUserCollection, subscribeToUserCollection } from '../../services/firestoreService';
import { deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';
import PairSearch from '../journal/PairSearch';
import CoinIcon from '../shared/CoinIcon';

// ─── Bayesian Engine ─────────────────────────────────────────────────────────

const PRIORS = {
  spring: 0.62, lps: 0.68, sos: 0.65,
  upthrust: 0.60, lpsy: 0.65, sow: 0.62, creek: 0.66,
  utad: 0.63,
};

const SETUP_META = {
  spring:   { label: 'Spring',      dir: 'bull', desc: 'בדיקת תמיכה עם נפח נמוך' },
  lps:      { label: 'LPS',         dir: 'bull', desc: 'Last Point of Support' },
  sos:      { label: 'SOS',         dir: 'bull', desc: 'Sign of Strength' },
  creek:    { label: 'Creek Break', dir: 'bull', desc: 'פריצת creek' },
  upthrust: { label: 'Upthrust',    dir: 'bear', desc: 'חדירת מחסום מזויפת' },
  utad:     { label: 'UTAD',        dir: 'bear', desc: 'Upthrust After Distribution' },
  lpsy:     { label: 'LPSY',        dir: 'bear', desc: 'Last Point of Supply' },
  sow:      { label: 'SOW',         dir: 'bear', desc: 'Sign of Weakness' },
};

const LR_TABLE = {
  volume: {
    climactic:      { lr: 1.45, label: 'קליימקטי',       sentiment: 1 },
    dry_up:         { lr: 1.55, label: 'Dry-up',          sentiment: 1 },
    high_no_follow: { lr: 1.20, label: 'גבוה ללא המשך',  sentiment: 1 },
    average:        { lr: 1.00, label: 'ממוצע',           sentiment: 0 },
    high_against:   { lr: 0.65, label: 'גבוה נגד',        sentiment: -1 },
  },
  spread: {
    narrow_test:    { lr: 1.45, label: 'צר — בדיקה',     sentiment: 1 },
    wide_direction: { lr: 1.30, label: 'רחב בכיוון',     sentiment: 1 },
    average:        { lr: 1.00, label: 'ממוצע',           sentiment: 0 },
    wide_against:   { lr: 0.65, label: 'רחב נגד',        sentiment: -1 },
  },
  htf: {
    aligned: { lr: 1.55, label: 'מסונכרן',  sentiment: 1 },
    neutral:  { lr: 1.00, label: 'ניטרלי',   sentiment: 0 },
    against:  { lr: 0.55, label: 'נגד',       sentiment: -1 },
  },
  phase: {
    clear:   { lr: 1.40, label: 'ברורה',     sentiment: 1 },
    possible: { lr: 1.00, label: 'אפשרי',    sentiment: 0 },
    unclear:  { lr: 0.72, label: 'לא ברורה', sentiment: -1 },
  },
  prev_test: {
    confirmed: { lr: 1.50, label: 'מאושר',   sentiment: 1 },
    none:      { lr: 1.00, label: 'אין',      sentiment: 0 },
    failed:    { lr: 0.62, label: 'נכשל',     sentiment: -1 },
  },
  structure: {
    clean:   { lr: 1.30, label: 'נקי',       sentiment: 1 },
    neutral: { lr: 1.00, label: 'ניטרלי',    sentiment: 0 },
    messy:   { lr: 0.72, label: 'מבולגן',    sentiment: -1 },
  },
};

const FACTOR_META = {
  volume:    { label: 'נפח',          Icon: BarChart2 },
  spread:    { label: 'Spread',        Icon: ArrowLeftRight },
  htf:       { label: 'HTF Trend',    Icon: Calendar },
  phase:     { label: 'בהירות פאזה', Icon: Eye },
  prev_test: { label: 'בדיקה קודמת', Icon: RefreshCw },
  structure: { label: 'מבנה שוק',    Icon: Layers },
};

const DEFAULT_FACTORS = {
  volume: 'average', spread: 'average', htf: 'neutral',
  phase: 'possible', prev_test: 'none', structure: 'neutral',
};

function computePosterior(setupType, factors) {
  const prior = PRIORS[setupType] || 0.5;
  let logOdds = Math.log(prior / (1 - prior));
  const contributions = {};
  for (const [factor, value] of Object.entries(factors)) {
    const entry = LR_TABLE[factor]?.[value];
    const lr = entry?.lr ?? 1.0;
    const delta = Math.log(lr);
    logOdds += delta;
    contributions[factor] = { lr, delta, value, sentiment: entry?.sentiment ?? 0 };
  }
  const posterior = 1 / (1 + Math.exp(-logOdds));
  return { posterior, contributions };
}

function getVerdict(p) {
  if (p >= 0.75) return { label: 'STRONG EDGE', color: '#00ff88', glow: '#00ff88', tier: 4 };
  if (p >= 0.65) return { label: 'GOOD',         color: '#00bfff', glow: '#00bfff', tier: 3 };
  if (p >= 0.55) return { label: 'WEAK',          color: '#fbbf24', glow: '#fbbf24', tier: 2 };
  return                 { label: 'NO EDGE',      color: '#ef4444', glow: '#ef4444', tier: 1 };
}

// ─── Probability Arc Meter ───────────────────────────────────────────────────

function ProbabilityMeter({ value, animate: doAnimate }) {
  const R = 78;
  const stroke = 10;
  const C = 2 * Math.PI * R;
  const arcFraction = 0.75;
  const arcLen = C * arcFraction;
  const filled = arcLen * value;
  const verdict = getVerdict(value);
  const pct = Math.round(value * 100);

  return (
    <div className="relative flex items-center justify-center" style={{ width: 196, height: 196 }}>
      <div className="absolute inset-0 rounded-full" style={{
        background: `radial-gradient(circle, ${verdict.glow}18 0%, transparent 70%)`,
      }} />
      <svg width="196" height="196" viewBox="0 0 196 196" style={{ transform: 'rotate(135deg)', position: 'absolute' }}>
        <circle cx="98" cy="98" r={R} fill="none"
          stroke="var(--color-border-primary)" strokeWidth={stroke}
          strokeDasharray={`${arcLen} ${C}`} strokeLinecap="round"
        />
        <motion.circle cx="98" cy="98" r={R} fill="none"
          stroke={verdict.color} strokeWidth={stroke} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 7px ${verdict.color})` }}
          initial={{ strokeDasharray: `0 ${C}` }}
          animate={{ strokeDasharray: `${filled} ${C}` }}
          transition={{ duration: 1.3, ease: [0.34, 1.56, 0.64, 1] }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center select-none">
        <motion.div
          className="text-5xl font-black tabular-nums"
          style={{ color: verdict.color, textShadow: `0 0 24px ${verdict.glow}` }}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          {pct}%
        </motion.div>
        <span className="text-[11px] text-text-muted mt-1 tracking-widest uppercase">הסתברות</span>
      </div>
    </div>
  );
}

// ─── Factor Card ─────────────────────────────────────────────────────────────

function FactorCard({ factorKey, value, onChange, contribution }) {
  const meta = FACTOR_META[factorKey];
  const options = LR_TABLE[factorKey];
  const [open, setOpen] = useState(false);
  const selected = options[value];
  const s = contribution?.sentiment ?? 0;
  const borderColor = s > 0 ? 'rgba(0,255,136,0.35)' : s < 0 ? 'rgba(239,68,68,0.35)' : 'var(--color-border-primary)';
  const lrColor = s > 0 ? '#00ff88' : s < 0 ? '#ef4444' : 'var(--color-text-muted)';
  const { Icon } = meta;

  return (
    <div className="relative rounded-xl p-3 transition-all" style={{
      background: 'var(--color-bg-secondary)',
      border: `1px solid ${borderColor}`,
    }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5" style={{ color: '#00bfff' }} />
          <span className="text-xs font-semibold text-text-primary">{meta.label}</span>
        </div>
        {contribution && (
          <span className="text-[10px] font-bold tabular-nums" style={{ color: lrColor }}>
            LR ×{contribution.lr.toFixed(2)}
          </span>
        )}
      </div>

      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-all"
        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-primary)' }}
      >
        <span style={{ color: lrColor }}>{selected?.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-full mt-1 z-30 rounded-xl overflow-hidden"
            style={{ background: 'var(--color-bg-solid)', border: '1px solid var(--color-border-primary)', boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}
          >
            {Object.entries(options).map(([k, opt]) => {
              const sc = opt.sentiment;
              const col = sc > 0 ? '#00ff88' : sc < 0 ? '#ef4444' : 'var(--color-text-muted)';
              return (
                <button
                  key={k}
                  onClick={() => { onChange(factorKey, k); setOpen(false); }}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs transition-colors hover:bg-white/5"
                  style={{ color: k === value ? col : 'var(--color-text-muted)' }}
                >
                  <span>{opt.label}</span>
                  <span className="tabular-nums" style={{ color: col }}>×{opt.lr.toFixed(2)}</span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {contribution && (
        <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-bg-secondary)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: lrColor, boxShadow: `0 0 6px ${lrColor}` }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, (contribution.lr / 1.6) * 100)}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Verdict Badge ────────────────────────────────────────────────────────────

function VerdictBadge({ verdict }) {
  const icons = {
    'STRONG EDGE': CheckCircle2,
    'GOOD': TrendingUp,
    'WEAK': AlertTriangle,
    'NO EDGE': XCircle,
  };
  const Icon = icons[verdict.label] || TrendingUp;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.6, type: 'spring', stiffness: 260 }}
      className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-black tracking-widest uppercase"
      style={{
        color: verdict.color,
        background: `${verdict.glow}18`,
        border: `1.5px solid ${verdict.glow}50`,
        boxShadow: `0 0 20px ${verdict.glow}30, inset 0 0 20px ${verdict.glow}08`,
      }}
    >
      <Icon className="w-4 h-4" />
      {verdict.label}
    </motion.div>
  );
}

// ─── History Table ────────────────────────────────────────────────────────────

function SignalHistory({ signals, onDelete }) {
  if (!signals.length) return (
    <div className="text-center py-8 text-text-muted text-sm">אין אותות שמורים עדיין</div>
  );
  return (
    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
      {signals.map((s) => {
        const v = getVerdict(s.probability / 100);
        return (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
            style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-primary)' }}
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-black shrink-0"
              style={{ background: `${v.glow}18`, border: `1px solid ${v.glow}40`, color: v.color }}>
              {s.probability}%
            </div>
            <CoinIcon pair={s.symbol} className="w-7 h-7 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-text-primary">{s.symbol}</span>
                <span className="text-[10px] text-text-muted bg-white/5 px-2 py-0.5 rounded-full">{SETUP_META[s.setup]?.label || s.setup}</span>
                <span className="text-[10px] font-bold" style={{ color: v.color }}>{v.label}</span>
              </div>
              <span className="text-[10px] text-text-muted">
                {s.savedAt ? new Date(s.savedAt).toLocaleDateString('he-IL') : ''}
              </span>
            </div>
            <button onClick={() => onDelete(s.id)}
              className="p-1.5 rounded-lg hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function QuantumScorer() {
  const { user } = useAuth();
  const [setup, setSetup] = useState('spring');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [factors, setFactors] = useState({ ...DEFAULT_FACTORS });
  const [result, setResult] = useState(null);
  const [scored, setScored] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [signals, setSignals] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // Subscribe to saved signals — use client-side 'savedAt' timestamp to avoid
  // Firestore orderBy issues with pending serverTimestamp() writes
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeToUserCollection(
      user.uid,
      'signals',
      { orderField: 'savedAt', orderDir: 'desc' },
      (docs) => setSignals(docs),
      (err) => console.error('Signals subscription error:', err),
    );
    return () => unsub?.();
  }, [user?.uid]);

  const handleFactor = useCallback((key, val) => {
    setFactors(f => ({ ...f, [key]: val }));
    setScored(false);
  }, []);

  const handleCalculate = () => {
    const r = computePosterior(setup, factors);
    setResult(r);
    setScored(true);
    setSavedOk(false);
  };

  const handleReset = () => {
    setFactors({ ...DEFAULT_FACTORS });
    setResult(null);
    setScored(false);
    setSavedOk(false);
  };

  const handleSave = async () => {
    if (!result || !user?.uid) return;
    setSaving(true);
    try {
      await addToUserCollection(user.uid, 'signals', {
        setup, symbol, factors,
        probability: Math.round(result.posterior * 100),
        verdict: getVerdict(result.posterior).label,
        savedAt: Date.now(),       // client-side number — safe for orderBy immediately
        createdAt: serverTimestamp(), // server time for display
      });
      setSavedOk(true);
    } catch (e) {
      console.error('Save signal error:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!user?.uid) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'signals', id));
    } catch (e) { console.error(e); }
  };

  const verdict = result ? getVerdict(result.posterior) : null;
  const setupDir = SETUP_META[setup]?.dir || 'bull';

  return (
    <div className="relative min-h-screen pb-10" dir="rtl">

      {/* ── Quantum grid background ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `
            linear-gradient(rgba(0,191,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,191,255,0.04) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 30%, black 40%, transparent 100%)',
        }} />
        {[...Array(12)].map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: i % 3 === 0 ? 3 : 2,
            height: i % 3 === 0 ? 3 : 2,
            borderRadius: '50%',
            background: i % 4 === 0 ? '#00bfff' : i % 4 === 1 ? '#00ff88' : '#a855f7',
            left: `${8 + i * 8}%`,
            top: `${10 + (i * 17) % 70}%`,
            opacity: 0.25 + (i % 3) * 0.15,
            animation: `quantum-float ${4 + i * 0.7}s ease-in-out infinite`,
            animationDelay: `${i * 0.4}s`,
          }} />
        ))}
      </div>

      <style>{`
        @keyframes quantum-float {
          0%, 100% { transform: translateY(0px) scale(1); opacity: 0.3; }
          50% { transform: translateY(-18px) scale(1.3); opacity: 0.7; }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 12px #00bfff40; }
          50% { box-shadow: 0 0 28px #00bfff80; }
        }
      `}</style>

      {/* ── Header ── */}
      <div className="relative flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-black text-text-primary flex items-center gap-2">
            <Zap className="w-5 h-5" style={{ color: '#00bfff' }} />
            Quantum Signal Scorer
          </h2>
          <p className="text-xs text-text-muted mt-0.5">מנוע Bayesian — Wyckoff & Price Action</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory(h => !h)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
            style={{
              background: showHistory ? 'rgba(0,191,255,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${showHistory ? 'rgba(0,191,255,0.4)' : 'rgba(255,255,255,0.08)'}`,
              color: showHistory ? '#00bfff' : 'var(--color-text-muted)',
            }}
          >
            <History className="w-3.5 h-3.5" />
            היסטוריה ({signals.length})
          </button>
        </div>
      </div>

      {/* ── History panel ── */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="relative mb-6 rounded-2xl overflow-hidden"
            style={{ background: 'var(--color-bg-secondary)', border: '1px solid rgba(0,191,255,0.15)' }}
          >
            <div className="p-4">
              <h3 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                <History className="w-4 h-4" style={{ color: '#00bfff' }} />
                אותות שמורים
              </h3>
              <SignalHistory signals={signals} onDelete={handleDelete} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Setup type — full-width row above everything ── */}
      <div className="relative mb-4 rounded-2xl p-4" style={{
        background: 'var(--color-bg-secondary)',
        border: `1px solid ${setupDir === 'bull' ? 'rgba(0,255,136,0.2)' : 'rgba(239,68,68,0.2)'}`,
      }}>
        <div className="flex items-center justify-between mb-2">
          {setup && (
            <span className="text-[10px] text-text-muted">
              {SETUP_META[setup].desc} · Prior: {(PRIORS[setup] * 100).toFixed(0)}%
            </span>
          )}
          <label className="text-xs text-text-muted font-semibold">Setup Type</label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(SETUP_META).map(([k, m]) => (
            <button
              key={k}
              onClick={() => { setSetup(k); setScored(false); }}
              className="flex-1 min-w-[80px] px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all text-center"
              style={{
                background: setup === k
                  ? (m.dir === 'bull' ? 'rgba(0,255,136,0.18)' : 'rgba(239,68,68,0.18)')
                  : 'rgba(255,255,255,0.04)',
                border: setup === k
                  ? `1px solid ${m.dir === 'bull' ? '#00ff88' : '#ef4444'}`
                  : '1px solid rgba(255,255,255,0.07)',
                color: setup === k ? (m.dir === 'bull' ? '#00ff88' : '#ef4444') : 'var(--color-text-muted)',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          Main 3-column grid (RTL order: 1st=right, 2nd=center, 3rd=left)
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="relative grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Col 1 (visual RIGHT in RTL): right factor cards ── */}
        <div className="space-y-3">
          {/* Right-side factor cards: phase, prev_test, structure */}
          {['phase', 'prev_test', 'structure'].map(fk => (
            <FactorCard
              key={fk}
              factorKey={fk}
              value={factors[fk]}
              onChange={handleFactor}
              contribution={result?.contributions[fk] || null}
            />
          ))}
        </div>

        {/* ── Col 2 (visual CENTER in RTL): Symbol + Meter + Buttons ── */}
        <div className="flex flex-col gap-3">

          {/* Symbol search + LR breakdown */}
          <div className="rounded-2xl p-4" style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid rgba(0,191,255,0.2)',
          }}>
            {/* PairSearch — same coin search with icons as in the journal */}
            <PairSearch
              label="מטבע"
              value={symbol}
              onChange={(pair) => setSymbol(pair || 'BTCUSDT')}
            />

            {/* LR contributions mini-table (shown after Calculate) */}
            {result && (
              <div className="mt-3 space-y-1 border-t border-white/5 pt-3">
                {Object.entries(result.contributions).map(([k, c]) => {
                  const col = c.sentiment > 0 ? '#00ff88' : c.sentiment < 0 ? '#ef4444' : 'var(--color-text-muted)';
                  return (
                    <div key={k} className="flex items-center justify-between text-[10px]">
                      <span className="text-text-muted">{FACTOR_META[k]?.label}</span>
                      <span className="font-bold tabular-nums" style={{ color: col }}>
                        {c.delta >= 0 ? '+' : ''}{c.delta.toFixed(3)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Meter + Verdict + Buttons panel */}
          <div className="flex-1 rounded-2xl flex flex-col items-center justify-center p-6 gap-5" style={{
            background: 'var(--color-bg-secondary)',
            border: `1px solid ${verdict ? `${verdict.glow}30` : 'var(--color-border-primary)'}`,
            boxShadow: verdict ? `0 0 40px ${verdict.glow}10` : 'none',
            transition: 'border-color 0.5s, box-shadow 0.5s',
          }}>
            <AnimatePresence mode="wait">
              {scored && result ? (
                <motion.div key="meter" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
                  <ProbabilityMeter value={result.posterior} animate={scored} />
                </motion.div>
              ) : (
                <motion.div key="idle" className="flex items-center justify-center rounded-full" style={{
                  width: 196, height: 196,
                  background: 'radial-gradient(circle, rgba(0,191,255,0.05) 0%, transparent 70%)',
                  border: '1px solid rgba(0,191,255,0.12)',
                }}>
                  <div className="flex flex-col items-center gap-2">
                    {symbol ? (
                      <CoinIcon pair={symbol} className="w-12 h-12" />
                    ) : (
                      <Zap className="w-10 h-10" style={{ color: 'rgba(0,191,255,0.3)' }} />
                    )}
                    <span className="text-xs font-bold" style={{ color: '#00bfff' }}>
                      {symbol ? symbol.replace(/USDT$/i, '') : ''}
                    </span>
                    <span className="text-[10px] text-text-muted">לחץ לחשב</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {verdict && <VerdictBadge verdict={verdict} />}
            </AnimatePresence>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 w-full">
              <motion.button
                onClick={handleCalculate}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="w-full py-3 rounded-xl font-black text-sm transition-all"
                style={{
                  background: 'linear-gradient(135deg, #00bfff20, #00bfff40)',
                  border: '1px solid #00bfff60',
                  color: '#00bfff',
                  animation: !scored ? 'pulse-glow 2s infinite' : 'none',
                }}
              >
                <span className="flex items-center justify-center gap-2">
                  <Zap className="w-4 h-4" />
                  Calculate Signal
                </span>
              </motion.button>

              <div className="flex gap-2">
                <button
                  onClick={handleReset}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all hover:bg-white/5"
                  style={{ border: '1px solid var(--color-border-primary)', color: 'var(--color-text-muted)' }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  איפוס
                </button>
                <button
                  onClick={handleSave}
                  disabled={!scored || saving || !user}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-40"
                  style={{
                    background: savedOk ? 'rgba(0,255,136,0.15)' : 'rgba(0,191,255,0.1)',
                    border: `1px solid ${savedOk ? 'rgba(0,255,136,0.4)' : 'rgba(0,191,255,0.3)'}`,
                    color: savedOk ? '#00ff88' : '#00bfff',
                  }}
                >
                  <Save className="w-3.5 h-3.5" />
                  {savedOk ? 'נשמר ✓' : saving ? 'שומר...' : 'שמור'}
                </button>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="rounded-2xl p-3 grid grid-cols-2 gap-2" style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            {[
              { label: 'STRONG EDGE', color: '#00ff88', range: '≥75%' },
              { label: 'GOOD',        color: '#00bfff', range: '65–74%' },
              { label: 'WEAK',        color: '#fbbf24', range: '55–64%' },
              { label: 'NO EDGE',     color: '#ef4444', range: '<55%' },
            ].map(v => (
              <div key={v.label} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: v.color, boxShadow: `0 0 6px ${v.color}` }} />
                <div>
                  <div className="text-[10px] font-bold" style={{ color: v.color }}>{v.label}</div>
                  <div className="text-[9px] text-text-muted">{v.range}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Col 3 (visual LEFT in RTL): Left factor cards ── */}
        <div className="space-y-3">
          {['volume', 'spread', 'htf'].map(fk => (
            <FactorCard
              key={fk}
              factorKey={fk}
              value={factors[fk]}
              onChange={handleFactor}
              contribution={result?.contributions[fk] || null}
            />
          ))}
        </div>

      </div>
    </div>
  );
}
