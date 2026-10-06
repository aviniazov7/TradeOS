import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, RefreshCw, Download, X } from 'lucide-react';
import { tradeExternalIds } from '../../utils/tradeIds';
import { LRM } from '../../utils/formatters';

// ── Sync modal ────────────────────────────────────────────────────────────────
function fmtPnl(v) {
  if (v == null) return '—';
  return `${LRM}${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)}`;
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function fmtPrice(p) {
  if (!p) return '—';
  if (p >= 1000) return `$${p.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  return `$${p.toFixed(4)}`;
}

export function SyncModal({ exchange, trades, onClose, onImport, existingExternalIds = new Set() }) {
  const [selected, setSelected] = useState(() => new Set(trades.map((_, i) => i)));
  const [importing, setImporting] = useState(false);
  const toggle = i => setSelected(p => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const toggleAll = () => setSelected(selected.size === trades.length ? new Set() : new Set(trades.map((_, i) => i)));
  const handleImport = async () => { setImporting(true); try { await onImport(trades.filter((_, i) => selected.has(i))); } finally { setImporting(false); } };
  // pnlFromExchange is GROSS (before fees); the imported journal row stores
  // net = gross - fees. Show the SAME net here so the preview matches both the
  // exchange's own P&L card and the row that will land in the journal.
  const netPnlOf = (t) => (typeof t.pnlFromExchange === 'number' ? t.pnlFromExchange - (t.fees || 0) : null);
  const totalPnl = trades.filter((t, i) => selected.has(i) && t.pnlFromExchange != null).reduce((s, t) => s + (netPnlOf(t) || 0), 0);
  const wins = trades.filter((t, i) => selected.has(i) && t.pnlFromExchange != null && netPnlOf(t) >= 0).length;
  const losses = trades.filter((t, i) => selected.has(i) && t.pnlFromExchange != null && netPnlOf(t) < 0).length;
  const allSelected = selected.size === trades.length;
  // A row is an UPDATE when ANY of its close-order ids is already journaled —
  // a Multi-TP row carries every close's id in externalIds, and only its
  // first-close externalId matches the previously imported document.
  const isUpdate = (t) => tradeExternalIds(t).some((id) => existingExternalIds.has(id));
  const updatesCount = trades.filter((t, i) => selected.has(i) && isUpdate(t)).length;
  const newCount = selected.size - updatesCount;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pb-[calc(env(safe-area-inset-bottom,0px)+84px)] sm:!pb-4"
      style={{ backdropFilter: 'blur(8px)' }}
      onClick={onClose}>
      <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className="rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[80vh] sm:max-h-[85vh] flex flex-col shadow-2xl"
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid rgba(0,191,255,0.22)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset',
        }}
        onClick={e => e.stopPropagation()}>
        {/* Header — single row, RTL: title+stats on right, X+toggle on left */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-primary">
          {/* First in DOM → RIGHT in RTL: title + stats */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-text-primary">עסקאות מ-{exchange}</p>
              <p className="text-xs text-text-muted">{trades.length} נמצאו — בחר מה לייבא</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0" dir="ltr">
              <span className="text-xs text-text-muted">{selected.size}/{trades.length}</span>
              <span className="text-xs font-semibold text-profit">{wins}W</span>
              <span className="text-xs font-semibold text-loss">{losses}L</span>
              <span className={`text-sm font-bold font-mono ${totalPnl >= 0 ? 'text-profit' : 'text-loss'}`}>{fmtPnl(totalPnl)}</span>
            </div>
          </div>
          {/* Last in DOM → LEFT in RTL: toggle + X */}
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={toggleAll} className="text-xs text-accent-primary hover:underline cursor-pointer whitespace-nowrap">
              {allSelected ? 'בטל הכל' : 'בחר הכל'}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-tertiary cursor-pointer">
              <X className="w-4 h-4 text-text-muted" />
            </button>
          </div>
        </div>
        {/* Trade list */}
        <div className="overflow-y-auto flex-1 divide-y divide-border-primary/30">
          {trades.map((trade, i) => {
            const sel = selected.has(i);
            // null/undefined PnL (open positions) must not satisfy >= 0 and
            // render green — show neutral until the exchange reports a number.
            let pnlClass = 'text-text-muted';
            const netVal = netPnlOf(trade);
            if (netVal !== null) {
              pnlClass = netVal >= 0 ? 'text-profit' : 'text-loss';
            }
            const isExisting = isUpdate(trade);
            return (
              <button key={i} onClick={() => toggle(i)}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-bg-tertiary transition-colors cursor-pointer text-right ${!sel ? 'opacity-35' : ''}`}>
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${sel ? 'bg-accent-primary border-accent-primary' : 'border-border-primary'}`}>
                  {sel && <Check className="w-2.5 h-2.5 text-bg-primary" strokeWidth={3} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-bold font-mono ${pnlClass}`} dir="ltr">{fmtPnl(netVal)}</span>
                    <div className="flex items-center gap-1.5">
                      {isExisting && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-accent-primary/15 text-accent-primary border border-accent-primary/30">עדכון</span>
                      )}
                      {trade._isOpen && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-profit/15 text-profit border border-profit/30">פתוח</span>
                      )}
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${trade.direction === 'long' ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'}`}>
                        {trade.direction === 'long' ? 'Long ↗' : 'Short ↘'}
                      </span>
                      <span className="text-sm font-bold text-text-primary">{trade.pair}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <div className="flex items-center gap-1.5" dir="ltr">
                      {trade.leverage > 1 && (
                        <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-bg-tertiary text-text-muted border border-border-primary">{trade.leverage}x</span>
                      )}
                      <span className="text-[10px] text-text-muted font-mono">
                        {trade._isOpen ? fmtPrice(trade.entryPrice) : `${fmtPrice(trade.entryPrice)} → ${fmtPrice(trade.exitPrice)}`}
                      </span>
                    </div>
                    <span className="text-[10px] text-text-muted">{fmtDate(trade.entryDate)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-border-primary">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-border-primary text-sm text-text-secondary hover:bg-bg-tertiary transition-colors cursor-pointer">ביטול</button>
          <button onClick={handleImport} disabled={selected.size === 0 || importing}
            className="flex-1 py-2.5 rounded-xl bg-accent-primary text-bg-primary text-sm font-bold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-40 flex items-center justify-center gap-2">
            {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : (
              <><Download className="w-4 h-4" />
              {updatesCount > 0 && newCount === 0 ? `עדכן ${updatesCount} עסקאות` :
               updatesCount > 0 ? `ייבא ${newCount} + עדכן ${updatesCount}` :
               `ייבא ${selected.size} עסקאות`}
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
