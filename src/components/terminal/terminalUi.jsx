import ExchangeLogo from '../shared/ExchangeLogo';
import { EXCHANGE_LABELS } from '../../utils/terminal';

// Small building blocks shared by the terminal's panels.

/** LONG / SHORT pill — direction is one of the two places profit/loss colors are used. */
export function DirBadge({ direction, className = '' }) {
  const long = direction !== 'short';
  return (
    <span className={`inline-flex items-center h-5 px-1.5 rounded-md text-[10px] font-bold tracking-wide border ${
      long ? 'bg-long/12 text-long border-long/25' : 'bg-short/12 text-short border-short/25'
    } ${className}`}>
      {long ? 'LONG' : 'SHORT'}
    </span>
  );
}

/** Neutral chip (leverage, margin mode, reduce-only …). */
export function Chip({ children, className = '', title }) {
  return (
    <span title={title} className={`inline-flex items-center h-5 px-1.5 rounded-md text-[10px] font-semibold bg-bg-tertiary border border-border-primary text-text-secondary whitespace-nowrap ${className}`}>
      {children}
    </span>
  );
}

/** Exchange logo + name, and the journal linked to it when there is one. */
export function ExchangeTag({ exchange, journal, compact = false }) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <ExchangeLogo exchange={exchange} size="w-3.5 h-3.5" />
      <span className="text-text-secondary whitespace-nowrap">{EXCHANGE_LABELS[exchange] || exchange}</span>
      {journal && !compact && <span className="text-text-muted truncate max-w-[8rem]" title={`יומן: ${journal}`}>· {journal}</span>}
    </span>
  );
}

/** A number: tabular, LTR so signs and $ stay in place inside RTL. */
export function Num({ children, className = '', title, ...rest }) {
  return <span dir="ltr" title={title} className={`num-mono whitespace-nowrap ${className}`} {...rest}>{children}</span>;
}
