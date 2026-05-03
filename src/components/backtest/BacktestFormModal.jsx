import { useState, useEffect } from 'react';
import Modal from '../shared/Modal';

const defaultForm = { name: '', description: '' };

export default function BacktestFormModal({ isOpen, onClose, journal = null, onSave }) {
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (journal) {
      setForm({
        name: journal.name || '',
        description: journal.description || '',
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
        description: form.description.trim(),
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
    <Modal isOpen={isOpen} onClose={onClose} title={journal ? 'עריכת יומן בקטסט' : 'יומן בקטסט חדש'} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className={labelClass}>שם היומן</label>
          <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className={inputClass} placeholder="למשל: אסטרטגיית Wyckoff" />
        </div>
        <div>
          <label className={labelClass}>תיאור (אופציונלי)</label>
          <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className={`${inputClass} h-16 resize-none`} placeholder="תיאור קצר של היומן..." />
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
