import { useState, useEffect } from 'react';
import { Plus, X, Sparkles, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Bitcoin, Layers, Dog, Landmark } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../shared/Modal';
import PairSearchMulti from '../shared/PairSearchMulti';
import TimeframeSelector from '../shared/TimeframeSelector';
import CoinIcon from '../shared/CoinIcon';
import { SESSIONS, SECTORS, getSessionClasses } from '../../utils/constants';
import { useUserTimeframes } from '../../hooks/useUserTimeframes';

const SECTOR_ICONS = { Bitcoin, Layers, Dog, Landmark };

const TEMPLATES = [
  {
    name: 'סקאלפינג',
    description: 'עסקאות מהירות על טיימפריימים נמוכים, פוקוס על אורדר בלוקים ו-Market Structure',
    entryRules: '1. זיהוי Order Block בטיימפריים נמוך (1m/5m)\n2. חיפוש BOS/CHoCH\n3. כניסה ב-OB עם אישור נר\n4. ווליום גבוה באזור הכניסה',
    exitRules: '1. יעד: 1:2 RR מינימום\n2. סטופ צמוד מתחת/מעל ה-OB\n3. יציאה חלקית ב-1:1\n4. הזזת סטופ לנקודת כניסה אחרי 1:1',
    riskManagement: 'סיכון מקסימלי 0.5% לעסקה\nמקסימום 3 עסקאות הפסד ברצף = הפסקה',
    goals: 'יעד יומי: 1-2%\nפוקוס על עקביות ולא על רווח גדול',
    pairs: ['BTCUSDT', 'ETHUSDT'],
    timeframes: ['1m', '5m', '15m'],
    sessions: ['London', 'New York'],
    maxDailyLoss: 3,
    maxPositions: 1,
    checklist: ['בדיקת מגמה ב-HTF', 'זיהוי אזור POI', 'אישור BOS/CHoCH', 'בדיקת ווליום', 'RR מינימום 1:2'],
  },
  {
    name: 'דיי טריידינג',
    description: 'עסקאות תוך-יומיות על טיימפריימים בינוניים, שילוב Supply & Demand עם Wyckoff',
    entryRules: '1. ניתוח HTF (4H/1D) לכיוון המגמה\n2. זיהוי אזור Supply/Demand ב-1H\n3. ירידה ל-15m לחיפוש כניסה\n4. אישור מבנה Wyckoff (Spring/UTAD)',
    exitRules: '1. יעד: אזור S&D הבא\n2. סטופ מתחת/מעל אזור ה-S&D\n3. TP1 ב-1:2, TP2 ב-1:3\n4. טריילינג סטופ אחרי TP1',
    riskManagement: 'סיכון מקסימלי 1% לעסקה\nהפסד יומי מקסימלי 3%\nמקסימום 3 עסקאות במקביל',
    goals: 'יעד שבועי: 3-5%\nאחוז הצלחה מעל 50%',
    pairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'AVAXUSDT'],
    timeframes: ['15m', '1H', '4H'],
    sessions: ['London', 'New York'],
    maxDailyLoss: 3,
    maxPositions: 3,
    checklist: ['בדיקת חדשות/אירועים', 'ניתוח HTF', 'זיהוי אזורי S&D', 'בדיקת מגמה כללית', 'RR מינימום 1:2', 'אין עסקאות נקמה'],
  },
  {
    name: 'סווינג טריידינג',
    description: 'עסקאות לטווח של ימים עד שבועות, מבוססות מגמה ומבנה שוק',
    entryRules: '1. זיהוי מגמה ב-1W/1D\n2. חיפוש Pullback לאזור מפתח\n3. אישור היפוך ב-4H\n4. כניסה עם סטופ רחב',
    exitRules: '1. יעד: High/Low קודם\n2. סטופ מתחת/מעל Swing Low/High\n3. יציאה חלקית ברמות מפתח\n4. מעקב עם טריילינג סטופ',
    riskManagement: 'סיכון מקסימלי 2% לעסקה\nהפסד שבועי מקסימלי 5%\nמקסימום 5 עסקאות פתוחות',
    goals: 'יעד חודשי: 10-15%\nפוקוס על עסקאות איכותיות',
    pairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
    timeframes: ['4H', '1D', '1W'],
    sessions: [],
    maxDailyLoss: 5,
    maxPositions: 5,
    checklist: ['ניתוח שבועי', 'בדיקת מגמה ראשית', 'זיהוי רמות מפתח', 'בדיקת קורלציה BTC', 'תכנון TP ו-SL מראש'],
  },
  {
    name: 'Wyckoff',
    description: 'מסחר לפי מתודולוגיית Wyckoff — זיהוי Accumulation/Distribution ואיתותי SOS/SOW',
    entryRules: '1. זיהוי שלב Accumulation/Distribution\n2. חיפוש Spring (Acc) או UTAD (Dist)\n3. אישור SOS/SOW עם ווליום\n4. כניסה ב-LPS/LPSY',
    exitRules: '1. יעד: קצה טווח המסחר\n2. סטופ מתחת ל-Spring / מעל UTAD\n3. יציאה חלקית ב-SOS/SOW\n4. מעקב עד BU/BUEC',
    riskManagement: 'סיכון מקסימלי 1% לעסקה\nכניסה רק אחרי אישור מבנה מלא\nאין כניסה באמצע טווח',
    goals: 'זיהוי מדויק של שלבי Wyckoff\nRR ממוצע 1:3',
    pairs: ['BTCUSDT', 'ETHUSDT'],
    timeframes: ['1H', '4H'],
    sessions: ['London', 'New York'],
    maxDailyLoss: 2,
    maxPositions: 2,
    checklist: ['זיהוי שלב (Acc/Dist/Markup/Markdown)', 'ניתוח ווליום', 'חיפוש אירוע (PS/SC/AR/ST)', 'אישור Spring/UTAD', 'תכנון כניסה ב-LPS/LPSY'],
  },
  {
    name: 'Supply & Demand',
    description: 'זיהוי אזורי היצע וביקוש לכניסות מדויקות',
    entryRules: '1. סימון אזורי S&D ב-HTF (4H/1D)\n2. ירידה ל-LTF (15m/1H) לכניסה\n3. כניסה כשמחיר נוגע באזור\n4. אישור נר היפוך + ווליום',
    exitRules: '1. יעד: אזור S&D הנגדי\n2. סטופ מתחת/מעל האזור\n3. יציאה חלקית ב-50% מהמרחק\n4. הזזת סטופ לBE אחרי 1:1',
    riskManagement: 'סיכון מקסימלי 1% לעסקה\nכניסה רק באזורים "טריים" (לא נבדקו)\nאין כניסה נגד המגמה',
    goals: 'אחוז הצלחה מעל 55%\nRR ממוצע 1:2.5',
    pairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'AVAXUSDT', 'BNBUSDT'],
    timeframes: ['15m', '1H', '4H'],
    sessions: ['London', 'New York', 'Asia', 'London/NY Overlap'],
    maxDailyLoss: 3,
    maxPositions: 3,
    checklist: ['סימון אזורי S&D ב-HTF', 'בדיקת כיוון מגמה', 'האזור טרי?', 'אישור ב-LTF', 'RR מינימום 1:2', 'אין אירועי חדשות קרובים'],
  },
];

const defaultForm = {
  name: '',
  description: '',
  entryRules: '',
  exitRules: '',
  riskManagement: '',
  goals: '',
  notes: '',
  pairs: [],
  timeframes: [],
  sessions: [],
  maxDailyLoss: '',
  maxPositions: '',
  checklist: [],
  isActive: true,
  color: '#06b6d4',
  tradeExamples: [],
  marketConditions: '',
  mistakesToAvoid: [],
  dailyRoutine: '',
  tradeManagement: '',
};

export default function PlanForm({ isOpen, onClose, plan, onSave, saveLabel = '' }) {
  const { allTimeframes, addTimeframe, removeTimeframe } = useUserTimeframes();
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [mobileStep, setMobileStep] = useState(0);
  const [pairsExpanded, setPairsExpanded] = useState(false);
  const [newMistake, setNewMistake] = useState('');
  const MOBILE_STEP_COUNT = 6;

  useEffect(() => {
    if (plan) {
      setForm({ ...defaultForm, ...plan });
    } else {
      setForm(defaultForm);
    }
    setShowTemplates(false);
    setMobileStep(0);
  }, [plan, isOpen]);

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const toggleArray = (field, value) =>
    setForm((f) => ({
      ...f,
      [field]: f[field].includes(value) ? f[field].filter((v) => v !== value) : [...f[field], value],
    }));

  const addChecklistItem = () => {
    if (!newItem.trim()) return;
    update('checklist', [...form.checklist, newItem.trim()]);
    setNewItem('');
  };

  const removeChecklistItem = (index) =>
    update('checklist', form.checklist.filter((_, i) => i !== index));

  const addMistake = () => {
    if (!newMistake.trim()) return;
    update('mistakesToAvoid', [...form.mistakesToAvoid, newMistake.trim()]);
    setNewMistake('');
  };

  const removeMistake = (index) =>
    update('mistakesToAvoid', form.mistakesToAvoid.filter((_, i) => i !== index));

  const addTradeExample = () => {
    update('tradeExamples', [...form.tradeExamples, { title: '', chartUrl: '', description: '' }]);
  };

  const removeTradeExample = (index) =>
    update('tradeExamples', form.tradeExamples.filter((_, i) => i !== index));

  const updateTradeExample = (index, field, value) => {
    const updated = form.tradeExamples.map((ex, i) => i === index ? { ...ex, [field]: value } : ex);
    update('tradeExamples', updated);
  };

  const toImageUrl = (url) => {
    if (!url) return null;
    const tvMatch = url.match(/tradingview\.com\/x\/([a-zA-Z0-9]+)/);
    if (tvMatch) {
      const id = tvMatch[1];
      return `https://s3.tradingview.com/snapshots/${id[0].toLowerCase()}/${id}.png`;
    }
    if (url.startsWith('http')) return url;
    return null;
  };

  const removePair = (pair) => update('pairs', form.pairs.filter((p) => p !== pair));

  const addPair = (pair) => {
    if (!form.pairs.includes(pair)) update('pairs', [...form.pairs, pair]);
  };

  const toggleSector = (sector) => {
    const allSelected = sector.coins.every((c) => form.pairs.includes(c));
    if (allSelected) {
      update('pairs', form.pairs.filter((p) => !sector.coins.includes(p)));
    } else {
      const toAdd = sector.coins.filter((c) => !form.pairs.includes(c));
      update('pairs', [...form.pairs, ...toAdd]);
    }
  };


  const MAX_VISIBLE_PAIRS = 9;
  const pairsOverflow = form.pairs.length > MAX_VISIBLE_PAIRS;
  const visiblePairs = pairsExpanded ? form.pairs : form.pairs.slice(0, MAX_VISIBLE_PAIRS);
  const hiddenCount = form.pairs.length - MAX_VISIBLE_PAIRS;

  const applyTemplate = (template) => {
    setForm({
      ...defaultForm,
      ...template,
      isActive: true,
    });
    setShowTemplates(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('יש להזין שם לתוכנית'); return; }
    setSaving(true);
    try {
      const data = {
        ...form,
        maxDailyLoss: form.maxDailyLoss ? Number(form.maxDailyLoss) : null,
        maxPositions: form.maxPositions ? Number(form.maxPositions) : null,
      };
      await onSave(data);
      onClose();
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const submitLabel = saving ? 'שומר...' : (saveLabel || (plan ? 'עדכן תוכנית' : 'צור תוכנית'));
  const inputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors';
  const labelClass = 'block text-xs text-text-muted mb-1';
  const sectionClass = 'text-sm font-semibold text-text-secondary mb-2 mt-5';

  // Reusable pairs section with sectors + collapsible chips + search
  const pairsSection = (
    <div>
      <label className={labelClass}>זוגות</label>
      {/* Sector buttons */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {SECTORS.map((sector) => {
          const Icon = SECTOR_ICONS[sector.icon];
          const allSelected = sector.coins.every((c) => form.pairs.includes(c));
          return (
            <button key={sector.key} type="button" onClick={() => toggleSector(sector)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${allSelected ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/30' : 'bg-bg-tertiary text-text-muted border border-border-primary hover:border-accent-primary/30'}`}>
              {Icon && <Icon className="w-3.5 h-3.5" />}
              {sector.label}
            </button>
          );
        })}
      </div>
      {/* Selected pairs chips - collapsible by count */}
      {form.pairs.length > 0 && (
        <>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {visiblePairs.map((p) => (
              <span key={p} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-accent-primary/20 text-accent-primary border border-accent-primary/30">
                <CoinIcon pair={p} className="w-3.5 h-3.5" />
                {p}
                <button type="button" onClick={() => removePair(p)} className="hover:text-loss transition-colors cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          {pairsOverflow && (
            <button type="button" onClick={() => setPairsExpanded((v) => !v)}
              className="flex items-center gap-1 text-[10px] text-text-muted hover:text-accent-primary transition-colors cursor-pointer mb-1.5">
              {pairsExpanded ? <><ChevronUp className="w-3 h-3" /> הצג פחות</> : <><ChevronDown className="w-3 h-3" /> הצג עוד ({hiddenCount})</>}
            </button>
          )}
        </>
      )}
      {/* Search input */}
      <PairSearchMulti selectedPairs={form.pairs} onAdd={addPair} />
    </div>
  );

  // Reusable TF + Sessions section (inline)
  const tfSessionsSection = (
    <>
      <div>
        <TimeframeSelector
          label="טיימפריימים"
          value={form.timeframes}
          onChange={(val) => update('timeframes', val)}
          multi
          timeframes={allTimeframes}
          onAdd={addTimeframe}
          onRemove={removeTimeframe}
        />
      </div>
      <div>
        <label className={labelClass}>סשנים</label>
        <div className="flex flex-wrap gap-1.5">
          {SESSIONS.map((s) => (
            <button key={s} type="button" onClick={() => toggleArray('sessions', s)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer border ${form.sessions.includes(s) ? getSessionClasses(s) : 'bg-bg-tertiary text-text-muted border-border-primary'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={
      <span className="flex items-center gap-3 flex-wrap">
        <span>{plan ? 'עריכת תוכנית' : 'תוכנית מסחר חדשה'}</span>
        {!plan && (
          <button
            type="button"
            onClick={() => setShowTemplates(!showTemplates)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent-primary/10 hover:bg-accent-primary/20 text-accent-primary text-xs font-medium transition-colors cursor-pointer border border-accent-primary/20"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {showTemplates ? 'הסתר טמפלייטים' : 'בחר טמפלייט מוכן'}
          </button>
        )}
        <span className="flex items-center gap-2">
          <span className="text-xs font-normal text-text-muted">{form.isActive ? 'פעילה' : 'לא פעילה'}</span>
          <button type="button" onClick={(e) => { e.stopPropagation(); update('isActive', !form.isActive); }}
            className={`w-9 h-[18px] rounded-full transition-colors cursor-pointer ${form.isActive ? 'bg-profit' : 'bg-gray-300 dark:bg-gray-600'}`}>
            <div className={`w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${form.isActive ? '-translate-x-[18px]' : '-translate-x-0.5'}`} />
          </button>
        </span>
      </span>
    } maxWidth="max-w-7xl">
      {!plan && showTemplates && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
          {TEMPLATES.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => applyTemplate(t)}
              className="text-right p-3 bg-bg-tertiary border border-border-primary rounded-xl hover:border-accent-primary/40 transition-colors cursor-pointer"
            >
              <p className="text-sm font-semibold text-text-primary">{t.name}</p>
              <p className="text-[11px] text-text-muted mt-1 leading-relaxed line-clamp-2">{t.description}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {t.timeframes.map((tf) => (
                  <span key={tf} className="px-1.5 py-0.5 bg-bg-secondary rounded text-[10px] text-text-muted">{tf}</span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="pt-2">
        {/* ── Desktop: 4-column grid ── */}
        <div className="hidden md:grid md:grid-cols-4 md:gap-6">
          {/* Column 1: Basic Info + Entry/Exit */}
          <div className="space-y-4">
            <div>
              <label className={labelClass}>שם התוכנית</label>
              <div className="flex items-center gap-2">
                <input value={form.name} onChange={(e) => update('name', e.target.value)} className={`${inputClass} flex-1`} placeholder="לדוגמה: סקאלפינג BTC" required />
                <label className="relative cursor-pointer shrink-0" title="צבע">
                  <div className="w-9 h-9 rounded-lg border-2 border-border-primary hover:border-border-hover transition-colors" style={{ backgroundColor: form.color }} />
                  <input type="color" value={form.color} onChange={(e) => update('color', e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                </label>
              </div>
            </div>
            <div>
              <label className={labelClass}>תיאור</label>
              <textarea value={form.description} onChange={(e) => update('description', e.target.value)} className={`${inputClass} h-16 resize-none`} placeholder="על מה התוכנית הזו?" />
            </div>
            <h3 className={sectionClass}>כללי כניסה ויציאה</h3>
            <div>
              <label className={labelClass}>כללי כניסה</label>
              <textarea value={form.entryRules} onChange={(e) => update('entryRules', e.target.value)} className={`${inputClass} h-[5.5rem] resize-none`} placeholder="מתי נכנסים לעסקה?" />
            </div>
            <div>
              <label className={labelClass}>כללי יציאה</label>
              <textarea value={form.exitRules} onChange={(e) => update('exitRules', e.target.value)} className={`${inputClass} h-[5.5rem] resize-none`} placeholder="מתי יוצאים? TP, SL..." />
            </div>
            <h3 className={sectionClass}>ניהול עסקה</h3>
            <div>
              <textarea value={form.tradeManagement} onChange={(e) => update('tradeManagement', e.target.value)} className={`${inputClass} h-16 resize-none`} placeholder="סקיילינג, הזזת סטופ, BE..." />
            </div>
          </div>

          {/* Column 2: Risk + Goals + Market + Routine */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-text-secondary mb-2">ניהול סיכונים</h3>
            <div>
              <label className={labelClass}>כללי ניהול סיכונים</label>
              <textarea value={form.riskManagement} onChange={(e) => update('riskManagement', e.target.value)} className={`${inputClass} h-16 resize-none`} placeholder="סיכון מקסימלי, גודל פוזיציה..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>הפסד יומי מקסימלי (%)</label>
                <input type="number" min="0" step="0.5" value={form.maxDailyLoss} onChange={(e) => update('maxDailyLoss', e.target.value)} className={inputClass} placeholder="3" />
              </div>
              <div>
                <label className={labelClass}>מקסימום עסקאות במקביל</label>
                <input type="number" min="1" step="1" value={form.maxPositions} onChange={(e) => update('maxPositions', e.target.value)} className={inputClass} placeholder="3" />
              </div>
            </div>
            <h3 className={sectionClass}>יעדים</h3>
            <div>
              <textarea value={form.goals} onChange={(e) => update('goals', e.target.value)} className={`${inputClass} h-16 resize-none`} placeholder="יעד יומי, שבועי, חודשי..." />
            </div>
            <h3 className={sectionClass}>תנאי שוק</h3>
            <div>
              <textarea value={form.marketConditions} onChange={(e) => update('marketConditions', e.target.value)} className={`${inputClass} h-16 resize-none`} placeholder="מתי לסחור ומתי לא..." />
            </div>
            <h3 className={sectionClass}>שגרה יומית</h3>
            <div>
              <textarea value={form.dailyRoutine} onChange={(e) => update('dailyRoutine', e.target.value)} className={`${inputClass} h-16 resize-none`} placeholder="בדיקת HTF, סימון אזורים, חדשות..." />
            </div>
          </div>

          {/* Column 3: Checklist + Mistakes + Notes */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-text-secondary mb-2">צ׳קליסט לפני עסקה</h3>
            <div className="space-y-1.5">
              {form.checklist.map((item, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="flex-1 bg-bg-tertiary border border-border-primary rounded-lg px-2.5 py-1.5 text-xs text-text-primary">{item}</span>
                  <button type="button" onClick={() => removeChecklistItem(i)} className="p-1 rounded-lg text-text-muted hover:text-loss hover:bg-bg-tertiary transition-colors cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex gap-1.5">
                <input value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addChecklistItem())} className={inputClass} placeholder="הוסף פריט..." />
                <button type="button" onClick={addChecklistItem} className="px-2.5 py-2 bg-bg-tertiary border border-border-primary rounded-lg text-text-muted hover:text-accent-primary transition-colors cursor-pointer">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            <h3 className={sectionClass}>טעויות נפוצות</h3>
            <div className="space-y-1.5">
              {form.mistakesToAvoid.map((item, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="flex-1 bg-bg-tertiary border border-border-primary rounded-lg px-2.5 py-1.5 text-xs text-text-primary">{item}</span>
                  <button type="button" onClick={() => removeMistake(i)} className="p-1 rounded-lg text-text-muted hover:text-loss hover:bg-bg-tertiary transition-colors cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex gap-1.5">
                <input value={newMistake} onChange={(e) => setNewMistake(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMistake())} className={inputClass} placeholder="הוסף טעות..." />
                <button type="button" onClick={addMistake} className="px-2.5 py-2 bg-bg-tertiary border border-border-primary rounded-lg text-text-muted hover:text-accent-primary transition-colors cursor-pointer">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            <h3 className={sectionClass}>הערות</h3>
            <div>
              <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} className={`${inputClass} h-16 resize-none`} placeholder="הערות, תובנות, דברים לזכור..." />
            </div>
          </div>

          {/* Column 4: Trade Examples only */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-text-secondary mb-2">דוגמאות כניסה</h3>
            <div className="space-y-3">
              {form.tradeExamples.map((ex, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input value={ex.title} onChange={(e) => updateTradeExample(i, 'title', e.target.value)} className={`${inputClass} flex-1`} placeholder="כותרת" />
                    <button type="button" onClick={() => removeTradeExample(i)} className="p-1 rounded-lg text-text-muted hover:text-loss transition-colors cursor-pointer">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <input value={ex.chartUrl} onChange={(e) => updateTradeExample(i, 'chartUrl', e.target.value)} className={inputClass} placeholder="קישור לתמונה או TradingView snapshot" />
                  {toImageUrl(ex.chartUrl) && (
                    <img src={toImageUrl(ex.chartUrl)} alt={ex.title} className="w-full rounded-xl" referrerPolicy="no-referrer" onError={(e) => { e.target.style.display = 'none'; }} />
                  )}
                  <textarea value={ex.description} onChange={(e) => updateTradeExample(i, 'description', e.target.value)} className={`${inputClass} h-12 resize-none`} placeholder="תיאור" />
                </div>
              ))}
              <button type="button" onClick={addTradeExample} className="w-full py-2 border border-dashed border-border-primary rounded-lg text-text-muted hover:text-accent-primary hover:border-accent-primary/30 transition-colors cursor-pointer text-sm flex items-center justify-center gap-1.5">
                <Plus className="w-4 h-4" />
                הוסף דוגמה
              </button>
            </div>
          </div>
        </div>

        {/* Desktop bottom: Pairs + TF + Sessions horizontal */}
        <div className="hidden md:block mt-6 pt-5 border-t border-border-primary">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">זוגות, טיימפריימים וסשנים</h3>
          <div className="grid grid-cols-12 gap-6 items-start">
            <div className="col-span-5">
              {/* Sector buttons */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {SECTORS.map((sector) => {
                  const Icon = SECTOR_ICONS[sector.icon];
                  const allSelected = sector.coins.every((c) => form.pairs.includes(c));
                  return (
                    <button key={sector.key} type="button" onClick={() => toggleSector(sector)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${allSelected ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/30' : 'bg-bg-tertiary text-text-muted border border-border-primary hover:border-accent-primary/30'}`}>
                      {Icon && <Icon className="w-3.5 h-3.5" />}
                      {sector.label}
                    </button>
                  );
                })}
              </div>
              {form.pairs.length > 0 && (
                <>
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {visiblePairs.map((p) => (
                      <span key={p} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-accent-primary/20 text-accent-primary border border-accent-primary/30">
                        <CoinIcon pair={p} className="w-3.5 h-3.5" />
                        {p}
                        <button type="button" onClick={() => removePair(p)} className="hover:text-loss transition-colors cursor-pointer">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  {pairsOverflow && (
                    <button type="button" onClick={() => setPairsExpanded((v) => !v)}
                      className="flex items-center gap-1 text-[10px] text-text-muted hover:text-accent-primary transition-colors cursor-pointer mb-1.5">
                      {pairsExpanded ? <><ChevronUp className="w-3 h-3" /> הצג פחות</> : <><ChevronDown className="w-3 h-3" /> הצג עוד ({hiddenCount})</>}
                    </button>
                  )}
                </>
              )}
              <div className="max-w-xs">
                <PairSearchMulti selectedPairs={form.pairs} onAdd={addPair} />
              </div>
            </div>
            <div className="col-span-3">
              <TimeframeSelector
                label="טיימפריימים"
                value={form.timeframes}
                onChange={(val) => update('timeframes', val)}
                multi
                timeframes={allTimeframes}
                onAdd={addTimeframe}
                onRemove={removeTimeframe}
              />
            </div>
            <div className="col-span-4">
              <label className={labelClass}>סשנים</label>
              <div className="flex flex-wrap gap-1">
                {SESSIONS.map((s) => (
                  <button key={s} type="button" onClick={() => toggleArray('sessions', s)}
                    className={`px-2 py-1.5 rounded-lg text-[10px] font-medium transition-colors cursor-pointer border whitespace-nowrap ${form.sessions.includes(s) ? getSessionClasses(s) : 'bg-bg-tertiary text-text-muted border-border-primary'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Desktop actions */}
        <div className="hidden md:flex gap-3 pt-5 mt-5 border-t border-border-primary">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-lg bg-bg-tertiary text-text-primary hover:bg-border-hover transition-colors cursor-pointer">
            ביטול
          </button>
          <button type="submit" disabled={saving}
            className="flex-1 py-2.5 rounded-lg bg-accent-primary text-bg-primary font-semibold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50">
            {submitLabel}
          </button>
        </div>

        {/* ── Mobile: Step-based layout ── */}
        <div className="md:hidden">
          {/* Step 0: Basic info + Entry/Exit */}
          <div className={`space-y-4 ${mobileStep !== 0 ? 'hidden' : ''}`}>
            <div>
              <label className={labelClass}>שם התוכנית</label>
              <div className="flex items-center gap-2">
                <input value={form.name} onChange={(e) => update('name', e.target.value)} className={`${inputClass} flex-1`} placeholder="לדוגמה: סקאלפינג BTC" required />
                <label className="relative cursor-pointer shrink-0" title="צבע">
                  <div className="w-10 h-10 rounded-lg border-2 border-border-primary" style={{ backgroundColor: form.color }} />
                  <input type="color" value={form.color} onChange={(e) => update('color', e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                </label>
              </div>
            </div>
            <div>
              <label className={labelClass}>תיאור</label>
              <textarea value={form.description} onChange={(e) => update('description', e.target.value)} className={`${inputClass} h-20 resize-none`} placeholder="על מה התוכנית הזו?" />
            </div>
            <h3 className={sectionClass}>כללי כניסה ויציאה</h3>
            <div>
              <label className={labelClass}>כללי כניסה</label>
              <textarea value={form.entryRules} onChange={(e) => update('entryRules', e.target.value)} className={`${inputClass} h-24 resize-none`} placeholder="מתי נכנסים לעסקה? אילו תנאים צריכים להתקיים?" />
            </div>
            <div>
              <label className={labelClass}>כללי יציאה</label>
              <textarea value={form.exitRules} onChange={(e) => update('exitRules', e.target.value)} className={`${inputClass} h-24 resize-none`} placeholder="מתי יוצאים? TP, SL, טריילינג סטופ..." />
            </div>
          </div>

          {/* Step 1: Risk Management + Trade Management + Goals */}
          <div className={`space-y-4 ${mobileStep !== 1 ? 'hidden' : ''}`}>
            <h3 className={sectionClass}>ניהול סיכונים</h3>
            <div>
              <label className={labelClass}>כללי ניהול סיכונים</label>
              <textarea value={form.riskManagement} onChange={(e) => update('riskManagement', e.target.value)} className={`${inputClass} h-20 resize-none`} placeholder="סיכון מקסימלי לעסקה, גודל פוזיציה, כללי הגנה..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>הפסד יומי מקסימלי (%)</label>
                <input type="number" min="0" step="0.5" value={form.maxDailyLoss} onChange={(e) => update('maxDailyLoss', e.target.value)} className={inputClass} placeholder="3" />
              </div>
              <div>
                <label className={labelClass}>מקסימום עסקאות במקביל</label>
                <input type="number" min="1" step="1" value={form.maxPositions} onChange={(e) => update('maxPositions', e.target.value)} className={inputClass} placeholder="3" />
              </div>
            </div>
            <h3 className={sectionClass}>ניהול עסקה</h3>
            <div>
              <textarea value={form.tradeManagement} onChange={(e) => update('tradeManagement', e.target.value)} className={`${inputClass} h-20 resize-none`} placeholder="סקיילינג, הזזת סטופ, BE..." />
            </div>
            <h3 className={sectionClass}>יעדים</h3>
            <div>
              <textarea value={form.goals} onChange={(e) => update('goals', e.target.value)} className={`${inputClass} h-20 resize-none`} placeholder="מה אתה מנסה להשיג? יעד יומי, שבועי, חודשי..." />
            </div>
          </div>

          {/* Step 2: תנאי שוק + שגרה יומית */}
          <div className={`space-y-4 ${mobileStep !== 2 ? 'hidden' : ''}`}>
            <h3 className={sectionClass}>תנאי שוק</h3>
            <div>
              <textarea value={form.marketConditions} onChange={(e) => update('marketConditions', e.target.value)} className={`${inputClass} h-28 resize-none`} placeholder="מתי לסחור: טרנד ברור, נפח גבוה...&#10;מתי לא לסחור: חדשות, שוק צדדי..." />
            </div>
            <h3 className={sectionClass}>שגרה יומית</h3>
            <div>
              <textarea value={form.dailyRoutine} onChange={(e) => update('dailyRoutine', e.target.value)} className={`${inputClass} h-28 resize-none`} placeholder="1. בדיקת HTF&#10;2. סימון אזורים&#10;3. בדיקת חדשות..." />
            </div>
          </div>

          {/* Step 3: טעויות נפוצות + דוגמאות כניסה */}
          <div className={`space-y-4 ${mobileStep !== 3 ? 'hidden' : ''}`}>
            <h3 className={sectionClass}>טעויות נפוצות</h3>
            <div className="space-y-2">
              {form.mistakesToAvoid.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary">{item}</span>
                  <button type="button" onClick={() => removeMistake(i)} className="p-1.5 rounded-lg text-text-muted hover:text-loss hover:bg-bg-tertiary transition-colors cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input value={newMistake} onChange={(e) => setNewMistake(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMistake())} className={inputClass} placeholder="הוסף טעות..." />
                <button type="button" onClick={addMistake} className="px-3 py-2 bg-bg-tertiary border border-border-primary rounded-lg text-text-muted hover:text-accent-primary transition-colors cursor-pointer">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            <h3 className={sectionClass}>דוגמאות כניסה</h3>
            <div className="space-y-3">
              {form.tradeExamples.map((ex, i) => (
                <div key={i} className="bg-bg-tertiary border border-border-primary rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input value={ex.title} onChange={(e) => updateTradeExample(i, 'title', e.target.value)} className={`${inputClass} flex-1`} placeholder="כותרת" />
                    <button type="button" onClick={() => removeTradeExample(i)} className="p-1 rounded-lg text-text-muted hover:text-loss transition-colors cursor-pointer">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <input value={ex.chartUrl} onChange={(e) => updateTradeExample(i, 'chartUrl', e.target.value)} className={inputClass} placeholder="קישור לתמונה או TradingView snapshot" />
                  {toImageUrl(ex.chartUrl) && (
                    <img src={toImageUrl(ex.chartUrl)} alt={ex.title} className="w-full rounded-lg" referrerPolicy="no-referrer" onError={(e) => { e.target.style.display = 'none'; }} />
                  )}
                  <textarea value={ex.description} onChange={(e) => updateTradeExample(i, 'description', e.target.value)} className={`${inputClass} h-16 resize-none`} placeholder="תיאור" />
                </div>
              ))}
              <button type="button" onClick={addTradeExample} className="w-full py-2.5 border border-dashed border-border-primary rounded-lg text-text-muted hover:text-accent-primary hover:border-accent-primary/30 transition-colors cursor-pointer text-sm flex items-center justify-center gap-1.5">
                <Plus className="w-4 h-4" />
                הוסף דוגמה
              </button>
            </div>
          </div>

          {/* Step 4: Pairs, Timeframes, Sessions */}
          <div className={`space-y-4 ${mobileStep !== 4 ? 'hidden' : ''}`}>
            <h3 className={sectionClass}>זוגות, טיימפריימים וסשנים</h3>
            {pairsSection}
            {tfSessionsSection}
          </div>

          {/* Step 5: Checklist + Notes */}
          <div className={`space-y-4 ${mobileStep !== 5 ? 'hidden' : ''}`}>
            <h3 className={sectionClass}>צ׳קליסט לפני עסקה</h3>
            <div className="space-y-2">
              {form.checklist.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary">{item}</span>
                  <button type="button" onClick={() => removeChecklistItem(i)} className="p-1.5 rounded-lg text-text-muted hover:text-loss hover:bg-bg-tertiary transition-colors cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addChecklistItem())} className={inputClass} placeholder="הוסף פריט לרשימה..." />
                <button type="button" onClick={addChecklistItem} className="px-3 py-2 bg-bg-tertiary border border-border-primary rounded-lg text-text-muted hover:text-accent-primary transition-colors cursor-pointer">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            <h3 className={sectionClass}>הערות</h3>
            <div>
              <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} className={`${inputClass} h-20 resize-none`} placeholder="הערות נוספות, תובנות, דברים לזכור..." />
            </div>
          </div>

          {/* Mobile step navigation */}
          <div className="flex items-center justify-between pt-4">
            <button type="button" onClick={() => setMobileStep((s) => s - 1)} disabled={mobileStep === 0}
              className="flex items-center gap-1 px-4 py-2.5 rounded-lg bg-bg-tertiary text-text-primary text-sm font-medium transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default">
              <ChevronRight className="w-4 h-4" /> הקודם
            </button>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: MOBILE_STEP_COUNT }, (_, i) => (
                <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i === mobileStep ? 'bg-accent-primary' : 'bg-bg-tertiary'}`} />
              ))}
            </div>
            {mobileStep < MOBILE_STEP_COUNT - 1 ? (
              <button
                key="mobile-next"
                type="button"
                onClick={() => setMobileStep((s) => s + 1)}
                className="flex items-center gap-1 px-4 py-2.5 rounded-lg bg-accent-primary text-bg-primary text-sm font-semibold transition-colors cursor-pointer"
              >
                הבא <ChevronLeft className="w-4 h-4" />
              </button>
            ) : (
              <button
                key="mobile-submit"
                type="button"
                disabled={saving}
                onClick={() => {
                  if (!saving) handleSubmit({ preventDefault: () => {} });
                }}
                className="px-4 py-2.5 rounded-lg bg-accent-primary text-bg-primary text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                {submitLabel}
              </button>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
