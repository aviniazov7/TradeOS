import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { m, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Brain, TrendingUp, Target, ImagePlus, RefreshCw, X,
  Copy, Check, Crown, Eye, Activity, Layers, Lightbulb, BarChart3, GitBranch,
} from 'lucide-react';
import { sendMessageStream } from '../../services/groqApi';
import { useAiUsage } from '../../hooks/useAiUsage';
import { useAuth } from '../../contexts/AuthContext';
import { fileToCompressedDataUrl, formatAIText } from '../../utils/aiChatHelpers';

// What one analysis covers — shown before upload so it's clear what you get.
const COVERS = [
  { label: 'מגמה ומבנה שוק', icon: TrendingUp },
  { label: 'שלב ויקוף ותבניות', icon: Layers },
  { label: 'אזורי מפתח ונפח', icon: Target },
  { label: 'תרחישים ורמות אישור', icon: GitBranch },
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

// One complete, professional read (the server-side Wyckoff prompt owns the
// structure and forbids entry/exit advice). Tight sections keep the request
// well under the vision model's per-minute token cap.
const ANALYSIS_PROMPT = 'נתח את הגרף שבתמונה ניתוח מקצועי ומלא לפי המבנה הקבוע (הטיה טכנית + 6 הסעיפים הממוספרים): מגמה ומבנה שוק, שלב במחזור ויקוף ואירועים (Spring/UTAD/LPS/LPSY), תבניות מחיר, אזורי תמיכה והתנגדות מרכזיים, נפח מול תנועת מחיר, ושני תרחישים (שורי ודובי) עם הרמה שמאשרת כל אחד והרמה שמבטלת אותו. כל סעיף 2–4 שורות, חד, בלי חזרות ובלי מילוי. כותרות נקיות בלי כוכביות, למשל "1. מבנה כללי".';

function ThinkingTimeline() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      setStep((s) => Math.min(s + 1, THINK_STEPS.length - 1));
    }, 1700);
    return () => clearInterval(t);
  }, []);

  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="rounded-2xl border border-border-primary bg-bg-secondary p-4"
    >
      <div className="flex items-center gap-2.5 mb-4">
        <m.div
          animate={{ scale: [1, 1.12, 1] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          className="w-8 h-8 rounded-xl bg-accent-primary/15 flex items-center justify-center"
        >
          <Brain className="w-4.5 h-4.5 text-accent-primary" />
        </m.div>
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
            <m.div
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
                      <m.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
                        <s.icon className="w-3.5 h-3.5 text-accent-primary" />
                      </m.div>
                    )
                    : <s.icon className="w-3.5 h-3.5 text-text-muted" />
                }
              </div>
              <span className={`text-xs transition-colors ${
                done ? 'text-text-secondary' : active ? 'text-text-primary font-semibold' : 'text-text-muted'
              }`}>
                {s.label}
              </span>
            </m.div>
          );
        })}
      </div>

      <div className="mt-4 h-1 bg-bg-tertiary rounded-full overflow-hidden">
        <m.div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg, #005e80, #007ba7)' }}
          animate={{ width: `${((step + 1) / THINK_STEPS.length) * 92}%` }}
          transition={{ duration: 0.6 }}
        />
      </div>
    </m.div>
  );
}

export default function ChartAnalyzer({ heightClass = '', initialImage = null }) {
  // initialImage ({ dataUrl, name }) pre-loads a chart the trader picked here.
  const [image, setImage] = useState(initialImage); // { dataUrl, name }
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
        [{ role: 'user', text: ANALYSIS_PROMPT, image: image.dataUrl }],
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

  return (
    <div className="w-full">
      <div className={`relative flex flex-col rounded-2xl overflow-hidden border border-border-primary bg-bg-secondary ${heightClass}`}>
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border-primary">
          <span className="text-sm font-semibold text-text-primary">ניתוח גרף מתמונה</span>
          {isPremium && aiUsage.imageLimit > 0 && (
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${imgRemaining <= 2 ? 'bg-loss/12 text-loss' : 'bg-accent-primary/12 text-accent-hover'}`}>
              {imgRemaining} ניתוחים נותרו היום
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 md:p-5">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onInputChange} />

          {!image ? (
            // Empty state: one clear drop zone + what the analysis covers.
            <div className="h-full min-h-[18rem] flex flex-col items-center justify-center gap-6">
              <div
                role="button"
                tabIndex={0}
                onClick={openPicker}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } }}
                onDragOver={(e) => { e.preventDefault(); if (!premiumLocked) setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={`w-full max-w-xl flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-10 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${
                  dragOver ? 'border-accent-primary bg-accent-primary/10' : 'border-border-hover bg-bg-tertiary hover:border-accent-primary/50'
                }`}
              >
                <span className="w-14 h-14 rounded-2xl grid place-items-center" style={{ background: 'linear-gradient(135deg, #005e80 0%, #007ba7 100%)', boxShadow: '0 0 28px -6px rgba(0,123,167,0.7)' }}>
                  {premiumLocked ? <Crown className="w-7 h-7" style={{ color: '#ffffff' }} /> : <ImagePlus className="w-7 h-7" style={{ color: '#ffffff' }} />}
                </span>
                {premiumLocked ? (
                  <div className="text-center">
                    <p className="text-base font-bold text-text-primary">ניתוח גרפים מתמונה — למנויי Premium</p>
                    <p className="text-sm text-text-secondary mt-1">שדרג כדי להעלות צילום גרף ולקבל ניתוח מקצועי מלא</p>
                    <span className="inline-flex items-center gap-1.5 mt-4 h-10 px-4 rounded-xl bg-accent-muted text-white text-sm font-bold">
                      <Crown className="w-4 h-4" /> שדרוג ל-Premium
                    </span>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-base font-bold text-text-primary">גרור לכאן צילום של גרף</p>
                    <p className="text-sm text-text-secondary mt-1">או לחץ לבחירת קובץ · PNG, JPG או WebP</p>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full max-w-xl">
                {COVERS.map((c) => (
                  <div key={c.label} className="flex flex-col items-center gap-1.5 text-center rounded-xl bg-bg-tertiary border border-border-primary px-2 py-3">
                    {c.icon && <c.icon className="w-4 h-4 text-accent-hover" />}
                    <span className="text-xs text-text-secondary leading-snug">{c.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // Chart beside its analysis on wide screens, stacked on phones.
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-4 items-start">
              <div className="space-y-3 lg:sticky lg:top-0">
                <div className={`relative rounded-2xl border overflow-hidden bg-black/40 ${analyzing ? 'border-accent-primary/60' : 'border-border-primary'}`}>
                  <img src={image.dataUrl} alt="הגרף שהועלה" className="w-full max-h-[22rem] object-contain" />
                  {analyzing && (
                    <m.div
                      initial={{ left: '-12%' }}
                      animate={{ left: ['-12%', '104%'] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                      className="pointer-events-none absolute inset-y-0 w-12"
                      style={{ background: 'linear-gradient(90deg, transparent, rgba(0,123,167,0.35), transparent)' }}
                    />
                  )}
                  <div className="absolute top-2 left-2 flex gap-1.5">
                    <button onClick={() => fileInputRef.current?.click()} disabled={analyzing} aria-label="בחר תמונה אחרת" title="בחר תמונה אחרת"
                      className="w-9 h-9 grid place-items-center rounded-lg bg-black/60 backdrop-blur text-text-secondary hover:text-text-primary transition-colors cursor-pointer disabled:opacity-40">
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    <button onClick={reset} disabled={analyzing} aria-label="הסר תמונה" title="הסר תמונה"
                      className="w-9 h-9 grid place-items-center rounded-lg bg-black/60 backdrop-blur text-text-secondary hover:text-loss transition-colors cursor-pointer disabled:opacity-40">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {!resultText && !analyzing && (
                  <button onClick={analyze} className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-accent-muted hover:bg-accent-primary text-white text-sm font-bold transition-colors cursor-pointer">
                    <Sparkles className="w-4 h-4" /> נתח את הגרף
                  </button>
                )}
                {error && (
                  <div className="bg-loss/10 border border-loss/25 rounded-xl px-4 py-3 text-sm text-loss text-center">{error}</div>
                )}
              </div>

              <div className="min-w-0">
                <AnimatePresence>
                  {analyzing && !resultText && <ThinkingTimeline />}
                </AnimatePresence>

                {resultText ? (
                  <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border-primary bg-bg-tertiary overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border-primary">
                      <span className="flex items-center gap-2 text-sm font-bold text-text-primary">
                        <Sparkles className="w-4 h-4 text-accent-hover" /> הניתוח
                      </span>
                      {!analyzing && (
                        <div className="flex items-center gap-1">
                          <button onClick={copyResult} className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-bg-secondary cursor-pointer">
                            {copied ? <><Check className="w-3.5 h-3.5 text-profit" /> הועתק</> : <><Copy className="w-3.5 h-3.5" /> העתק</>}
                          </button>
                          <button onClick={newAnalysis} className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-bg-secondary cursor-pointer">
                            <RefreshCw className="w-3.5 h-3.5" /> ניתוח חדש
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="px-4 py-4 text-[15px] leading-relaxed text-text-primary/90">
                      {formatAIText(resultText)}
                    </div>
                  </m.div>
                ) : !analyzing && (
                  <div className="hidden lg:flex h-full min-h-[14rem] flex-col items-center justify-center text-center gap-2 rounded-2xl border border-dashed border-border-primary px-6">
                    <Sparkles className="w-6 h-6 text-accent-hover" />
                    <p className="text-sm text-text-secondary">הניתוח יופיע כאן: מגמה, שלב ויקוף, אזורי מפתח ותרחישים.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <p className="mt-5 text-[11px] leading-relaxed text-text-muted text-center">
            הניתוח מופק אוטומטית למטרות לימוד ואינו ייעוץ השקעות. ההחלטות והאחריות הן של הסוחר בלבד.
          </p>
        </div>
      </div>
    </div>
  );
}
