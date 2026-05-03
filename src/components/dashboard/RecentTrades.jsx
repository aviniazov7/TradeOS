import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { formatCurrency, formatRelativeTime } from '../../utils/formatters';
import { fadeIn } from '../../utils/animations';
import CoinIcon from '../shared/CoinIcon';

const pnlColor = (val) => (val > 0 ? 'text-profit' : val < 0 ? 'text-loss' : 'text-breakeven');

export default function RecentTrades({ trades }) {
  const recent = trades.filter((t) => t.status === 'closed').slice(0, 5);

  if (recent.length === 0) {
    return (
      <div className="bg-bg-secondary border border-border-primary rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">עסקאות אחרונות</h2>
        <p className="text-text-muted text-sm">אין עסקאות סגורות עדיין.</p>
      </div>
    );
  }

  return (
    <motion.div variants={fadeIn} initial="initial" animate="animate" className="bg-bg-secondary border border-border-primary rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-primary">
        <h2 className="text-lg font-semibold text-text-primary">עסקאות אחרונות</h2>
        <Link to="/journal" className="flex items-center gap-1 text-xs text-accent-primary hover:text-accent-hover transition-colors">
          הצג הכל <ArrowLeft className="w-3 h-3" />
        </Link>
      </div>
      <div className="divide-y divide-border-primary">
        {recent.map((trade) => (
          <div key={trade.id} className="flex items-center justify-between px-6 py-3 hover:bg-bg-tertiary/50 transition-colors">
            <div className="flex items-center gap-3">
              <CoinIcon pair={trade.pair} className="w-4 h-4" />
              <span className="text-sm font-medium text-text-primary">{trade.pair}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${trade.direction === 'long' ? 'bg-long/15 text-long' : 'bg-short/15 text-short'}`}>
                {trade.direction === 'long' ? 'Long' : 'Short'}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className={`text-sm font-semibold ${pnlColor(trade.netPnl ?? trade.pnl)}`}>
                {formatCurrency(trade.netPnl ?? trade.pnl)}
              </span>
              <span className="text-xs text-text-muted w-20 text-left">{formatRelativeTime(trade.exitDate || trade.entryDate)}</span>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
