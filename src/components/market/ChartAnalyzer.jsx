import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Brain, TrendingUp, Target, ImagePlus, RefreshCw, X,
  Copy, Check, Crown, Info, Eye, Activity, Layers, Lightbulb, Shapes, BarChart3,
} from 'lucide-react';
import { sendMessageStream } from '../../services/groqApi';
import { useAiUsage } from '../../hooks/useAiUsage';
import { useAuth } from '../../contexts/AuthContext';
import { fileToCompressedDataUrl, formatAIText } from '../../utils/aiChatHelpers';

// Focus lenses — steer WHERE the read looks, not how long it is. A single,
// concise analysis (no "deep" mode) keeps every request well under the vision
// model's per-minute token cap, so full-Wyckoff no longer rate-limits (429).
const LENSES = [
  { id: 'patterns', label: 'תבניות מחיר', icon: Shapes },
  { id: 'trend', label: 'מבנה ומגמה', icon: TrendingUp },
  { id: 'levels', label: 'אזורי מפתח', icon: Target },
];

// Staged "thinking" timeline shown while the model works. Steps advance on a
// timer so the wait feels alive; the real signal is the first streamed token.
const THINK_STEPS = [
  { label: 'קורא את הגרף', icon: Eye },
  { label: 'ממפה מבנה שוק ומגמה', icon: Activity },
  { label: 'מאתר תבניות ושלבי ויקוף', icon: Layers },
  { label: 'בוחן נפח מול תנועת מחיר', icon: BarChart3 },
  { label: 'מגבש תרחישים', icon: Lightbulb },
];

// The server-side Wyckoff prompt owns the structure and forbids entry/exit
// advice; this only points the focus and asks for a tight, professional read.
function buildPrompt(lens) {
  const lensText = {
    patterns: 'שים דגש על תבניות מחיר: דגלים, ראש וכתפיים, משולשים, תחתית/פסגה כפולה, טריזים, ואירועי ויקוף כמו Spring ו-UTAD.',
    trend: 'שים דגש על מבנה השוק והמגמה: רצף שיאים ושפלים (HH/HL/LH/LL), שבירות מבנה (BOS/MSB), והפאזה הנוכחית במחזור ויקוף (A–E).',
    levels: 'שים דגש על אזורי מפתח: תמיכות והתנגדויות מרכזיות, Creek/Ice, אזורי היצע וביקוש, ורמות שהחליפו תפקיד לאחר פריצה.',
  }[lens];
  return `נתח את הגרף שבתמונה לפי המבנה הקבוע (הטיה טכנית + 6 הסעיפים הממוספרים). שמור כל סעיף תמציתי, חד ומקצועי — עד 3–4 שורות לכל סעיף, בלי חזרות ובלי מילוי. ${lensText}`;
}

function ThinkingTimeline() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      setStep((s) => Math.min(s + 1, THINK_STEPS.length - 1));
    }, 1700);
    return () => clearInterval(t);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="rounded-2xl border border-border-primary bg-bg-secondary p-4"
    >
      <div className="flex items-center gap-2.5 mb-4">
        <motion.div
          animate={{ scale: [1, 1.12, 1] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          className="w-8 h-8 rounded-xl bg-accent-primary/15 flex items-center justify-center"
        >
          <Brain className="w-4.5 h-4.5 text-accent-primary" />
        </motion.div>
        <div>
          <p className="text-sm font-bold text-text-primary">TradeAI מנתח...</p>
          <p className="text-[10px] text-text-muted">מעבד את הגרף שלב אחר שלב</p>
        </div>
      </div>

      <div className="space-y-2.5">
        {THINK_STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: done || active ? 1 : 0.35, x: 0 }}
              transition={{ delay: i * 0.08 }}
              className="flex items-center gap-2.5"
            >
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                done ? 'bg-profit/15' : active ? 'bg-accent-primary/15' : 'bg-bg-tertiary'
              }`}>
                {done
                  ? <Check className="w-3.5 h-3.5 text-profit" />
                  : active
                    ? (
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
                        <s.icon className="w-3.5 h-3.5 text-accent-primary" />
                      </motion.div>
                    )
                    : <s.icon className="w-3.5 h-3.5 text-text-muted" />
                }
              </div>
              <span className={`text-xs transition-colors ${
                done ? 'text-text-secondary' : active ? 'text-text-primary font-semibold' : 'text-text-muted'
              }`}>
                {s.label}
              </span>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-4 h-1 bg-bg-tertiary rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg, #2563eb, #38bdf8)' }}
          animate={{ width: `${((step + 1) / THINK_STEPS.length) * 92}%` }}
          transition={{ duration: 0.6 }}
        />
      </div>
    </motion.div>
  );
}

export default function ChartAnalyzer({ heightClass = '' }) {
  const [lens, setLens] = useState('patterns');
  const [image, setImage] = useState(null); // { dataUrl, name }
  const [analyzing, setAnalyzing] = useState(false);
  const [resultText, setResultText] = useState('');
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const resultRef = useRef('');
  const batchRef = useRef(null);
  const copyTimerRef = useRef(null);
  // Synchronous in-flight guard — `analyzing` state only flips on re-render, so
  // a fast double-click could double-fire and double-charge the image quota.
  const inFlightRef = useRef(false);
  // Streaming/copy can outlive the page — kill pending timers on unmount so no
  // setState fires after the component is gone.
  useEffect(() => () => {
    clearTimeout(batchRef.current);
    clearTimeout(copyTimerRef.current);
  }, []);
  const aiUsage = useAiUsage();
  const { isPremium, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  // Free users can't analyze images — gate on the live profile (useAuth), NOT the
  // worker-cached aiUsage.premium, so a fresh upgrade unlocks in real time.
  const premiumLocked = !authLoading && !isPremium;

  const pickFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('יש לבחור קובץ תמונה');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('התמונה גדולה מדי (עד 10MB)');
      return;
    }
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      setImage({ dataUrl, name: file.name });
      setResultText('');
      setError(null);
    } catch (err) {
      setError(err.message || 'טעינת התמונה נכשלה');
    }
  };

  const onInputChange = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    pickFile(f);
  };

  const openPicker = () => (premiumLocked ? navigate('/premium') : fileInputRef.current?.click());

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (premiumLocked) { navigate('/premium'); return; }
    pickFile(e.dataTransfer.files?.[0]);
  };

  const analyze = async () => {
    if (!image || analyzing || inFlightRef.current) return;
    if (!isPremium) {
      setError('צירוף וניתוח גרפים פתוח למנויי Premium בלבד 👑');
      return;
    }
    inFlightRef.current = true;
    setAnalyzing(true);
    setResultText('');
    setError(null);
    resultRef.current = '';
    try {
      await sendMessageStream(
        [{ role: 'user', text: buildPrompt(lens), image: image.dataUrl }],
        (chunk) => {
          resultRef.current += chunk;
          if (!batchRef.current) {
            batchRef.current = setTimeout(() => {
              setResultText(resultRef.current);
              batchRef.current = null;
            }, 30);
          }
        },
      );
      if (batchRef.current) {
        clearTimeout(batchRef.current);
        batchRef.current = null;
      }
      setResultText(resultRef.current);
    } catch (err) {
      setError(err.message || 'שגיאה בניתוח הגרף');
      if (resultRef.current) setResultText(resultRef.current);
    } finally {
      inFlightRef.current = false;
      setAnalyzing(false);
      aiUsage.refresh();
    }
  };

  const copyResult = async () => {
    try {
      await navigator.clipboard.writeText(resultText);
      setCopied(true);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  // Full reset — drop the image too (the ✕ on the preview).
  const reset = () => {
    setImage(null);
    setResultText('');
    setError(null);
  };

  // "ניתוח חדש" — clear only the result so the SAME chart can be re-analyzed with
  // a different focus, without forcing a re-upload.
  const newAnalysis = () => {
    setResultText('');
    setError(null);
    resultRef.current = '';
  };

  const imgRemaining = Math.max(0, aiUsage.imageLimit - aiUsage.imageUsed);
  const lensLabel = LENSES.find((l) => l.id === lens)?.label;

  return (
    <div className="max-w-2xl mx-auto w-full">
      <div className={`relative flex flex-col rounded-3xl overflow-hidden border border-border-primary bg-bg-secondary ${heightClass} sm:min-h-[420px]`}>
        {/* Ambient accent glow at the top — subtle premium depth */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-accent-primary/8 to-transparent" />

        {/* Header */}
        <div className="relative flex items-center justify-between px-5 py-4 border-b border-border-primary/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-accent-primary/30 to-accent-primary/5 ring-1 ring-accent-primary/25 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-accent-primary" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-text-primary tracking-tight">TradeAI Vision</h3>
              <p className="text-[11px] text-text-muted">קריאת גרף חכמה בשיטת ויקוף</p>
            </div>
          </div>
          {isPremium && aiUsage.imageLimit > 0 && (
            <span className={`text-[10px] font-medium px-2.5 py-1 rounded-full border ${
              imgRemaining <= 2
                ? 'border-loss/40 text-loss bg-loss/5'
                : 'border-accent-primary/30 text-accent-primary bg-accent-primary/5'
            }`}>
              {imgRemaining} נותרו היום
            </span>
          )}
        </div>

        {/* Body */}
        <div className="relative flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onInputChange} />

          {/* Upload zone / preview */}
          {!image ? (
            <div
              role="button"
              tabIndex={0}
              onClick={openPicker}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } }}
              onDragOver={(e) => { e.preventDefault(); if (!premiumLocked) setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`group relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-12 cursor-pointer transition-all outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${
                dragOver
                  ? 'border-accent-primary bg-accent-primary/10'
                  : 'border-border-primary/80 bg-bg-secondary hover:border-accent-primary/50 hover:bg-bg-secondary/70'
              }`}
            >
              <motion.div
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-primary/25 to-accent-primary/5 ring-1 ring-accent-primary/20 flex items-center justify-center group-hover:scale-105 transition-transform"
              >
                {premiumLocked
                  ? <Crown className="w-7 h-7 text-accent-primary" />
                  : <ImagePlus className="w-7 h-7 text-accent-primary" />
                }
              </motion.div>
              {premiumLocked ? (
                <div className="text-center">
                  <p className="text-sm font-semibold text-text-primary">ניתוח גרפים בתמונה — למנויי Premium</p>
                  <p className="text-[11px] text-text-muted mt-1">שדרג כדי להעלות צילומי גרף ולקבל קריאת ויקוף מלאה</p>
                  <span className="inline-flex items-center gap-1.5 mt-3 text-xs font-bold text-white rounded-xl px-4 py-2 shadow-lg shadow-accent-primary/25" style={{ background: 'linear-gradient(135deg, #2563eb, #38bdf8)' }}>
                    <Crown className="w-3.5 h-3.5" /> שדרג ל-Premium
                  </span>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm font-semibold text-text-primary">גרור לכאן צילום גרף</p>
                  <p className="text-[11px] text-text-muted mt-1">או לחץ לבחירת קובץ · PNG / JPG / WebP</p>
                </div>
              )}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`relative rounded-2xl border overflow-hidden ${analyzing ? 'border-accent-primary/60' : 'border-border-primary'}`}
            >
              <img src={image.dataUrl} alt="הגרף שהועלה" className="w-full max-h-72 object-contain bg-black/40" />
              {/* Sweeping scan beam while analyzing */}
              {analyzing && (
                <motion.div
                  initial={{ left: '-12%' }}
                  animate={{ left: ['-12%', '104%'] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  className="pointer-events-none absolute inset-y-0 w-12"
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(56,189,248,0.35), transparent)' }}
                />
              )}
              <div className="absolute top-2 left-2 flex gap-1.5">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={analyzing}
                  aria-label="בחר תמונה אחרת"
                  className="p-1.5 rounded-lg bg-black/60 backdrop-blur text-text-secondary hover:text-text-primary transition-colors cursor-pointer disabled:opacity-40"
                  title="בחר תמונה אחרת"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={reset}
                  disabled={analyzing}
                  aria-label="הסר תמונה"
                  className="p-1.5 rounded-lg bg-black/60 backdrop-blur text-text-secondary hover:text-loss transition-colors cursor-pointer disabled:opacity-40"
                  title="הסר תמונה"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}

          {/* Focus + analyze — shown once an image is chosen, hidden while the
              model works (the timeline takes over) and while a result is up. */}
          {image && !resultText && !analyzing && (
            <>
              <div className="space-y-2">
                <p className="text-[11px] font-medium text-text-muted px-0.5">מיקוד הניתוח</p>
                <div className="grid grid-cols-3 gap-2">
                  {LENSES.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => setLens(l.id)}
                      disabled={analyzing}
                      className={`flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-xl border text-center transition-all cursor-pointer disabled:opacity-50 ${
                        lens === l.id
                          ? 'bg-accent-primary/10 border-accent-primary/50 text-accent-primary'
                          : 'bg-bg-secondary border-border-primary text-text-secondary hover:border-border-primary/80 hover:text-text-primary'
                      }`}
                    >
                      <l.icon className="w-4 h-4" />
                      <span className="text-[11px] font-medium">{l.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={analyze}
                disabled={analyzing}
                className="group relative w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold text-white overflow-hidden transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent-primary/25"
                style={{ background: 'linear-gradient(135deg, #2563eb, #38bdf8)' }}
              >
                <Sparkles className="w-4 h-4" />
                {analyzing ? 'מנתח את הגרף...' : 'הפעל ניתוח'}
              </button>
            </>
          )}

          {/* Thinking timeline */}
          <AnimatePresence>
            {analyzing && !resultText && <ThinkingTimeline />}
          </AnimatePresence>

          {/* Result */}
          {resultText && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-border-primary bg-bg-secondary overflow-hidden"
            >
              <div className="h-0.5" style={{ background: 'linear-gradient(90deg, #2563eb, #38bdf8, transparent)' }} />
              <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary/60">
                <span className="flex items-center gap-2 text-[13px] font-bold text-text-primary">
                  <Sparkles className="w-4 h-4 text-accent-primary" />
                  קריאת הגרף
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent-primary/10 text-accent-primary">
                    {lensLabel}
                  </span>
                </span>
                {!analyzing && (
                  <button
                    onClick={copyResult}
                    className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                    title="העתק ניתוח"
                  >
                    {copied
                      ? <><Check className="w-3 h-3 text-profit" /> הועתק</>
                      : <><Copy className="w-3 h-3" /> העתק</>
                    }
                  </button>
                )}
              </div>
              <div className="px-4 py-4 text-[13px] leading-relaxed text-text-secondary">
                {formatAIText(resultText)}
              </div>
              {!analyzing && (
                <div className="px-4 pb-4">
                  <button
                    onClick={newAnalysis}
                    className="w-full py-2.5 rounded-xl border border-border-primary text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
                  >
                    ניתוח חדש
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-loss/10 border border-loss/20 rounded-xl px-4 py-2.5 text-xs text-loss text-center"
            >
              {error}
            </motion.div>
          )}

          {/* Educational notice */}
          <div className="flex items-start gap-2 rounded-xl bg-bg-secondary border border-border-primary px-3 py-2.5">
            <Info className="w-3.5 h-3.5 text-text-muted shrink-0 mt-0.5" />
            <p className="text-[10px] leading-relaxed text-text-muted">
              הקריאה מופקת אוטומטית למטרות לימוד והעשרה, ואינה ייעוץ השקעות או הזמנה לפעולה.
              ייתכנו אי-דיוקים — ההחלטות והאחריות עליהן הן של הסוחר בלבד.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
