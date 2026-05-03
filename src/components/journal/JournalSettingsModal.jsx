import { useState, useEffect } from 'react';
import { Pencil, Trash2, Archive } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../shared/Modal';
import ConfirmDialog from '../shared/ConfirmDialog';
import ExchangeSearch from '../shared/ExchangeSearch';
import { useJournalContext } from '../../contexts/JournalContext';
import { EXCHANGES } from '../../utils/constants';

export default function JournalSettingsModal({ isOpen, onClose, onArchive }) {
  const { journals, activeJournal, activeJournalId, updateJournal, deleteJournal, archiveJournal } = useJournalContext();
  const [form, setForm] = useState({ name: '', exchange: '', initialBalance: '', currency: 'USDT', description: '', riskType: 'percent', riskValue: '' });
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  useEffect(() => {
    if (activeJournal && isOpen) {
      setForm({
        name: activeJournal.name || '',
        exchange: activeJournal.exchange || '',
        initialBalance: activeJournal.initialBalance || '',
        currency: activeJournal.currency || 'USDT',
        description: activeJournal.description || '',
        riskType: activeJournal.riskType || 'percent',
        riskValue: activeJournal.riskValue || '',
      });
    }
  }, [activeJournal, isOpen]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await updateJournal(activeJournalId, {
        name: form.name.trim(),
        exchange: form.exchange || '',
        initialBalance: parseFloat(form.initialBalance) || 0,
        currency: form.currency,
        description: form.description.trim(),
        riskType: form.riskType,
        riskValue: parseFloat(form.riskValue) || 0,
      });
      toast.success('היומן עודכן');
      onClose();
    } catch (err) {
      toast.error(err.code === 'permission-denied' ? 'אין הרשאה לעדכן' : 'שגיאה בעדכון היומן — נסה שוב');
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
    } catch (err) {
      toast.error(err.code === 'permission-denied' ? 'אין הרשאה למחוק' : 'שגיאה במחיקת היומן — נסה שוב');
    }
  };

  const handleArchive = async () => {
    try {
      const name = activeJournal?.name;
      setArchiveOpen(false);
      onClose();
      onArchive?.(name);
      await archiveJournal(activeJournalId);
    } catch (err) {
      toast.error(err.code === 'permission-denied' ? 'אין הרשאה' : 'שגיאה בהעברה לארכיון — נסה שוב');
    }
  };

  const inputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors text-right';
  const labelClass = 'block text-xs text-text-muted mb-1';

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="הגדרות יומן" maxWidth="max-w-md">
        <form onSubmit={handleSave} className="space-y-3">
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
              className="flex-1 py-2.5 rounded-lg bg-bg-tertiary text-text-primary hover:bg-border-hover transition-colors cursor-pointer text-sm">
              ביטול
            </button>
            <button type="submit" disabled={saving || !form.name.trim()}
              className="flex-1 py-2.5 rounded-lg bg-accent-primary text-black font-semibold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50 text-sm">
              {saving ? 'שומר...' : 'שמור שינויים'}
            </button>
          </div>
        </form>

        <div className="mt-4 pt-4 border-t border-border-primary space-y-2">
          <button
            onClick={() => setArchiveOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-amber-500 hover:bg-amber-500/10 transition-colors cursor-pointer text-sm"
          >
            <Archive className="w-4 h-4" />
            העברה לארכיון
          </button>
          {journals.length > 1 && (
            <button
              onClick={() => setDeleteOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-loss hover:bg-loss/10 transition-colors cursor-pointer text-sm"
            >
              <Trash2 className="w-4 h-4" />
              מחיקת יומן
            </button>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={handleArchive}
        title="העברה לארכיון"
        message={`להעביר את היומן "${activeJournal?.name}" לארכיון? תוכל לשחזר בכל עת.`}
        confirmText="העבר לארכיון"
        confirmColor="amber"
      />

      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="מחיקת יומן"
        message={`למחוק את היומן "${activeJournal?.name}"? העסקאות שבו לא יימחקו.`}
      />
    </>
  );
}
