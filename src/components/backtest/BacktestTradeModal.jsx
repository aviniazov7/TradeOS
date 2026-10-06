import { useState } from 'react';
import { ExternalLink, Pencil, Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import Modal from '../shared/Modal';
import CoinIcon from '../shared/CoinIcon';
import { safeHttpUrl } from '../../utils/urls';
import { LRM } from '../../utils/formatters';

// A TradingView snapshot short-link (tradingview.com/x/SLUG) exposes its image
// at s3.tradingview.com/snapshots/<first-char-lowercase>/SLUG.png — derive it so
// we can show a real preview, and fall back to a plain link if it doesn't load.
function tvSnapshotImg(url) {
  const m = String(url || '').match(/tradingview\.com\/x\/([A-Za-z0-9]+)/);
  if (!m) return null;
  const slug = m[1];
  return `https://s3.tradingview.com/snapshots/${slug[0].toLowerCase()}/${slug}.png`;
}

function ChartPreview({ url, label, accent }) {
  const [failed, setFailed] = useState(false);
  const safe = safeHttpUrl(url);
  if (!safe) return null;
  const img = tvSnapshotImg(safe);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-xs font-semibold ${accent}`}>{label}</span>
        <a href={safe} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-text-muted hover:text-accent-primary transition-colors">
          <ExternalLink className="w-3 h-3" /> פתח ב-TradingView
        </a>
      </div>
      {img && !failed ? (
        <a href={safe} target="_blank" rel="noopener noreferrer" className="block rounded-xl overflow-hidden border border-border-primary hover:border-accent-primary/40 transition-colors">
          <img src={img} alt={label} loading="lazy" className="w-full block" onError={() => setFailed(true)} />
        </a>
      ) : (
        <a href={safe} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 h-24 rounded-xl border border-dashed border-border-primary text-sm text-text-muted hover:text-accent-primary hover:border-accent-primary/40 transition-colors">
          <ExternalLink className="w-4 h-4" /> צפה בצ׳ארט
        </a>
      )}
    </div>
  );
}

// One metric cell in the modal's grid (module-level so it isn't recreated on render).
function Cell({ label, value }) {
  return (
    <div className="bg-bg-tertiary/50 rounded-lg p-2.5 min-w-0">
      <div className="text-[10px] text-text-muted">{label}</div>
      <div className="text-sm font-bold text-text-primary mt-0.5 truncate">{value ?? '–'}</div>
    </div>
  );
}

// Detail modal for a single backtest record — mirrors the journal's trade modal:
// header + a metrics grid + notes + chart previews, with edit / delete actions.
export default function BacktestTradeModal({ trade, isOpen, onClose, onEdit, onDelete }) {
  if (!trade) return null;
  const bt = trade;
  const isLong = bt.direction === 'long';
  const resultCls = bt.result === 'win' ? 'text-profit bg-profit/15' : bt.result === 'breakeven' ? 'text-yellow-400 bg-yellow-500/15' : 'text-loss bg-loss/15';
  const resultLabel = bt.result === 'win' ? 'Win' : bt.result === 'breakeven' ? 'BE' : 'Loss';
  const rr = bt.rResult;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${bt.pair} · בקטסט`} maxWidth="max-w-lg">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2 flex-wrap">
          <CoinIcon pair={bt.pair} className="w-7 h-7 shrink-0" />
          <span className="text-base font-bold text-text-primary">{bt.pair}</span>
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded ${isLong ? 'bg-long/10 text-long' : 'bg-short/10 text-short'}`}>
            {isLong ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}{isLong ? 'Long' : 'Short'}
          </span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${resultCls}`}>{resultLabel}</span>
          <span className={`ms-auto text-lg font-extrabold num-mono ${(rr || 0) >= 0 ? 'text-profit' : 'text-loss'}`}>
            {rr != null ? `${LRM}${rr >= 0 ? '+' : ''}${rr.toFixed(2)}R` : '–'}
          </span>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-2">
          <Cell label="אסטרטגיה" value={bt.strategy} />
          <Cell label="טריגר" value={bt.trigger} />
          <Cell label="סשן" value={bt.session} />
          <Cell label="TF" value={bt.timeframe} />
          <Cell label="Max R" value={bt.maxR != null ? bt.maxR.toFixed(1) : null} />
          <Cell label="Stop %" value={bt.stopDistancePct != null ? `${bt.stopDistancePct.toFixed(2)}%` : null} />
        </div>

        {/* Notes */}
        {bt.notes && (
          <div className="bg-bg-tertiary/40 rounded-lg p-3 text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{bt.notes}</div>
        )}

        {/* Chart previews */}
        {(safeHttpUrl(bt.entryChartUrl) || safeHttpUrl(bt.managementChartUrl)) && (
          <div className="space-y-3">
            <ChartPreview url={bt.entryChartUrl} label="צ׳ארט כניסה" accent="text-accent-primary" />
            <ChartPreview url={bt.managementChartUrl} label="צ׳ארט ניהול" accent="text-purple-400" />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1 border-t border-border-primary">
          <button onClick={() => { onEdit(bt); onClose(); }} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-accent-primary/10 text-accent-primary text-sm font-semibold hover:bg-accent-primary/20 transition-colors cursor-pointer">
            <Pencil className="w-4 h-4" /> עריכה
          </button>
          <button onClick={() => { onDelete(bt); onClose(); }} className="p-2 rounded-lg text-text-muted hover:text-loss hover:bg-bg-tertiary transition-colors cursor-pointer" title="מחיקה">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </Modal>
  );
}
