import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3, Search, Brain, TrendingUp, Target, ImagePlus, RefreshCw, X,
  Copy, Check, Crown, AlertTriangle, Sparkles,
} from 'lucide-react';
import { sendMessageStream } from '../../services/groqApi';
import { useAiUsage } from '../../hooks/useAiUsage';
import { fileToCompressedDataUrl, formatAIText } from './AIChat';

const MODES = [
  { id: 'quick', label: 'סריקה מהירה', icon: Search },
  { id: 'deep', label: 'ניתוח מעמיק (5 שכבות)', icon: Brain },
];

const FOCUSES = [
  { id: 'patterns', label: 'דפוסים', icon: Search },
  { id: 'trend', label: 'מגמה', icon: TrendingUp },
  { id: 'levels', label: 'רמות מפתח', icon: Target },
];

const SCAN_LABELS = [
  'Bull Flag', 'Bear Flag', 'H&S', 'Triangle', 'Double Top',
  'Spring', 'UTAD', 'Accumulation', 'Distribution', 'BOS',
];

// The server-side Wyckoff prompt already forbids entry/exit advice — these
// prompts only steer the focus and depth of the analysis.
function buildPrompt(mode, focus) {
  const focusText = {
    patterns: 'התמקד בזיהוי דפוסים טכניים בגרף: דגלים (Bull/Bear Flag), ראש וכתפיים (H&S), משולשים, תחתית/פסגה כפולה, טריזים, ודפוסי ויקוף (Spring, UTAD, Accumulation/Distribution).',
    trend: 'התמקד במגמה ובמבנה השוק: HH/HL/LH/LL, שבירות מבנה (BOS/MSB), פאזת ויקוף נוכחית (A–E), והאם השוק באיסוף, פיזור, Mark Up או Mark Down.',
    levels: 'התמקד ברמות מפתח: תמיכות והתנגדויות מרכזיות, Creek/Ice, אזורי נזילות והיצע/ביקוש, רמות שנפרצו והפכו תפקיד (SRF/RSF).',
  }[focus];
  const modeText = mode === 'deep'
    ? 'בצע ניתוח מעמיק ב-5 שכבות, שכבה אחר שכבה עם כותרת לכל שכבה: 1) מבנה ומגמה 2) פאזת ויקוף 3) דפוסים בולטים 4) נפח — מאמץ מול תוצאה (אם נראה בגרף) 5) תרחיש מרכזי ותרחיש נגדי.'
    : 'בצע סריקה מהירה ותמציתית: 3–6 נקודות עיקריות בלבד, ואז שורת סיכום אחת.';
  return `נתח את הגרף שבתמונה. ${modeText} ${focusText}`;
}

export default function ChartAnalyzer({ heightClass = '' }) {
  const [mode, setMode] = useState('quick');
  const [focus, setFocus] = useState('patterns');
  const [image, setImage] = useState(null); // { dataUrl, name }
  const [analyzing, setAnalyzing] = useState(false);
  const [resultText, setResultText] = useState('');
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [scanIdx, setScanIdx] = useState(0);
  const fileInputRef = useRef(null);
  const resultRef = useRef('');
  const batchRef = useRef(null);
  const aiUsage = useAiUsage();

  // Cycle the pattern labels while scanning, like a real-time detector.
  useEffect(() => {
    if (!analyzing) return;
    const t = setInterval(() => setScanIdx((i) => (i + 1) % SCAN_LABELS.length), 900);
    return () => clearInterval(t);
  }, [analyzing]);

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
      setError('ניתוח תמונות גרף זמין למנויי Premium בלבד 👑');
      return;
    }
    setAnalyzing(true);
    setResultText('');
    setError(null);
    resultRef.current = '';
    try {
      await sendMessageStream(
        [{ role: 'user', text: buildPrompt(mode, focus), image: image.dataUrl }],
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
              <h3 className="text-sm font-bold text-text-primary">ניתוח גרפים</h3>
              <p className="text-[10px] text-text-muted">העלה צילום גרף — TradeAI ינתח לפי ויקוף</p>
            </div>
          </div>
          {aiUsage.premium && aiUsage.imageLimit > 0 && (
            <span className={`text-[10px] px-2 py-1 rounded-full border ${
              imgRemaining <= 2
                ? 'border-loss/40 text-loss'
                : 'border-accent-primary/30 text-accent-primary'
            }`}>
              נשארו {imgRemaining} ניתוחים היום
            </span>
          )}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Mode toggle */}
          <div className="grid grid-cols-2 gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                disabled={analyzing}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 ${
                  mode === m.id
                    ? 'bg-accent-primary text-bg-primary shadow-lg shadow-accent-primary/20'
                    : 'bg-bg-secondary border border-border-primary text-text-secondary hover:text-text-primary'
                }`}
              >
                <m.icon className="w-3.5 h-3.5" />
                {m.label}
              </button>
            ))}
          </div>

          {/* Focus tabs */}
          <div className="grid grid-cols-3 gap-2">
            {FOCUSES.map((f) => (
              <button
                key={f.id}
                onClick={() => setFocus(f.id)}
                disabled={analyzing}
                className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-xs transition-all cursor-pointer disabled:opacity-50 ${
                  focus === f.id
                    ? 'bg-accent-primary/15 border border-accent-primary/40 text-accent-primary font-semibold'
                    : 'bg-bg-secondary border border-border-primary text-text-secondary hover:text-text-primary'
                }`}
              >
                <f.icon className="w-3.5 h-3.5" />
                {f.label}
              </button>
            ))}
          </div>

          {/* Upload zone / image preview */}
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
              <div className="w-14 h-14 rounded-2xl bg-accent-primary/15 flex items-center justify-center">
                <ImagePlus className="w-7 h-7 text-accent-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-text-primary">העלה צילום מסך של גרף</p>
                <p className="text-[11px] text-text-muted mt-1">לחץ לבחירה או גרור תמונה לכאן · PNG / JPG / WebP</p>
              </div>
              {!aiUsage.loading && !aiUsage.premium && (
                <span className="flex items-center gap-1.5 text-[11px] text-accent-primary bg-accent-primary/10 border border-accent-primary/25 rounded-full px-3 py-1">
                  <Crown className="w-3 h-3" /> זמין למנויי Premium
                </span>
              )}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`rounded-2xl border-2 overflow-hidden ${analyzing ? 'border-accent-primary/60' : 'border-profit/50'}`}
            >
              <img src={image.dataUrl} alt="הגרף שהועלה" className="w-full max-h-72 object-contain bg-black/40" />
              <div className="flex items-center justify-center gap-2 px-3 py-2.5 bg-bg-secondary/70">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={analyzing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border-primary text-text-secondary hover:text-text-primary transition-colors cursor-pointer disabled:opacity-40"
                >
                  <RefreshCw className="w-3 h-3" /> החלף
                </button>
                <button
                  onClick={reset}
                  disabled={analyzing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-loss/30 text-loss hover:bg-loss/10 transition-colors cursor-pointer disabled:opacity-40"
                >
                  <X className="w-3 h-3" /> הסר
                </button>
              </div>
            </motion.div>
          )}

          {/* Analyze button */}
          <button
            onClick={analyze}
            disabled={!image || analyzing}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-accent-primary text-bg-primary text-sm font-bold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-accent-primary/20"
          >
            <Sparkles className="w-4 h-4" />
            {analyzing ? 'מנתח...' : 'נתח את הגרף'}
          </button>

          {/* Scanning animation */}
          <AnimatePresence>
            {analyzing && !resultText && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-2xl border border-border-primary bg-bg-secondary/60 px-4 py-8 flex flex-col items-center gap-3"
              >
                <motion.div
                  animate={{ scale: [1, 1.15, 1], rotate: [0, 8, -8, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="w-12 h-12 rounded-2xl bg-accent-primary/15 flex items-center justify-center"
                >
                  <Search className="w-6 h-6 text-accent-primary" />
                </motion.div>
                <p className="text-sm font-bold text-text-primary">סורק את הגרף...</p>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={scanIdx}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="text-[11px] font-mono text-text-muted"
                  >
                    בודק {SCAN_LABELS[scanIdx]}...
                  </motion.p>
                </AnimatePresence>
                <div className="w-48 h-1 bg-bg-tertiary rounded-full overflow-hidden">
                  <motion.div
                    animate={{ x: ['-100%', '250%'] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-1/3 h-full bg-accent-primary rounded-full"
                  />
                </div>
              </motion.div>
            )}
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
                  <BarChart3 className="w-3.5 h-3.5 text-accent-primary" />
                  תוצאות הניתוח
                  <span className="text-[9px] font-normal px-1.5 py-0.5 rounded-full bg-accent-primary/15 text-accent-primary">
                    {mode === 'deep' ? 'ניתוח מעמיק' : 'סריקה מהירה'} · {FOCUSES.find((f) => f.id === focus)?.label}
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
                    נתח גרף נוסף
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

          {/* Disclaimer */}
          <div className="flex items-start gap-2 rounded-xl bg-bg-secondary/50 border border-border-primary px-3 py-2.5">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0 mt-0.5" />
            <p className="text-[10px] leading-relaxed text-text-muted">
              אין באמור המלצה פיננסית או ייעוץ השקעות. ניתוח AI עלול להכיל טעויות — יש לבצע בדיקה
              עצמאית לפני כל החלטת מסחר. השימוש בכלי הוא על אחריות המשתמש בלבד.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
