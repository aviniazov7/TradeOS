import { motion } from 'framer-motion';
import { Pencil, Trash2, ArrowLeft, ExternalLink } from 'lucide-react';
import { formatDate, formatNumber, formatCurrency, formatPercent, formatRR } from '../../utils/formatters';
import { staggerItem, cardHover } from '../../utils/animations';
import CoinIcon from '../shared/CoinIcon';

const pnlColor = (val) => (val > 0 ? 'text-profit' : val < 0 ? 'text-loss' : 'text-breakeven');
const borderColor = (val) => (val > 0 ? 'border-r-profit' : val < 0 ? 'border-r-loss' : 'border-r-breakeven');

export default function TradeCard({ trade, onEdit, onDelete }) {
  const pnl = trade.netPnl ?? trade.pnl ?? 0;

  return (
    <motion.div
      variants={staggerItem}
      whileHover={cardHover}
      className={`md:hidden bg-bg-secondary border border-border-primary rounded-xl p-4 border-r-2 ${borderColor(pnl)}`}
    >
      {/* Top row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <CoinIcon pair={trade.pair} className="w-4 h-4 shrink-0" />
          <span className="text-text-primary font-semibold truncate min-w-0" title={trade.pair}>{trade.pair}</span>
          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${trade.direction === 'long' ? 'bg-long/15 text-long' : 'bg-short/15 text-short'}`}>
            {trade.direction === 'long' ? 'Long' : 'Short'}
          </span>
          <span className="text-xs text-text-muted">{trade.marketType === 'futures' ? 'פיוצ׳רס' : 'ספוט'}</span>
        </div>
        <span className="text-xs text-text-muted">{formatDate(trade.entryDate)}</span>
      </div>

      {/* Price row */}
      <div className="flex items-center gap-2 mb-3 text-sm">
        <span className="text-text-secondary">{formatNumber(trade.entryPrice)}</span>
        <ArrowLeft className="w-3 h-3 text-text-muted" />
        <span className="text-text-secondary">
          {formatNumber(trade.exitPrice)}
          {trade.status === 'partial' && <span className="text-[10px] text-breakeven mr-0.5">(חלקית)</span>}
        </span>
        <span className={`mr-auto text-lg font-bold ${pnlColor(pnl)}`}>
          {formatCurrency(pnl)}
        </span>
      </div>

      {/* Bottom row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-text-muted">
          {trade.strategy && <span>{trade.strategy}</span>}
          {trade.rrRatio > 0 && <span className={pnl < 0 ? 'text-loss' : ''}>R:R {formatRR(trade.rrRatio, pnl)}</span>}
          <span className={pnlColor(trade.pnlPercent)}>{formatPercent(trade.pnlPercent)}</span>
        </div>
        <div className="flex gap-1">
          {trade.tradingViewUrl && (
            <a href={trade.tradingViewUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-text-muted hover:text-accent-primary hover:bg-bg-tertiary transition-colors">
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button onClick={() => onEdit(trade)} className="p-1.5 rounded-lg text-text-muted hover:text-accent-primary hover:bg-bg-tertiary transition-colors cursor-pointer">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={() => onDelete(trade)} className="p-1.5 rounded-lg text-text-muted hover:text-loss hover:bg-bg-tertiary transition-colors cursor-pointer">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
