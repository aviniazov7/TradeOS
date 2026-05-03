import { useState, useEffect } from 'react';
import Modal from '../shared/Modal';
import SelectDropdown from '../shared/SelectDropdown';
import CoinSearch from './CoinSearch';
import { COINS, DCA_FREQUENCIES, DCA_FREQUENCY_LABELS } from '../../utils/constants';

const frequencyOptions = DCA_FREQUENCIES.map((f) => ({ value: f, label: DCA_FREQUENCY_LABELS[f] }));

const inputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors';
const labelClass = 'block text-xs text-text-muted mb-1';

const defaultForm = {
  selectedCoin: COINS[0], // { symbol, name, coingeckoId }
  frequency: 'weekly',
  amountPerEntry: '',
  targetPrice: '',
  notes: '',
  status: 'active',
};

export default function DCAForm({ isOpen, onClose, onSave, plan }) {
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (plan) {
        const coinMatch = COINS.find((c) => c.symbol === plan.coin);
        setForm({
          selectedCoin: coinMatch || { symbol: plan.coin, name: plan.coin, coingeckoId: plan.coingeckoId || null },
          frequency: plan.frequency || 'weekly',
          amountPerEntry: plan.amountPerEntry || '',
          targetPrice: plan.targetPrice || '',
          notes: plan.notes || '',
          status: plan.status || 'active',
        });
      } else {
        setForm(defaultForm);
      }
    }
  }, [isOpen, plan]);

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amountPerEntry || !form.selectedCoin) return;
    setSaving(true);
    try {
      await onSave({
        coin: form.selectedCoin.symbol,
        coingeckoId: form.selectedCoin.coingeckoId || null,
        frequency: form.frequency,
        amountPerEntry: parseFloat(form.amountPerEntry),
        targetPrice: form.targetPrice ? parseFloat(form.targetPrice) : null,
        notes: form.notes,
        status: form.status,
      });
      onClose();
    } catch (err) {
      console.error('Save DCA plan failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const titleNode = (
    <span className="flex items-center gap-3 flex-wrap">
      <span>{plan ? 'עריכת תוכנית DCA' : 'תוכנית DCA חדשה'}</span>
      <span className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => update('status', form.status === 'active' ? 'paused' : 'active')}
          className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${form.status === 'active' ? 'bg-profit' : 'bg-bg-tertiary border border-border-primary'}`}
        >
          <div className={`w-4 h-4 rounded-full bg-white transition-transform ${form.status === 'active' ? '-translate-x-5' : '-translate-x-0.5'}`} />
        </button>
        <span className="text-xs font-normal text-text-secondary">תוכנית פעילה</span>
      </span>
    </span>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={titleNode} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <CoinSearch
            value={form.selectedCoin}
            onChange={(coin) => update('selectedCoin', coin || COINS[0])}
          />
          <SelectDropdown
            label="תדירות"
            value={form.frequency}
            onChange={(val) => update('frequency', val)}
            options={frequencyOptions}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>סכום לרכישה ($)</label>
            <input type="number" min="0" step="any" value={form.amountPerEntry}
              onChange={(e) => update('amountPerEntry', e.target.value)}
              className={inputClass} placeholder="100" required />
          </div>
          <div>
            <label className={labelClass}>מחיר יעד (אופציונלי)</label>
            <input type="number" min="0" step="any" value={form.targetPrice}
              onChange={(e) => update('targetPrice', e.target.value)}
              className={inputClass} placeholder="50000" />
          </div>
        </div>

        <div>
          <label className={labelClass}>הערות</label>
          <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)}
            className={`${inputClass} h-20 resize-none`} placeholder="הערות לתוכנית..." />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-lg bg-bg-tertiary text-text-primary text-sm hover:bg-border-hover transition-colors cursor-pointer">
            ביטול
          </button>
          <button type="submit" disabled={saving}
            className="flex-1 py-2.5 rounded-lg bg-accent-primary text-bg-primary text-sm font-semibold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50">
            {saving ? 'שומר...' : plan ? 'עדכן תוכנית' : 'צור תוכנית'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
