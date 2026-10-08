import { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { getUserSetting, setUserSetting } from '../../services/firestoreService';

// Must match the worker's code defaults (SCAN_MIN_CONFIDENCE / zero buffer) —
// an empty settings doc and these values must mean the same engine behavior.
const DEFAULTS = { minConfidence: 60, stopBufferPct: 0 };
const MAX_STOP_BUFFER_PCT = 5;   // worker clamps to this too (SCAN_MAX_STOP_BUFFER_PCT)

const clampConf = (v) => Math.min(95, Math.max(60, Math.round(Number(v) || DEFAULTS.minConfidence)));
const clampBuf = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_STOP_BUFFER_PCT, Math.round(n * 100) / 100);
};

// Engine calibration — writes users/{uid}/settings/scanner, which the cron
// worker reads before alerting (scanReadSettings). Tuning here takes effect on
// the next tick, no redeploy. The threshold slider simulates against the
// training DB (wyckoffSetups) so the owner sees what each cutoff would have
// kept, judged by his own valid/invalid verdicts.
export default function ScannerCalibration({ setups = [] }) {
  const { user } = useAuth();
  const [minConfidence, setMinConfidence] = useState(DEFAULTS.minConfidence);
  // The buffer input keeps a raw STRING while typing — a controlled number
  // state would eat the decimal point mid-keystroke ("0." → 0).
  const [bufStr, setBufStr] = useState(String(DEFAULTS.stopBufferPct));
  const [saved, setSaved] = useState(DEFAULTS);       // last persisted values (dirty tracking)
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const stopBufferPct = clampBuf(bufStr);

  useEffect(() => {
    if (!user?.uid) return;
    let alive = true;
    getUserSetting(user.uid, 'scanner')
      .then((data) => {
        if (!alive) return;
        const cur = {
          minConfidence: clampConf(data?.minConfidence ?? DEFAULTS.minConfidence),
          stopBufferPct: clampBuf(data?.stopBufferPct ?? DEFAULTS.stopBufferPct),
        };
        setMinConfidence(cur.minConfidence);
        setBufStr(String(cur.stopBufferPct));
        setSaved(cur);
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [user?.uid]);

  // What this threshold would have done to the scanner detections the owner
  // already judged. label !== 'invalid' counts as valid (same convention as
  // the precision panel in SetupsDatabase).
  const sim = useMemo(() => {
    const judged = setups.filter((s) => s.source === 'scanner' && Number.isFinite(Number(s.confidence)));
    const kept = judged.filter((s) => Number(s.confidence) >= minConfidence);
    const keptValid = kept.filter((s) => s.label !== 'invalid').length;
    return {
      judged: judged.length,
      kept: kept.length,
      filtered: judged.length - kept.length,
      precision: kept.length ? Math.round((keptValid / kept.length) * 100) : null,
    };
  }, [setups, minConfidence]);

  const dirty = minConfidence !== saved.minConfidence || stopBufferPct !== saved.stopBufferPct;

  const handleSave = async () => {
    if (!user?.uid || saving) return;
    setSaving(true);
    try {
      const next = { minConfidence: clampConf(minConfidence), stopBufferPct };
      await setUserSetting(user.uid, 'scanner', { ...next, updatedAt: new Date().toISOString() }, true);
      setSaved(next);
      setMinConfidence(next.minConfidence);
      setBufStr(String(next.stopBufferPct));
      toast.success('הכיול נשמר — נכנס לתוקף בסריקה הבאה (עד 10 דק׳)');
    } catch {
      toast.error('שגיאה בשמירת הכיול');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="@container rounded-2xl border border-border-primary bg-bg-secondary">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border-primary">
        <SlidersHorizontal className="w-4 h-4 text-accent-primary shrink-0" />
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-text-primary">כיול המנוע</h2>
          <p className="text-[11px] text-text-muted">נקרא לפני כל התראה, בלי דיפלוי</p>
        </div>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-1 @xl:grid-cols-2 gap-x-6 gap-y-4">
          {/* Confidence threshold */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-text-secondary">סף ביטחון להתראה</span>
              <span className="text-base font-extrabold num-mono text-accent-primary leading-none">{minConfidence}</span>
            </div>
            <input
              type="range" min="60" max="95" step="5"
              value={minConfidence}
              onChange={(e) => setMinConfidence(Number(e.target.value))}
              disabled={!loaded}
              className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-accent-primary"
            />
            <p className="text-[10px] text-text-muted mt-1.5 leading-relaxed">
              הציונים האפשריים היום: <span className="num-mono">75</span> (מדרגה שנייה + אישור HTF) ·{' '}
              <span className="num-mono">85</span> (+ ווליום דועך או RSI) · <span className="num-mono">95</span> (שניהם).
              סף עד 75 = הכל עובר; 85 = דרוש בונוס אחד; 95 = דרושים שניהם.
            </p>
          </div>

          {/* Stop buffer */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-text-secondary">באפר סטופ</span>
              <span className="text-base font-extrabold num-mono text-accent-primary leading-none" dir="ltr">{stopBufferPct}%</span>
            </div>
            <input
              type="number" min="0" max={MAX_STOP_BUFFER_PCT} step="0.1" inputMode="decimal"
              value={bufStr}
              onChange={(e) => setBufStr(e.target.value)}
              onBlur={() => setBufStr(String(stopBufferPct))}
              disabled={!loaded}
              dir="ltr"
              className="w-full px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border-primary text-sm num-mono text-text-primary focus:outline-none focus:border-accent-primary/50"
            />
            <p className="text-[10px] text-text-muted mt-1.5 leading-relaxed">
              מרחיק את הסטופ מעבר לפיבוט — שורט: מעל השיא, לונג: מתחת לשפל. <span className="num-mono">0%</span> = על הפיבוט עצמו (המצב היום).
            </p>
          </div>
        </div>

        {/* Threshold simulation against the judged training rows + save */}
        <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t border-border-primary">
          <span className="text-[11px] text-text-muted">
            {sim.judged > 0 ? (
              <>
                לפי המאגר: בסף <span className="num-mono text-text-secondary">{minConfidence}</span> עוברים{' '}
                <span className="num-mono text-text-secondary">{sim.kept}/{sim.judged}</span> מהסטאפים שאותרו ותויגו
                {sim.precision != null && <> · דיוק <span className="num-mono font-bold text-accent-primary">{sim.precision}%</span></>}
                {sim.filtered > 0 && <> · {sim.filtered} מסוננים</>}
              </>
            ) : (
              'סמן סטאפים שאותרו כתקין / לא תקין כדי לראות כאן מה כל סף היה מסנן'
            )}
          </span>
          <button
            onClick={handleSave}
            disabled={!loaded || !dirty || saving}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-primary text-white text-sm font-bold hover:brightness-110 transition cursor-pointer disabled:opacity-40 disabled:cursor-default"
          >
            <Save className="w-4 h-4" /> {saving ? 'שומר…' : 'שמור כיול'}
          </button>
        </div>
      </div>
    </section>
  );
}
