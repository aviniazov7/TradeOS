import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import Card from './Card';
import FitText from './FitText';

// KPI tile (21st.dev "stats card" style): small label + icon, a big tabular
// number, an optional change pill (↑ +5.4%) and a muted sub-line.
//   inset   – sits inside another card (tertiary fill, no shadow)
//   mono    – numeric value in the tabular face; turn off for words (Hebrew
//             letters spread apart in a monospace face)
//   delta   – { value: '+9.7%', positive: true } (null/undefined hides it)
export default function StatTile({
  icon: Icon, label, value, sub, delta, tone = 'text-text-primary', mono = true, inset = false, className = '', title,
}) {
  const body = (
    <>
      <div className="relative flex items-center justify-between gap-2 text-[10px] md:text-[11px] text-text-muted">
        <span className="truncate">{label}</span>
        {Icon && <Icon className="w-3.5 h-3.5 shrink-0 opacity-80" />}
      </div>
      <div className="relative flex items-center gap-2 mt-1 min-w-0">
        <FitText className={`${mono ? 'num-mono' : ''} text-base md:text-xl font-bold flex-initial ${tone}`} dir={mono ? 'ltr' : undefined}>{value}</FitText>
        {delta && delta.value != null && (
          <span dir="ltr" className={`shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
            delta.positive ? 'bg-profit/15 text-profit' : 'bg-loss/15 text-loss'
          }`}>
            {delta.positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {delta.value}
          </span>
        )}
      </div>
      {sub && <div className="relative text-[10px] md:text-[11px] text-text-muted truncate mt-0.5">{sub}</div>}
    </>
  );
  if (inset) {
    return (
      <div title={title} className={`min-w-0 rounded-xl bg-bg-tertiary border border-border-primary px-3 py-2.5 ${className}`}>{body}</div>
    );
  }
  return (
    <Card spotlight title={title} className={`min-w-0 px-3 py-2.5 md:px-4 md:py-3 ${className}`}>{body}</Card>
  );
}
