import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, TrendingUp, TrendingDown } from 'lucide-react';
import Modal from '../shared/Modal';
import { useJournalContext } from '../../contexts/JournalContext';
import { formatNumber, LRM } from '../../utils/formatters';
import { calculatePosition } from '../../utils/positionMath';
import { TRADE_PREFILL_KEY, tradePrefillFromCalculator } from '../../utils/tradeFormHelpers';
import toast from 'react-hot-toast';

const inputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors text-right';
const labelClass = 'block text-xs text-text-muted mb-1';

export default function PositionCalculator({ isOpen, onClose }) {
  const { activeJournal } = useJournalContext();
  const navigate = useNavigate();
  const [copiedKey, setCopiedKey] = useState(null);

  const [form, setForm] = useState({
    direction: 'long',
    balance: '',
    riskType: 'percent',
    riskValue: '',
    entryPrice: '',
    stopLoss: '',
    leverage: '10',
    targetPrice: '',
  });

  // Auto-fill from active journal on open
  useEffect(() => {
    if (isOpen && activeJournal) {
      setForm((f) => ({
        ...f,
        balance: activeJournal.initialBalance || '',
        riskType: activeJournal.riskType || 'percent',
        riskValue: activeJournal.riskValue || '',
      }));
    }
  }, [isOpen, activeJournal]);

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  // Real-time calculations. A stop on the wrong side is an error object,
  // not a sized position — |entry − stop| used to print a positive R:R.
  const results = useMemo(() => calculatePosition(form), [form]);

  const copyValue = (key, val) => {
    navigator.clipboard.writeText(String(val));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const useInNewTrade = () => {
    const seed = tradePrefillFromCalculator(form, results);
    if (!seed) return;
    try { sessionStorage.setItem(TRADE_PREFILL_KEY, JSON.stringify(seed)); } catch { /* private mode */ }
    onClose();
    navigate('/journal?new=1');
  };

  const copyAll = () => {
    if (!results || results.error) return;
    const lines = [
      `גודל פוזיציה: $${formatNumber(results.positionSize)}`,
      `כמות: ${results.quantity.toFixed(6)}`,
      `סיכון: $${formatNumber(results.riskAmount)}`,
      `מרג׳ין: $${formatNumber(results.margin)}`,
      `מרחק SL: ${results.slDistancePercent.toFixed(2)}%`,
      results.rrRatio != null ? `R:R: 1:${results.rrRatio.toFixed(2)}` : null,
      results.potentialProfit != null ? `רווח פוטנציאלי: $${formatNumber(results.potentialProfit)}` : null,
      `הפסד פוטנציאלי: $${formatNumber(results.potentialLoss)}`,
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(lines);
    toast.success('הועתק!');
  };

  const resultRows = results && !results.error ? [
    { key: 'risk', label: 'סכום סיכון', value: `$${formatNumber(results.riskAmount)}`, color: 'text-loss', raw: results.riskAmount.toFixed(2) },
    { key: 'size', label: 'גודל פוזיציה', value: `$${formatNumber(results.positionSize)}`, color: 'text-accent-primary', raw: results.positionSize.toFixed(2) },
    { key: 'qty', label: 'כמות', value: results.quantity.toFixed(6), color: 'text-text-primary', raw: results.quantity.toFixed(6) },
    { key: 'margin', label: 'מרג׳ין נדרש', value: `$${formatNumber(results.margin)}`, color: 'text-text-primary', raw: results.margin.toFixed(2) },
    { key: 'sl', label: 'מרחק SL', value: `${results.slDistancePercent.toFixed(2)}%`, color: 'text-text-primary', raw: results.slDistancePercent.toFixed(2) },
    ...(results.riskPercent != null ? [{ key: 'riskPct', label: '% מהחשבון בסיכון', value: `${results.riskPercent.toFixed(2)}%`, color: results.riskPercent > 3 ? 'text-loss' : 'text-text-primary', raw: results.riskPercent.toFixed(2) }] : []),
    ...(results.rrRatio != null ? [{ key: 'rr', label: 'R:R', value: `1:${results.rrRatio.toFixed(2)}`, color: results.rrRatio >= 2 ? 'text-profit' : results.rrRatio >= 1 ? 'text-amber-500' : 'text-loss', raw: results.rrRatio.toFixed(2) }] : []),
    ...(results.potentialProfit != null ? [{ key: 'profit', label: 'רווח פוטנציאלי', value: `${LRM}${results.potentialProfit >= 0 ? '+' : ''}$${formatNumber(results.potentialProfit)}`, color: results.potentialProfit >= 0 ? 'text-profit' : 'text-loss', raw: results.potentialProfit.toFixed(2) }] : []),
    { key: 'loss', label: 'הפסד פוטנציאלי', value: `${LRM}-$${formatNumber(Math.abs(results.potentialLoss))}`, color: 'text-loss', raw: results.potentialLoss.toFixed(2) },
  ] : [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="מחשבון פוזיציה" maxWidth="max-w-md">
      <div className="space-y-3">
        {/* Direction */}
        <div>
          <label className={labelClass}>כיוון</label>
          <div className="flex gap-1">
            {['long', 'short'].map((d) => (
              <button key={d} type="button" onClick={() => update('direction', d)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  form.direction === d
                    ? d === 'long' ? 'bg-long/15 text-long border border-long/30' : 'bg-short/15 text-short border border-short/30'
                    : 'bg-bg-tertiary text-text-muted border border-transparent'
                }`}>
                {d === 'long' ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {d === 'long' ? 'Long' : 'Short'}
              </button>
            ))}
          </div>
        </div>

        {/* Balance + Risk Type */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>יתרת חשבון ($)</label>
            <input type="number" step="any" value={form.balance} onChange={(e) => update('balance', e.target.value)} className={inputClass} placeholder="10,000" />
          </div>
          <div>
            <label className={labelClass}>סוג סיכון</label>
            <div className="flex gap-1">
              {[{ key: 'percent', label: '%' }, { key: 'fixed', label: '$' }].map((t) => (
                <button key={t.key} type="button" onClick={() => update('riskType', t.key)}
                  className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    form.riskType === t.key
                      ? 'bg-accent-primary/15 text-accent-primary border border-accent-primary/30'
                      : 'bg-bg-tertiary text-text-muted border border-transparent'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Risk Value */}
        <div>
          <label className={labelClass}>
            {form.riskType === 'percent' ? 'אחוז סיכון (%)' : 'סכום סיכון ($)'}
          </label>
          <input type="number" step="any" value={form.riskValue} onChange={(e) => update('riskValue', e.target.value)} className={inputClass}
            placeholder={form.riskType === 'percent' ? '1' : '50'} />
        </div>

        {/* Entry + SL */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>מחיר כניסה</label>
            <input type="number" step="any" value={form.entryPrice} onChange={(e) => update('entryPrice', e.target.value)} className={inputClass} placeholder="0.00" />
          </div>
          <div>
            <label className={labelClass}>סטופ לוס</label>
            <input type="number" step="any" value={form.stopLoss} onChange={(e) => update('stopLoss', e.target.value)}
              aria-invalid={results?.error ? true : undefined}
              className={`${inputClass} ${results?.error ? 'border-loss' : ''}`} placeholder="0.00" />
          </div>
        </div>
        {results?.error && (
          <p role="alert" className="text-xs text-loss">{results.error}</p>
        )}

        {/* Leverage + Target */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>מינוף</label>
            <input type="number" value={form.leverage} onChange={(e) => update('leverage', e.target.value)} className={inputClass} placeholder="10" />
          </div>
          <div>
            <label className={labelClass}>מחיר יעד (אופציונלי)</label>
            <input type="number" step="any" value={form.targetPrice} onChange={(e) => update('targetPrice', e.target.value)} className={inputClass} placeholder="0.00" />
          </div>
        </div>

        {/* Results */}
        {resultRows.length > 0 && !results?.error && (
          <div className="bg-bg-tertiary rounded-xl p-3 space-y-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-text-secondary">תוצאות</span>
              <button onClick={copyAll}
                className="flex items-center gap-1 text-[10px] text-text-muted hover:text-accent-primary transition-colors cursor-pointer">
                <Copy className="w-3 h-3" /> העתק הכל
              </button>
            </div>
            {resultRows.map((row) => (
              <div key={row.key} className="flex items-center justify-between py-1.5 border-b border-border-primary/30 last:border-0">
                <span className="text-xs text-text-muted">{row.label}</span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm font-semibold ${row.color}`}>{row.value}</span>
                  <button onClick={() => copyValue(row.key, row.raw)}
                    className="p-0.5 text-text-muted/40 hover:text-text-muted transition-colors cursor-pointer">
                    {copiedKey === row.key ? <Check className="w-3 h-3 text-profit" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {resultRows.length > 0 && !results?.error && (
          <button type="button" onClick={useInNewTrade}
            className="w-full h-10 rounded-xl bg-accent-primary text-black text-sm font-semibold hover:bg-accent-hover transition-colors cursor-pointer">
            פתח עסקה חדשה עם המספרים האלה
          </button>
        )}
      </div>
    </Modal>
  );
}
