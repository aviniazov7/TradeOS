import { useState, useEffect } from 'react';
import { Trash2, Plus, X, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Bitcoin, Layers, Dog, Landmark } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../shared/Modal';
import ConfirmDialog from '../shared/ConfirmDialog';
import PairSearchMulti from '../shared/PairSearchMulti';
import TimeframeSelector from '../shared/TimeframeSelector';
import CoinIcon from '../shared/CoinIcon';
import { useBacktestContext } from '../../contexts/BacktestContext';
import { SESSIONS, SECTORS, getSessionClasses } from '../../utils/constants';
import { useUserTimeframes } from '../../hooks/useUserTimeframes';

const SECTOR_ICONS = { Bitcoin, Layers, Dog, Landmark };

const defaultForm = {
  name: '', description: '', entryRules: '', exitRules: '',
  riskManagement: '', notes: '', color: '#06b6d4',
  pairs: [], timeframes: [], sessions: [],
  checklist: [],
  tradeExamples: [],
  marketConditions: '',
  tradeManagement: '',
};

export default function BacktestSettingsModal({ isOpen, onClose }) {
  const { activeJournal, activeJournalId, updateJournal, deleteJournal } = useBacktestContext();
  const { allTimeframes, addTimeframe, removeTimeframe } = useUserTimeframes();
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [mobileStep, setMobileStep] = useState(0);
  const [pairsExpanded, setPairsExpanded] = useState(false);
  const MOBILE_STEP_COUNT = 5;

  // Reset step only when modal opens (not on every activeJournal change)
  useEffect(() => {
    if (isOpen) {
      setMobileStep(0);
      setPairsExpanded(false);
    }
  }, [isOpen]);

  // Sync form data when journal or modal state changes
  useEffect(() => {
    if (activeJournal && isOpen) {
      setForm({
        name: activeJournal.name || '',
        description: activeJournal.description || '',
        entryRules: activeJournal.entryRules || '',
        exitRules: activeJournal.exitRules || '',
        riskManagement: activeJournal.riskManagement || '',
        notes: activeJournal.notes || '',
        color: activeJournal.color || '#06b6d4',
        pairs: activeJournal.pairs || [],
        timeframes: activeJournal.timeframes || [],
        sessions: activeJournal.sessions || [],
        checklist: activeJournal.checklist || [],
        tradeExamples: activeJournal.tradeExamples || [],
        marketConditions: activeJournal.marketConditions || '',
        tradeManagement: activeJournal.tradeManagement || '',
      });
    }
  }, [activeJournal, isOpen]);

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const toggleArray = (field, value) =>
    setForm((f) => ({
      ...f,
      [field]: f[field].includes(value) ? f[field].filter((v) => v !== value) : [...f[field], value],
    }));

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

  const addChecklistItem = () => {
    if (!newItem.trim()) return;
    update('checklist', [...form.checklist, newItem.trim()]);
    setNewItem('');
  };

  const removeChecklistItem = (index) =>
    update('checklist', form.checklist.filter((_, i) => i !== index));

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

  const MAX_VISIBLE_PAIRS = 9;
  const pairsOverflow = form.pairs.length > MAX_VISIBLE_PAIRS;
  const visiblePairs = pairsExpanded ? form.pairs : form.pairs.slice(0, MAX_VISIBLE_PAIRS);
  const hiddenCount = form.pairs.length - MAX_VISIBLE_PAIRS;

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await updateJournal(activeJournalId, {
        ...form,
        name: form.name.trim(),
        description: form.description.trim(),
      });
      toast.success('היומן עודכן');
      onClose();
    } catch {
      toast.error('שגיאה בעדכון');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteJournal(activeJournalId);
      toast.success('היומן נמחק');
      setDeleteOpen(false);
      onClose();
    } catch {
      toast.error('שגיאה במחיקה');
    }
  };

  const inputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors text-right';
  const labelClass = 'block text-xs text-text-muted mb-1';
  const sectionClass = 'text-sm font-semibold text-text-secondary mb-2';

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

  // Reusable timeframes section
  const timeframesSection = (
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
  );

  // Reusable sessions section
  const sessionsSection = (
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
  );

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="הגדרות יומן בקטסט" maxWidth="max-w-5xl">
        <form onSubmit={handleSave} onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') e.preventDefault(); }}>
          {/* ── Desktop: 3-column grid ── */}
          <div className="hidden md:grid md:grid-cols-3 md:gap-6">
            {/* Column 1: Basic + Entry/Exit */}
            <div className="space-y-3">
              <div>
                <label className={labelClass}>שם היומן</label>
                <div className="flex items-center gap-2">
                  <input value={form.name} onChange={(e) => update('name', e.target.value)} className={`${inputClass} flex-1`} placeholder="למשל: אסטרטגיית Wyckoff" required />
                  <label className="relative cursor-pointer shrink-0" title="צבע">
                    <div className="w-9 h-9 rounded-lg border-2 border-border-primary hover:border-white/30 transition-colors" style={{ backgroundColor: form.color }} />
                    <input type="color" value={form.color} onChange={(e) => update('color', e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                  </label>
                </div>
              </div>
              <div>
                <label className={labelClass}>תיאור</label>
                <textarea value={form.description} onChange={(e) => update('description', e.target.value)} className={`${inputClass} h-16 resize-none`} placeholder="על מה הבקטסט הזה?" />
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

            {/* Column 2: Risk + Market + Routine + Checklist + Mistakes + Notes */}
            <div className="space-y-3">
              <h3 className={sectionClass}>ניהול סיכונים</h3>
              <div>
                <label className={labelClass}>כללי ניהול סיכונים</label>
                <textarea value={form.riskManagement} onChange={(e) => update('riskManagement', e.target.value)} className={`${inputClass} h-16 resize-none`} placeholder="סיכון מקסימלי, גודל פוזיציה..." />
              </div>
              <h3 className={sectionClass}>תנאי שוק</h3>
              <div>
                <textarea value={form.marketConditions} onChange={(e) => update('marketConditions', e.target.value)} className={`${inputClass} h-16 resize-none`} placeholder="מתי לסחור ומתי לא..." />
              </div>
              <h3 className={sectionClass}>צ׳קליסט לפני עסקה</h3>
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
              <h3 className={sectionClass}>הערות</h3>
              <div>
                <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} className={`${inputClass} h-16 resize-none`} placeholder="הערות, תובנות, דברים לזכור..." />
              </div>
            </div>

            {/* Column 3: Trade Examples + Pairs + TF + Sessions */}
            <div className="space-y-3">
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
                    <textarea value={ex.description} onChange={(e) => updateTradeExample(i, 'description', e.target.value)} className={`${inputClass} h-12 resize-none`} placeholder="תיאור" />
                  </div>
                ))}
                <button type="button" onClick={addTradeExample} className="w-full py-2 border border-dashed border-border-primary rounded-lg text-text-muted hover:text-accent-primary hover:border-accent-primary/30 transition-colors cursor-pointer text-sm flex items-center justify-center gap-1.5">
                  <Plus className="w-4 h-4" />
                  הוסף דוגמה
                </button>
              </div>

              <h3 className={sectionClass}>זוגות, טיימפריימים וסשנים</h3>
              {pairsSection}
              {timeframesSection}
              {sessionsSection}

              <div className="pt-2 mt-auto border-t border-border-primary">
                <button type="button" onClick={() => setDeleteOpen(true)}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-loss hover:bg-loss/10 transition-colors cursor-pointer text-sm">
                  <Trash2 className="w-4 h-4" />
                  מחיקת יומן בקטסט
                </button>
              </div>
            </div>
          </div>

          {/* Desktop actions */}
          <div className="hidden md:flex gap-3 pt-4 mt-4 border-t border-border-primary">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-lg bg-bg-tertiary text-text-primary hover:bg-border-hover transition-colors cursor-pointer">
              ביטול
            </button>
<button type="submit" disabled={saving || !form.name.trim()}
              className="flex-1 py-2.5 rounded-lg bg-accent-primary text-bg-primary font-semibold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50">
              {saving ? 'שומר...' : 'שמור שינויים'}
            </button>
          </div>

          {/* ── Mobile: Step-based layout (5 steps, no scrolling) ── */}
          <div className="md:hidden">
            {/* Step 0: שם + תיאור */}
            <div className={`space-y-4 ${mobileStep !== 0 ? 'hidden' : ''}`}>
              <div>
                <label className={labelClass}>שם היומן</label>
                <div className="flex items-center gap-2">
                  <input value={form.name} onChange={(e) => update('name', e.target.value)} className={`${inputClass} flex-1`} placeholder="למשל: אסטרטגיית Wyckoff" required />
                  <label className="relative cursor-pointer shrink-0" title="צבע">
                    <div className="w-10 h-10 rounded-lg border-2 border-border-primary" style={{ backgroundColor: form.color }} />
                    <input type="color" value={form.color} onChange={(e) => update('color', e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                  </label>
                </div>
              </div>
              <div>
                <label className={labelClass}>תיאור</label>
                <textarea value={form.description} onChange={(e) => update('description', e.target.value)} className={`${inputClass} h-28 resize-none`} placeholder="על מה הבקטסט הזה?" />
              </div>
            </div>

            {/* Step 1: כללי כניסה ויציאה */}
            <div className={`space-y-4 ${mobileStep !== 1 ? 'hidden' : ''}`}>
              <h3 className={sectionClass}>כללי כניסה ויציאה</h3>
              <div>
                <label className={labelClass}>כללי כניסה</label>
                <textarea value={form.entryRules} onChange={(e) => update('entryRules', e.target.value)} className={`${inputClass} h-28 resize-none`} placeholder="מתי נכנסים לעסקה?" />
              </div>
              <div>
                <label className={labelClass}>כללי יציאה</label>
                <textarea value={form.exitRules} onChange={(e) => update('exitRules', e.target.value)} className={`${inputClass} h-28 resize-none`} placeholder="מתי יוצאים? TP, SL..." />
              </div>
            </div>

            {/* Step 2: ניהול סיכונים + ניהול עסקה + הערות */}
            <div className={`space-y-4 ${mobileStep !== 2 ? 'hidden' : ''}`}>
              <h3 className={sectionClass}>ניהול סיכונים</h3>
              <div>
                <textarea value={form.riskManagement} onChange={(e) => update('riskManagement', e.target.value)} className={`${inputClass} h-24 resize-none`} placeholder="סיכון מקסימלי, גודל פוזיציה..." />
              </div>
              <h3 className={sectionClass}>ניהול עסקה</h3>
              <div>
                <textarea value={form.tradeManagement} onChange={(e) => update('tradeManagement', e.target.value)} className={`${inputClass} h-24 resize-none`} placeholder="סקיילינג, הזזת סטופ, BE..." />
              </div>
              <h3 className={sectionClass}>הערות</h3>
              <div>
                <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} className={`${inputClass} h-20 resize-none`} placeholder="הערות, תובנות, דברים לזכור..." />
              </div>
            </div>

            {/* Step 3: תנאי שוק + דוגמאות כניסה */}
            <div className={`space-y-4 ${mobileStep !== 3 ? 'hidden' : ''}`}>
              <h3 className={sectionClass}>תנאי שוק</h3>
              <div>
                <textarea value={form.marketConditions} onChange={(e) => update('marketConditions', e.target.value)} className={`${inputClass} h-24 resize-none`} placeholder="מתי לסחור: טרנד ברור, נפח גבוה...&#10;מתי לא לסחור: חדשות, שוק צדדי..." />
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

            {/* Step 4: זוגות, טיימפריימים, סשנים, צ'קליסט + מחיקה */}
            <div className={`space-y-4 ${mobileStep !== 4 ? 'hidden' : ''}`}>
              <h3 className={sectionClass}>זוגות, טיימפריימים וסשנים</h3>
              {pairsSection}
              {timeframesSection}
              {sessionsSection}

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
                  <input value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addChecklistItem())} className={inputClass} placeholder="הוסף פריט..." />
                  <button type="button" onClick={addChecklistItem} className="px-3 py-2 bg-bg-tertiary border border-border-primary rounded-lg text-text-muted hover:text-accent-primary transition-colors cursor-pointer">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-border-primary">
                <button type="button" onClick={() => setDeleteOpen(true)}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-loss hover:bg-loss/10 transition-colors cursor-pointer text-sm">
                  <Trash2 className="w-4 h-4" />
                  מחיקת יומן בקטסט
                </button>
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
                <button type="button" onClick={() => setMobileStep((s) => s + 1)}
                  className="flex items-center gap-1 px-4 py-2.5 rounded-lg bg-accent-primary text-black text-sm font-semibold transition-colors cursor-pointer">
                  הבא <ChevronLeft className="w-4 h-4" />
                </button>
              ) : (
                <button type="submit" disabled={saving || !form.name.trim()}
                  className="px-4 py-2.5 rounded-lg bg-accent-primary text-bg-primary text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50">
                  {saving ? 'שומר...' : 'שמור שינויים'}
                </button>
              )}
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="מחיקת יומן בקטסט"
        message={`למחוק את היומן "${activeJournal?.name}"? העסקאות שבו לא יימחקו.`}
      />

    </>
  );
}
