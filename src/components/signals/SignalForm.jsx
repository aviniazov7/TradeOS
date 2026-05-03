import { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import Modal from '../shared/Modal';
import PairSearch from '../journal/PairSearch';
import TimeframeSelector from '../shared/TimeframeSelector';
import { useUserTimeframes } from '../../hooks/useUserTimeframes';

const defaultForm = {
  pair: '',
  direction: 'long',
  timeframe: '',
  entryPrice: '',
  stopLoss: '',
  tps: [''],
  status: 'waiting',
  notes: '',
};

export default function SignalForm({ isOpen, onClose, signal, onSave }) {
  const [form, setForm] = useState(defaultForm);
  const { allTimeframes, addTimeframe, removeTimeframe } = useUserTimeframes();

  useEffect(() => {
    if (signal) {
      setForm({
        pair: signal.pair || '',
        direction: signal.direction || 'long',
        timeframe: signal.timeframe || '',
        entryPrice: signal.entryPrice ?? '',
        stopLoss: signal.stopLoss ?? '',
        tps: signal.tps?.length ? signal.tps.map(String) : [''],
        status: signal.status || 'waiting',
        notes: signal.notes || '',
      });
    } else {
      setForm(defaultForm);
    }
  }, [signal, isOpen]);

  const update = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const addTp = () => setForm((f) => ({ ...f, tps: [...f.tps, ''] }));
  const removeTp = (i) => setForm((f) => ({ ...f, tps: f.tps.filter((_, idx) => idx !== i) }));
  const updateTp = (i, val) => setForm((f) => {
    const tps = [...f.tps];
    tps[i] = val;
    return { ...f, tps };
  });

  const handleSave = () => {
    if (!form.pair || !form.entryPrice || !form.stopLoss) return;
    onSave({
      pair: form.pair,
      direction: form.direction,
      timeframe: form.timeframe,
      entryPrice: parseFloat(form.entryPrice),
      stopLoss: parseFloat(form.stopLoss),
      tps: form.tps.map(Number).filter((v) => !isNaN(v) && v > 0),
      status: form.status,
      notes: form.notes,
    });
  };

  const inputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors';

  const canSave = form.pair && form.entryPrice && form.stopLoss;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={signal ? 'עריכת סיגנל' : 'סיגנל חדש'}
      maxWidth="max-w-lg"
    >
      <div className="space-y-3">
        {/* Pair + Timeframe */}
        <div className="grid grid-cols-2 gap-3">
          <PairSearch value={form.pair} onChange={(v) => update('pair', v)} label="זוג מסחר" />
          <TimeframeSelector
            label="טווח זמן"
            value={form.timeframe}
            onChange={(v) => update('timeframe', v)}
            timeframes={allTimeframes}
            onAdd={addTimeframe}
            onRemove={removeTimeframe}
          />
        </div>

        {/* Direction */}
        <div>
          <label className="block text-xs text-text-muted mb-1">כיוון</label>
          <div className="flex gap-2">
            {['long', 'short'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => update('direction', d)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer border ${
                  form.direction === d
                    ? d === 'long'
                      ? 'bg-profit/20 border-profit text-profit'
                      : 'bg-loss/20 border-loss text-loss'
                    : 'bg-bg-tertiary border-border-primary text-text-muted hover:text-text-primary'
                }`}
              >
                {d === 'long' ? 'לונג ↑' : 'שורט ↓'}
              </button>
            ))}
          </div>
        </div>

        {/* Entry + Stop */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">מחיר כניסה</label>
            <input
              type="number"
              inputMode="decimal"
              value={form.entryPrice}
              onChange={(e) => update('entryPrice', e.target.value)}
              className={inputClass}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">סטופ לוס</label>
            <input
              type="number"
              inputMode="decimal"
              value={form.stopLoss}
              onChange={(e) => update('stopLoss', e.target.value)}
              className={inputClass}
              placeholder="0.00"
            />
          </div>
        </div>

        {/* TPs */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-text-muted">יעדי רווח (TP)</label>
            <button
              type="button"
              onClick={addTp}
              className="flex items-center gap-1 text-xs text-accent-primary hover:text-accent-hover transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3" /> הוסף TP
            </button>
          </div>
          <div className="space-y-2">
            {form.tps.map((tp, i) => (
              <div key={i} className="flex gap-2 items-center">
                <span className="text-xs text-profit font-medium w-8 shrink-0">TP{i + 1}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={tp}
                  onChange={(e) => updateTp(i, e.target.value)}
                  className={`${inputClass} flex-1`}
                  placeholder="0.00"
                />
                {form.tps.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTp(i)}
                    className="p-1.5 text-text-muted hover:text-loss transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="block text-xs text-text-muted mb-1">סטטוס</label>
          <div className="flex gap-2">
            {[
              { value: 'waiting', label: 'ממתין', color: 'text-text-muted border-border-primary bg-bg-tertiary' },
              { value: 'active', label: 'פעיל', color: 'text-accent-primary border-accent-primary bg-accent-primary/10' },
            ].map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => update('status', s.value)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer border ${
                  form.status === s.value ? s.color : 'bg-bg-tertiary border-border-primary text-text-muted hover:text-text-primary'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs text-text-muted mb-1">הערות</label>
          <textarea
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            className={`${inputClass} h-16 resize-none`}
            placeholder="ניתוח, סיבת הכניסה..."
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-lg bg-bg-tertiary text-text-primary text-sm hover:bg-border-primary transition-colors cursor-pointer"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="flex-1 py-2 rounded-lg bg-accent-primary text-bg-primary text-sm font-semibold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-40"
          >
            {signal ? 'עדכן' : 'הוסף סיגנל'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
