import { useState, useEffect } from 'react';
import { Gem, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../shared/Modal';
import { STRATEGY_DEFAULTS, PRICE_PRESETS } from '../../utils/polymarketStrategy';

const INPUT = 'w-full bg-bg-secondary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary/50 transition-colors';
const LABEL = 'block text-xs font-medium text-text-secondary mb-1.5';

function presetOf(s) {
  const hit = PRICE_PRESETS.find((p) => p.min === s.priceMin && p.max === s.priceMax);
  return hit ? hit.key : 'custom';
}

// End-to-end strategy definition: the band you hunt in, the quality floors,
// the runway, and whether smart money must already be positioned.
export default function StrategyFormModal({ isOpen, onClose, onSave, strategy }) {
  const [form, setForm] = useState(STRATEGY_DEFAULTS);
  const [preset, setPreset] = useState('balanced');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    // New strategies open on the "balanced" band — the most teachable default.
    const base = strategy
      ? { ...STRATEGY_DEFAULTS, ...strategy }
      : { ...STRATEGY_DEFAULTS, priceMin: 0.35, priceMax: 0.65 };
    setForm(base);
    setPreset(presetOf(base));
  }, [isOpen, strategy]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const num = (v, fb) => (v === '' || v == null || Number.isNaN(Number(v)) ? fb : Number(v));

  const applyPreset = (p) => {
    setPreset(p.key);
    if (p.min != null) setForm((f) => ({ ...f, priceMin: p.min, priceMax: p.max }));
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) { toast.error('תן שם לאסטרטגיה'); return; }
    if (form.priceMin >= form.priceMax) { toast.error('טווח המחיר לא תקין'); return; }
    setSaving(true);
    try {
      await onSave({
        name,
        keyword: form.keyword.trim(),
        priceMin: Number(form.priceMin),
        priceMax: Number(form.priceMax),
        minLiquidity: num(form.minLiquidity, 5000),
        minVolume24h: num(form.minVolume24h, 1000),
        minDaysToClose: num(form.minDaysToClose, 0),
        maxDaysToClose: num(form.maxDaysToClose, 90),
        requireSmartMoney: !!form.requireSmartMoney,
        notes: form.notes.trim(),
      });
      toast.success(strategy ? 'האסטרטגיה עודכנה' : 'האסטרטגיה נשמרה');
      onClose();
    } catch {
      toast.error('שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const activePreset = PRICE_PRESETS.find((p) => p.key === preset);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={strategy ? 'עריכת אסטרטגיה' : 'בניית אסטרטגיה חדשה'} maxWidth="max-w-lg">
      <div className="space-y-4">
        {/* 1 — identity */}
        <div>
          <label className={LABEL}>1. שם האסטרטגיה</label>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="לדוגמה: פייבוריטים בספורט לטווח קצר" className={INPUT} />
        </div>

        {/* 2 — the band */}
        <div>
          <label className={LABEL}>2. באיזה טווח הסתברות אתה צד?</label>
          <div className="grid grid-cols-2 gap-2">
            {PRICE_PRESETS.map((p) => (
              <button key={p.key} type="button" onClick={() => applyPreset(p)}
                className={`py-2 px-2 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                  preset === p.key ? 'text-accent-primary border-accent-primary/50 bg-accent-primary/10' : 'text-text-muted border-border-primary hover:text-text-primary'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
          {activePreset?.hint && (
            <p className="flex items-start gap-1.5 text-[11px] text-text-muted mt-2 leading-relaxed">
              <Info className="w-3 h-3 shrink-0 mt-0.5" />{activePreset.hint}
            </p>
          )}
          {preset === 'custom' && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className={LABEL}>ממחיר (¢)</label>
                <input type="number" min="1" max="99" value={Math.round(form.priceMin * 100)}
                  onChange={(e) => set('priceMin', num(e.target.value, 5) / 100)} dir="ltr" className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>עד מחיר (¢)</label>
                <input type="number" min="1" max="99" value={Math.round(form.priceMax * 100)}
                  onChange={(e) => set('priceMax', num(e.target.value, 95) / 100)} dir="ltr" className={INPUT} />
              </div>
            </div>
          )}
        </div>

        {/* 3 — quality floors */}
        <div>
          <label className={LABEL}>3. רצפת איכות — כדי לא להיתקע בשוק דליל</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-text-muted mb-1">נזילות מינימלית ($)</label>
              <input type="number" value={form.minLiquidity} onChange={(e) => set('minLiquidity', num(e.target.value, 0))} dir="ltr" className={INPUT} />
            </div>
            <div>
              <label className="block text-[10px] text-text-muted mb-1">מחזור 24ש׳ מינימלי ($)</label>
              <input type="number" value={form.minVolume24h} onChange={(e) => set('minVolume24h', num(e.target.value, 0))} dir="ltr" className={INPUT} />
            </div>
          </div>
        </div>

        {/* 4 — runway */}
        <div>
          <label className={LABEL}>4. חלון זמן עד הכרעה</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-text-muted mb-1">לפחות (ימים)</label>
              <input type="number" min="0" value={form.minDaysToClose} onChange={(e) => set('minDaysToClose', num(e.target.value, 0))} dir="ltr" className={INPUT} />
            </div>
            <div>
              <label className="block text-[10px] text-text-muted mb-1">לכל היותר (ימים)</label>
              <input type="number" min="1" value={form.maxDaysToClose} onChange={(e) => set('maxDaysToClose', num(e.target.value, 90))} dir="ltr" className={INPUT} />
            </div>
          </div>
        </div>

        {/* 5 — smart money + keyword */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>5. מילת מפתח (רשות)</label>
            <input value={form.keyword} onChange={(e) => set('keyword', e.target.value)} placeholder="Bitcoin / Trump / UFC…" dir="ltr" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>דרוש כסף חכם</label>
            <button type="button" onClick={() => set('requireSmartMoney', !form.requireSmartMoney)}
              className={`w-full py-2.5 rounded-lg text-sm font-bold border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                form.requireSmartMoney ? 'text-accent-primary border-accent-primary/50 bg-accent-primary/10' : 'text-text-muted border-border-primary'
              }`}>
              <Gem className="w-3.5 h-3.5" /> {form.requireSmartMoney ? 'רק עם כסף חכם' : 'לא חובה'}
            </button>
          </div>
        </div>

        {/* notes */}
        <div>
          <label className={LABEL}>הערות / כללי ניהול</label>
          <textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)}
            placeholder="כמה להשקיע לכל פוזיציה, מתי לצאת, מה פוסל עסקה…" className={`${INPUT} resize-none`} />
        </div>

        <button onClick={save} disabled={saving}
          className="w-full py-2.5 rounded-lg bg-accent-primary text-bg-primary text-sm font-bold hover:bg-accent-hover transition disabled:opacity-60 cursor-pointer">
          {saving ? 'שומר…' : strategy ? 'עדכן אסטרטגיה' : 'שמור והרץ'}
        </button>
      </div>
    </Modal>
  );
}
