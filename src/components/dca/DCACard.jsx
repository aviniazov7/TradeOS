import { useState, useMemo } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { Plus, Pencil, Trash2, ChevronDown } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import toast from 'react-hot-toast';
import { COINS, DCA_FREQUENCY_LABELS, DCA_STATUS_LABELS } from '../../utils/constants';
import { calculateDCAAvgPrice, localDayKey } from '../../utils/calculations';
import { formatNumber, formatPrice, formatDate, formatCurrency, formatPercent } from '../../utils/formatters';
import { staggerItem, cardHover } from '../../utils/animations';

// The form keeps the purchase day as a LOCAL 'YYYY-MM-DD' key. A UTC key
// (toISOString) put a purchase entered 00:00-03:00 Israel time - or the local
// midnight the date picker hands back - on the previous day.
const todayKey = () => localDayKey(new Date());
// 'YYYY-MM-DD' -> local Date at noon (noon keeps the day stable even if the
// timestamp is later read in another timezone). null for an empty/bad key.
function dayKeyToDate(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

const miniInputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent-primary transition-colors';

export default function DCACard({ plan, onAddEntry, onEdit, onDelete, currentPrice }) {
  const [expanded, setExpanded] = useState(false);
  const [entryFormOpen, setEntryFormOpen] = useState(false);
  const [entryForm, setEntryForm] = useState({ date: todayKey(), amount: '', price: '' });
  const [saving, setSaving] = useState(false);

  const coinInfo = COINS.find((c) => c.symbol === plan.coin) || { symbol: plan.coin, name: plan.coin };
  const entries = plan.entries || [];
  const entryCount = entries.length;

  const coinsPreview = entryForm.amount && entryForm.price && parseFloat(entryForm.price) > 0
    ? parseFloat(entryForm.amount) / parseFloat(entryForm.price)
    : 0;

  const newAvgPreview = useMemo(() => {
    if (!coinsPreview || !entryForm.amount) return null;
    const newEntry = { amount: parseFloat(entryForm.amount), coins: coinsPreview };
    return calculateDCAAvgPrice([...entries, newEntry]);
  }, [entryForm.amount, entryForm.price, entries, coinsPreview]);

  const handleAddEntry = async (e) => {
    e.preventDefault();
    if (!entryForm.amount || !entryForm.price || parseFloat(entryForm.price) === 0) return;
    const entryDate = dayKeyToDate(entryForm.date);
    if (!entryDate) {
      toast.error('בחר תאריך רכישה');
      return;
    }
    setSaving(true);
    try {
      const entry = {
        date: entryDate,
        amount: parseFloat(entryForm.amount),
        price: parseFloat(entryForm.price),
        coins: parseFloat(entryForm.amount) / parseFloat(entryForm.price),
      };
      await onAddEntry(plan.id, entry);
      toast.success('הרכישה נוספה');
      setEntryFormOpen(false);
      setEntryForm({ date: todayKey(), amount: '', price: '' });
    } catch (err) {
      console.error('Add entry failed:', err);
      toast.error('שגיאה בהוספת רכישה');
    } finally {
      setSaving(false);
    }
  };

  const statusColor = plan.status === 'active' ? 'text-profit' : plan.status === 'paused' ? 'text-breakeven' : 'text-text-muted';
  const statusBgColor = plan.status === 'active' ? 'bg-profit' : plan.status === 'paused' ? 'bg-breakeven' : 'bg-text-muted';

  return (
    <m.div variants={staggerItem} whileHover={cardHover}
      className="bg-bg-secondary border border-border-primary rounded-xl p-5 transition-colors">

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-text-primary">{coinInfo.symbol}</span>
          <span className="text-xs text-text-muted">{coinInfo.name}</span>
        </div>
        <span className={`flex items-center gap-1.5 text-xs font-medium ${statusColor}`}>
          <span className={`w-2 h-2 rounded-full ${statusBgColor}`} />
          {DCA_STATUS_LABELS[plan.status] || plan.status}
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <span className="text-[11px] text-text-muted block">סה״כ מושקע</span>
          <span className="text-sm font-bold text-text-primary">${formatNumber(plan.totalInvested || 0)}</span>
        </div>
        <div>
          <span className="text-[11px] text-text-muted block">כמות מטבעות</span>
          <span className="text-sm font-bold text-text-primary">{formatPrice(plan.totalCoins || 0)}</span>
        </div>
        <div>
          <span className="text-[11px] text-text-muted block">מחיר ממוצע</span>
          <span className="text-sm font-bold text-text-primary">${formatPrice(plan.avgPrice || 0)}</span>
        </div>
        <div>
          <span className="text-[11px] text-text-muted block">רכישות</span>
          <span className="text-sm font-bold text-text-primary">{entryCount}</span>
        </div>
      </div>

      {/* Live Price & P&L */}
      {currentPrice && (plan.totalCoins || 0) > 0 && (() => {
        const currentValue = plan.totalCoins * currentPrice;
        const pnl = currentValue - (plan.totalInvested || 0);
        const pnlPct = (plan.totalInvested || 0) > 0 ? (pnl / plan.totalInvested) * 100 : 0;
        return (
          <div className="grid grid-cols-3 gap-3 mb-4 bg-bg-tertiary rounded-lg p-3">
            <div>
              <span className="text-[11px] text-text-muted block">מחיר נוכחי</span>
              <span className="text-sm font-bold text-accent-primary">${formatPrice(currentPrice)}</span>
            </div>
            <div>
              <span className="text-[11px] text-text-muted block">שווי נוכחי</span>
              <span className="text-sm font-bold text-text-primary">${formatNumber(currentValue)}</span>
            </div>
            <div>
              <span className="text-[11px] text-text-muted block">רווח/הפסד</span>
              <span className={`text-sm font-bold ${pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                {formatCurrency(pnl)}
              </span>
              <span className={`text-[10px] block ${pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                {formatPercent(pnlPct)}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Info line */}
      <div className="flex items-center gap-2 text-xs text-text-muted mb-4 flex-wrap">
        <span>{DCA_FREQUENCY_LABELS[plan.frequency] || plan.frequency}</span>
        <span className="text-border-primary">|</span>
        <span>${formatNumber(plan.amountPerEntry || 0)} לרכישה</span>
        {plan.targetPrice && (
          <>
            <span className="text-border-primary">|</span>
            <span>יעד: ${formatPrice(plan.targetPrice)}</span>
          </>
        )}
      </div>

      {plan.notes && (
        <p className="text-xs text-text-muted mb-4 line-clamp-2">{plan.notes}</p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-3 border-t border-border-primary">
        <div className="flex items-center gap-3">
          <button onClick={() => setEntryFormOpen(!entryFormOpen)}
            className="flex items-center gap-1.5 text-xs text-accent-primary hover:text-accent-hover transition-colors cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> הוסף רכישה
          </button>
          {entryCount > 0 && (
            <button onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer">
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              רכישות ({entryCount})
            </button>
          )}
        </div>
        <div className="flex gap-1">
          <button onClick={() => onEdit(plan)}
            className="p-1.5 rounded-lg text-text-muted hover:text-accent-primary hover:bg-bg-tertiary transition-colors cursor-pointer">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={() => onDelete(plan)}
            className="p-1.5 rounded-lg text-text-muted hover:text-loss hover:bg-bg-tertiary transition-colors cursor-pointer">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Inline add entry form */}
      <AnimatePresence>
        {entryFormOpen && (
          <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <form onSubmit={handleAddEntry} className="bg-bg-tertiary rounded-lg p-3 space-y-3 mt-4">
              <h4 className="text-xs font-semibold text-text-secondary">רכישה חדשה - {plan.coin}</h4>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-text-muted mb-1">תאריך</label>
                  <DatePicker
                    selected={dayKeyToDate(entryForm.date)}
                    // Clearing the field hands back null - keep it empty
                    // (submit asks for a date) instead of crashing.
                    onChange={(date) => setEntryForm((f) => ({ ...f, date: date ? localDayKey(date) : '' }))}
                    dateFormat="dd/MM/yyyy"
                    locale="he"
                    placeholderText="בחר תאריך..."
                    className={miniInputClass}
                    wrapperClassName="w-full"
                    popperPlacement="bottom-start"
                    portalId="datepicker-portal"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-text-muted mb-1">סכום ($)</label>
                  <input type="number" min="0" step="any" value={entryForm.amount}
                    onChange={(e) => setEntryForm((f) => ({ ...f, amount: e.target.value }))}
                    className={miniInputClass} placeholder={String(plan.amountPerEntry || 100)} required />
                </div>
                <div>
                  <label className="block text-[10px] text-text-muted mb-1">מחיר</label>
                  <input type="number" min="0" step="any" value={entryForm.price}
                    onChange={(e) => setEntryForm((f) => ({ ...f, price: e.target.value }))}
                    className={miniInputClass} placeholder="97500" required />
                </div>
              </div>

              {coinsPreview > 0 && (
                <div className="text-xs text-text-muted bg-bg-secondary rounded-lg p-2 space-y-1">
                  <div className="flex justify-between">
                    <span>כמות שתיקנה:</span>
                    <span className="text-text-primary font-medium">{formatPrice(coinsPreview)} {plan.coin}</span>
                  </div>
                  {newAvgPreview !== null && (
                    <div className="flex justify-between">
                      <span>מחיר ממוצע חדש:</span>
                      <span className="text-accent-primary font-medium">${formatPrice(newAvgPreview)}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <button type="button" onClick={() => { setEntryFormOpen(false); setEntryForm({ date: todayKey(), amount: '', price: '' }); }}
                  className="flex-1 py-2 rounded-lg bg-bg-secondary text-text-primary text-xs hover:bg-border-hover transition-colors cursor-pointer">
                  ביטול
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2 rounded-lg bg-accent-primary text-bg-primary text-xs font-semibold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50">
                  {saving ? 'שומר...' : 'הוסף רכישה'}
                </button>
              </div>
            </form>
          </m.div>
        )}
      </AnimatePresence>

      {/* Expanded entries list */}
      <AnimatePresence>
        {expanded && entryCount > 0 && (
          <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="space-y-2 mt-4">
              {[...entries].reverse().map((entry, i) => (
                // Key by the entry's original index so prepending a new entry doesn't
                // reshuffle keys and mis-animate existing rows.
                <div key={entries.length - 1 - i} className="flex items-center justify-between bg-bg-tertiary rounded-lg px-3 py-2 text-xs">
                  <span className="text-text-muted">{formatDate(entry.date)}</span>
                  <span className="text-text-secondary">${formatNumber(entry.amount)}</span>
                  <span className="text-text-secondary">{formatPrice(entry.coins)} {plan.coin}</span>
                  <span className="text-text-muted">@${formatPrice(entry.price)}</span>
                </div>
              ))}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  );
}
