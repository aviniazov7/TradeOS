import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Target, Trash2, Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStrategies } from '../../hooks/useStrategies';
import EmptyState from '../shared/EmptyState';
import LoadingSpinner from '../shared/LoadingSpinner';
import ConfirmDialog from '../shared/ConfirmDialog';
import Modal from '../shared/Modal';
import { PAIRS } from '../../utils/constants';
import TimeframeSelector from '../shared/TimeframeSelector';
import { formatRelativeTime } from '../../utils/formatters';
import { useUserTimeframes } from '../../hooks/useUserTimeframes';
import { pageVariants, pageTransition, staggerContainer, staggerItem } from '../../utils/animations';
import CoinIcon from '../shared/CoinIcon';

const defaultForm = {
  name: '',
  description: '',
  entryRules: '',
  exitRules: '',
  pairs: [],
  timeframes: [],
  isActive: true,
};

export default function StrategyManager() {
  const { strategies, loading, addStrategy, updateStrategy, deleteStrategy } = useStrategies();
  const { allTimeframes, addTimeframe, removeTimeframe } = useUserTimeframes();
  const [formOpen, setFormOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const openNew = () => {
    setEditingStrategy(null);
    setForm(defaultForm);
    setFormOpen(true);
  };

  const openEdit = (strategy) => {
    setEditingStrategy(strategy);
    setForm({
      name: strategy.name || '',
      description: strategy.description || '',
      entryRules: strategy.entryRules || '',
      exitRules: strategy.exitRules || '',
      pairs: strategy.pairs || [],
      timeframes: strategy.timeframes || [],
      isActive: strategy.isActive !== false,
    });
    setFormOpen(true);
  };

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const toggleArray = (field, value) =>
    setForm((f) => ({
      ...f,
      [field]: f[field].includes(value) ? f[field].filter((v) => v !== value) : [...f[field], value],
    }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('נא להזין שם אסטרטגיה');
      return;
    }
    setSaving(true);
    try {
      if (editingStrategy) {
        await updateStrategy(editingStrategy.id, form);
        toast.success('האסטרטגיה עודכנה');
      } else {
        await addStrategy(form);
        toast.success('האסטרטגיה נוצרה');
      }
      setFormOpen(false);
    } catch {
      toast.error('שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteStrategy(deleteTarget.id);
      toast.success('האסטרטגיה נמחקה');
      setDeleteTarget(null);
    } catch {
      toast.error('שגיאה במחיקה');
    }
  };

  const handleToggleActive = async (strategy) => {
    try {
      await updateStrategy(strategy.id, { isActive: !strategy.isActive });
      toast.success(strategy.isActive ? 'האסטרטגיה הושבתה' : 'האסטרטגיה הופעלה');
    } catch {
      toast.error('שגיאה בעדכון');
    }
  };

  if (loading) return <LoadingSpinner />;

  const inputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors';
  const labelClass = 'block text-xs text-text-muted mb-1';

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-text-primary">אסטרטגיות</h1>
        <button onClick={openNew} className="flex items-center gap-2 bg-accent-primary text-bg-primary font-semibold px-2.5 py-1.5 md:px-4 md:py-2 rounded-lg hover:bg-accent-hover transition-colors cursor-pointer text-xs md:text-sm">
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">אסטרטגיה חדשה</span>
        </button>
      </div>

      {strategies.length === 0 ? (
        <EmptyState
          icon={Target}
          title="אין אסטרטגיות עדיין"
          description="הגדר את אסטרטגיות המסחר שלך ועקוב אחר הביצועים שלהן"
          action={
            <button onClick={openNew} className="mt-2 px-4 py-2 bg-accent-primary text-bg-primary font-semibold rounded-lg hover:bg-accent-hover transition-colors cursor-pointer">
              צור אסטרטגיה ראשונה
            </button>
          }
        />
      ) : (
        <motion.div className="space-y-3" variants={staggerContainer} initial="initial" animate="animate">
          {strategies.map((strategy) => {
            const isExpanded = expandedId === strategy.id;
            return (
              <motion.div key={strategy.id} variants={staggerItem} className="bg-bg-secondary border border-border-primary rounded-xl overflow-hidden">
                {/* Header */}
                <div
                  className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-bg-tertiary/50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : strategy.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-text-primary truncate">{strategy.name}</h3>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${strategy.isActive !== false ? 'bg-profit/15 text-profit' : 'bg-text-muted/15 text-text-muted'}`}>
                        {strategy.isActive !== false ? 'פעילה' : 'מושבתת'}
                      </span>
                    </div>
                    {strategy.description && (
                      <p className="text-xs text-text-muted truncate">{strategy.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); openEdit(strategy); }} className="p-1.5 rounded-lg text-text-muted hover:text-accent-primary hover:bg-bg-tertiary transition-colors cursor-pointer">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(strategy); }} className="p-1.5 rounded-lg text-text-muted hover:text-loss hover:bg-bg-tertiary transition-colors cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-5 pb-4 border-t border-border-primary pt-4 space-y-3">
                    {strategy.entryRules && (
                      <div>
                        <p className="text-xs text-text-muted mb-1">כללי כניסה</p>
                        <p className="text-sm text-text-secondary whitespace-pre-wrap">{strategy.entryRules}</p>
                      </div>
                    )}
                    {strategy.exitRules && (
                      <div>
                        <p className="text-xs text-text-muted mb-1">כללי יציאה</p>
                        <p className="text-sm text-text-secondary whitespace-pre-wrap">{strategy.exitRules}</p>
                      </div>
                    )}
                    {strategy.pairs?.length > 0 && (
                      <div>
                        <p className="text-xs text-text-muted mb-1">זוגות</p>
                        <div className="flex flex-wrap gap-1.5">
                          {strategy.pairs.map((p) => (
                            <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent-primary/10 text-accent-primary text-[11px] font-medium"><CoinIcon pair={p} className="w-3.5 h-3.5" />{p}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {strategy.timeframes?.length > 0 && (
                      <div>
                        <p className="text-xs text-text-muted mb-1">טווחי זמן</p>
                        <div className="flex flex-wrap gap-1.5">
                          {strategy.timeframes.map((t) => (
                            <span key={t} className="px-2 py-0.5 rounded bg-bg-tertiary border border-border-primary text-[11px] text-text-muted font-medium">{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-[10px] text-text-muted">{formatRelativeTime(strategy.createdAt)}</span>
                      <button
                        onClick={() => handleToggleActive(strategy)}
                        className={`text-xs px-3 py-1 rounded-lg transition-colors cursor-pointer ${strategy.isActive !== false ? 'bg-text-muted/10 text-text-muted hover:bg-text-muted/20' : 'bg-profit/10 text-profit hover:bg-profit/20'}`}
                      >
                        {strategy.isActive !== false ? 'השבת' : 'הפעל'}
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Form Modal */}
      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editingStrategy ? 'עריכת אסטרטגיה' : 'אסטרטגיה חדשה'} maxWidth="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>שם האסטרטגיה</label>
            <input value={form.name} onChange={(e) => update('name', e.target.value)} className={inputClass} placeholder="לדוגמה: SOS - Sign of Strength" required />
          </div>

          <div>
            <label className={labelClass}>תיאור</label>
            <textarea value={form.description} onChange={(e) => update('description', e.target.value)} className={`${inputClass} h-16 resize-none`} placeholder="תיאור קצר של האסטרטגיה..." />
          </div>

          <div>
            <label className={labelClass}>כללי כניסה</label>
            <textarea value={form.entryRules} onChange={(e) => update('entryRules', e.target.value)} className={`${inputClass} h-24 resize-none`} placeholder="מתי נכנסים לעסקה? אילו תנאים צריכים להתקיים?" />
          </div>

          <div>
            <label className={labelClass}>כללי יציאה</label>
            <textarea value={form.exitRules} onChange={(e) => update('exitRules', e.target.value)} className={`${inputClass} h-24 resize-none`} placeholder="מתי יוצאים? איפה שמים SL/TP?" />
          </div>

          <div>
            <label className={labelClass}>זוגות</label>
            <div className="flex flex-wrap gap-2">
              {PAIRS.map((p) => (
                <button key={p} type="button" onClick={() => toggleArray('pairs', p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${form.pairs.includes(p) ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/30' : 'bg-bg-tertiary text-text-muted border border-border-primary'}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <TimeframeSelector
              label="טווחי זמן"
              value={form.timeframes}
              onChange={(val) => update('timeframes', val)}
              multi
              timeframes={allTimeframes}
              onAdd={addTimeframe}
              onRemove={removeTimeframe}
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button type="button" onClick={() => update('isActive', !form.isActive)}
              className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${form.isActive ? 'bg-profit' : 'bg-bg-tertiary border border-border-primary'}`}>
              <div className={`w-4 h-4 rounded-full bg-white transition-transform ${form.isActive ? '-translate-x-5' : '-translate-x-0.5'}`} />
            </button>
            <span className="text-sm text-text-secondary">אסטרטגיה פעילה</span>
          </div>

          <div className="flex gap-3 pt-4 border-t border-border-primary">
            <button type="button" onClick={() => setFormOpen(false)}
              className="flex-1 py-2.5 rounded-lg bg-bg-tertiary text-text-primary hover:bg-border-hover transition-colors cursor-pointer">
              ביטול
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-lg bg-accent-primary text-bg-primary font-semibold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50">
              {saving ? 'שומר...' : editingStrategy ? 'עדכן אסטרטגיה' : 'צור אסטרטגיה'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="מחיקת אסטרטגיה" message={`למחוק את "${deleteTarget?.name}"? לא ניתן לבטל פעולה זו.`} />
    </motion.div>
  );
}
