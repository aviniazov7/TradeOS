import { useState, useEffect } from 'react';
import Modal from '../shared/Modal';
import ExchangeSearch from '../shared/ExchangeSearch';
import { EXCHANGES } from '../../utils/constants';

const defaultForm = { name: '', exchange: '', initialBalance: '', currency: 'USDT', description: '', riskType: 'percent', riskValue: '' };

export default function JournalFormModal({ isOpen, onClose, journal = null, onSave }) {
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (journal) {
      setForm({
        name: journal.name || '',
        exchange: journal.exchange || '',
        initialBalance: journal.initialBalance || '',
        currency: journal.currency || 'USDT',
        description: journal.description || '',
        riskType: journal.riskType || 'percent',
        riskValue: journal.riskValue || '',
      });
    } else {
      setForm(defaultForm);
    }
  }, [journal, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        exchange: form.exchange || '',
        initialBalance: parseFloat(form.initialBalance) || 0,
        currency: form.currency,
        description: form.description.trim(),
        riskType: form.riskType,
        riskValue: parseFloat(form.riskValue) || 0,
      });
      onClose();
    } catch {
      // error handled by parent
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors text-right';
  const labelClass = 'block text-xs text-text-muted mb-1';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={journal ? 'עריכת יומן' : 'יומן חדש'} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className={labelClass}>שם היומן</label>
          <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className={inputClass} placeholder="שם היומן שלך" />
        </div>
        <ExchangeSearch
          value={form.exchange}
          onChange={(val) => setForm((f) => ({ ...f, exchange: val }))}
        />
        <div>
          <label className={labelClass}>יתרה התחלתית ($)</label>
          <input type="number" step="any" value={form.initialBalance}
            onChange={(e) => setForm((f) => ({ ...f, initialBalance: e.target.value }))}
            className={inputClass} placeholder="1000" />
        </div>
        <div>
          <label className={labelClass}>תיאור (אופציונלי)</label>
          <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className={`${inputClass} h-16 resize-none`} placeholder="תיאור קצר של היומן..." />
        </div>
        <div>
          <label className={labelClass}>סוג סיכון</label>
          <div className="flex rounded-lg overflow-hidden border border-border-primary mb-2">
            <button type="button" onClick={() => setForm((f) => ({ ...f, riskType: 'percent' }))}
              className={`flex-1 py-2 text-xs font-medium transition-colors cursor-pointer ${
                form.riskType === 'percent' ? 'bg-accent-primary text-bg-primary' : 'bg-bg-tertiary text-text-muted hover:text-text-primary'
              }`}>
              % אחוז מהתיק
            </button>
            <button type="button" onClick={() => setForm((f) => ({ ...f, riskType: 'fixed' }))}
              className={`flex-1 py-2 text-xs font-medium transition-colors cursor-pointer ${
                form.riskType === 'fixed' ? 'bg-accent-primary text-bg-primary' : 'bg-bg-tertiary text-text-muted hover:text-text-primary'
              }`}>
              $ סכום קבוע
            </button>
          </div>
          <input type="number" step="any" value={form.riskValue}
            onChange={(e) => setForm((f) => ({ ...f, riskValue: e.target.value }))}
            className={inputClass}
            placeholder={form.riskType === 'percent' ? 'למשל: 1' : 'למשל: 50'} />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-lg bg-bg-tertiary text-text-primary hover:bg-border-hover transition-colors cursor-pointer">
            ביטול
          </button>
          <button type="submit" disabled={saving || !form.name.trim()}
            className="flex-1 py-2.5 rounded-lg bg-accent-primary text-black font-semibold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50">
            {saving ? 'שומר...' : journal ? 'עדכן' : 'צור יומן'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
