import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3, Zap, Brain, TrendingUp, Target, ImagePlus, RefreshCw, X,
  Copy, Check, Crown, Info, Sparkles, Eye, Activity, Layers, Lightbulb, Shapes,
} from 'lucide-react';
import { sendMessageStream } from '../../services/groqApi';
import { useAiUsage } from '../../hooks/useAiUsage';
import { fileToCompressedDataUrl, formatAIText } from '../../utils/aiChatHelpers';

const DEPTHS = [
  { id: 'quick', label: 'תמצית', icon: Zap, desc: 'נקודות עיקריות בלבד' },
  { id: 'deep', label: 'ויקוף מלא', icon: Brain, desc: 'מבנה, פאזות, נפח ותרחישים' },
];

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

// The server-side Wyckoff prompt already forbids entry/exit advice — these
// prompts only steer the focus and depth of the analysis.
function buildPrompt(depth, lens) {
  const lensText = {
    patterns: 'שים דגש על תבניות מחיר: דגלים, ראש וכתפיים, משולשים, תחתית/פסגה כפולה, טריזים, ואירועי ויקוף כמו Spring ו-UTAD.',
    trend: 'שים דגש על מבנה השוק והמגמה: רצף שיאים ושפלים (HH/HL/LH/LL), שבירות מבנה (BOS/MSB), והפאזה הנוכחית במחזור ויקוף (A–E).',
    levels: 'שים דגש על אזורי מפתח: תמיכות והתנגדויות מרכזיות, Creek/Ice, אזורי היצע וביקוש, ורמות שהחליפו תפקיד לאחר פריצה.',
  }[lens];
  const depthText = depth === 'deep'
    ? 'בצע ניתוח ויקוף מלא, מחולק לחלקים עם כותרת לכל חלק: מבנה ומגמה; פאזת ויקוף; תבניות בולטות; נפח — מאמץ מול תוצאה (אם נראה בגרף); ולסיום תרחיש מרכזי ותרחיש נגדי.'
    : 'תן תמצית קצרה: עד 6 נקודות חדות, ושורת סיכום אחת בסוף.';
  return `נתח את הגרף שבתמונה. ${depthText} ${lensText}`;
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
      className="rounded-2xl border border-border-primary bg-bg-secondary/60 p-4"
    >
      <div className="flex items-center gap-2 mb-4">
        <motion.div
          animate={{ scale: [1, 1.12, 1] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          className="w-8 h-8 rounded-xl bg-accent-primary/15 flex items-center justify-center"
        >
          <Brain className="w-4.5 h-4.5 text-accent-primary" />
        </motion.div>
        <div>
          <p className="text-sm font-bold text-text-primary">TradeAI חושב...</p>
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
              {active && (
                <motion.span
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  className="text-accent-primary text-xs"
                >
                  ●
                </motion.span>
              )}
            </motion.div>
          );
        })}
      </div>

      <div className="mt-4 h-1 bg-bg-tertiary rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-accent-primary rounded-full"
          animate={{ width: `${((step + 1) / THINK_STEPS.length) * 92}%` }}
          transition={{ duration: 0.6 }}
        />
      </div>
    </motion.div>
  );
}

export default function ChartAnalyzer({ heightClass = '' }) {
  const [depth, setDepth] = useState('quick');
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
  const aiUsage = useAiUsage();

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

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files?.[0]);
  };

  const analyze = async () => {
    if (!image || analyzing) return;
    if (!aiUsage.premium) {
      setError('צירוף וניתוח גרפים פתוח למנויי Premium בלבד 👑');
      return;
    }
    setAnalyzing(true);
    setResultText('');
    setError(null);
    resultRef.current = '';
    try {
      await sendMessageStream(
        [{ role: 'user', text: buildPrompt(depth, lens), image: image.dataUrl }],
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
      setAnalyzing(false);
      aiUsage.refresh();
    }
  };

  const copyResult = async () => {
    try {
      await navigator.clipboard.writeText(resultText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const reset = () => {
    setImage(null);
    setResultText('');
    setError(null);
  };

  const imgRemaining = Math.max(0, aiUsage.imageLimit - aiUsage.imageUsed);

  return (
    <div className="max-w-2xl mx-auto w-full">
      <div className={`flex flex-col bg-bg-secondary/30 border border-border-primary rounded-2xl overflow-hidden ${heightClass} min-h-[400px]`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary bg-bg-secondary/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-accent-primary/15 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-accent-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-primary">TradeAI Vision</h3>
              <p className="text-[10px] text-text-muted">צלם גרף, קבל קריאת ויקוף</p>
            </div>
          </div>
          {aiUsage.premium && aiUsage.imageLimit > 0 && (
            <span className={`text-[10px] px-2 py-1 rounded-full border ${
              imgRemaining <= 2
                ? 'border-loss/40 text-loss'
                : 'border-accent-primary/30 text-accent-primary'
            }`}>
              {imgRemaining} ניתוחים נותרו היום
            </span>
          )}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Upload zone / image preview — the hero of the screen */}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onInputChange} />
          {!image ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 py-10 cursor-pointer transition-all ${
                dragOver
                  ? 'border-accent-primary bg-accent-primary/10'
                  : 'border-border-primary bg-bg-secondary/50 hover:border-accent-primary/50 hover:bg-bg-secondary'
              }`}
            >
              <motion.div
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                className="w-14 h-14 rounded-2xl bg-accent-primary/15 flex items-center justify-center"
              >
                <ImagePlus className="w-7 h-7 text-accent-primary" />
              </motion.div>
              <div className="text-center">
                <p className="text-sm font-semibold text-text-primary">גרור לכאן צילום גרף</p>
                <p className="text-[11px] text-text-muted mt-1">או לחץ לבחירת קובץ · PNG / JPG / WebP</p>
              </div>
              {!aiUsage.loading && !aiUsage.premium && (
                <span className="flex items-center gap-1.5 text-[11px] text-accent-primary bg-accent-primary/10 border border-accent-primary/25 rounded-full px-3 py-1">
                  <Crown className="w-3 h-3" /> פיצ׳ר Premium
                </span>
              )}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`relative rounded-2xl border overflow-hidden ${analyzing ? 'border-accent-primary/60' : 'border-border-primary'}`}
            >
              <img src={image.dataUrl} alt="הגרף שהועלה" className="w-full max-h-72 object-contain bg-black/40" />
              {/* Sweeping scan beam over the chart while analyzing. Animate
                  `left` (container-relative) — translateX percentages are
                  relative to the beam's own 3rem width, so it barely moved. */}
              {analyzing && (
                <motion.div
                  initial={{ left: '-12%' }}
                  animate={{ left: ['-12%', '104%'] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  className="pointer-events-none absolute inset-y-0 w-12"
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(0,191,255,0.35), transparent)' }}
                />
              )}
              <div className="absolute top-2 left-2 flex gap-1.5">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={analyzing}
                  className="p-1.5 rounded-lg bg-black/60 backdrop-blur text-text-secondary hover:text-text-primary transition-colors cursor-pointer disabled:opacity-40"
                  title="בחר תמונה אחרת"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={reset}
                  disabled={analyzing}
                  className="p-1.5 rounded-lg bg-black/60 backdrop-blur text-text-secondary hover:text-loss transition-colors cursor-pointer disabled:opacity-40"
                  title="הסר תמונה"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}

          {/* Depth selector — card style with description */}
          <div className="grid grid-cols-2 gap-2">
            {DEPTHS.map((d) => (
              <button
                key={d.id}
                onClick={() => setDepth(d.id)}
                disabled={analyzing}
                className={`flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl text-right transition-all cursor-pointer disabled:opacity-50 border ${
                  depth === d.id
                    ? 'bg-accent-primary/10 border-accent-primary/50'
                    : 'bg-bg-secondary border-border-primary hover:border-border-primary/80'
                }`}
              >
                <span className={`flex items-center gap-1.5 text-xs font-bold ${depth === d.id ? 'text-accent-primary' : 'text-text-primary'}`}>
                  <d.icon className="w-3.5 h-3.5" />
                  {d.label}
                </span>
                <span className="text-[10px] text-text-muted">{d.desc}</span>
              </button>
            ))}
          </div>

          {/* Lens chips */}
          <div className="flex flex-wrap gap-1.5">
            {LENSES.map((l) => (
              <button
                key={l.id}
                onClick={() => setLens(l.id)}
                disabled={analyzing}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all cursor-pointer disabled:opacity-50 border ${
                  lens === l.id
                    ? 'bg-accent-primary/15 border-accent-primary/40 text-accent-primary font-semibold'
                    : 'bg-bg-secondary border-border-primary text-text-secondary hover:text-text-primary'
                }`}
              >
                <l.icon className="w-3 h-3" />
                {l.label}
              </button>
            ))}
          </div>

          {/* Analyze button */}
          <button
            onClick={analyze}
            disabled={!image || analyzing}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-accent-primary text-bg-primary text-sm font-bold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-accent-primary/20"
          >
            <Sparkles className="w-4 h-4" />
            {analyzing ? 'מעבד...' : 'הפעל ניתוח'}
          </button>

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
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-primary bg-bg-tertiary/40">
                <span className="flex items-center gap-2 text-xs font-bold text-text-primary">
                  <Sparkles className="w-3.5 h-3.5 text-accent-primary" />
                  קריאת הגרף
                  <span className="text-[9px] font-normal px-1.5 py-0.5 rounded-full bg-accent-primary/15 text-accent-primary">
                    {DEPTHS.find((d) => d.id === depth)?.label} · {LENSES.find((l) => l.id === lens)?.label}
                  </span>
                </span>
                {!analyzing && (
                  <button
                    onClick={copyResult}
                    className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                    title="העתק ניתוח"
                  >
                    {copied
                      ? <><Check className="w-3 h-3 text-profit" /> הועתק</>
                      : <><Copy className="w-3 h-3" /> העתק</>
                    }
                  </button>
                )}
              </div>
              <div className="px-4 py-3 text-sm leading-relaxed text-text-secondary space-y-0">
                {formatAIText(resultText)}
              </div>
              {!analyzing && (
                <div className="px-4 pb-3">
                  <button
                    onClick={reset}
                    className="w-full py-2 rounded-xl border border-border-primary text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
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
          <div className="flex items-start gap-2 rounded-xl bg-bg-secondary/50 border border-border-primary px-3 py-2.5">
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
