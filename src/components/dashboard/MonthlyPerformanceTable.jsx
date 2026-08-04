import { formatCurrency } from '../../utils/formatters';

const MONTH_NAMES = {
  '01': 'ינואר', '02': 'פברואר', '03': 'מרץ', '04': 'אפריל',
  '05': 'מאי', '06': 'יוני', '07': 'יולי', '08': 'אוגוסט',
  '09': 'ספטמבר', '10': 'אוקטובר', '11': 'נובמבר', '12': 'דצמבר',
};

function formatMonth(key) {
  const [year, month] = key.split('-');
  return `${MONTH_NAMES[month] || month} ${year}`;
}

export default function MonthlyPerformanceTable({ data }) {
  if (!data || !data.length) return null;

  const pnlColor = (v) => (v >= 0 ? 'text-profit' : 'text-loss');

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-3">ביצועים חודשיים</h3>
      {/* tabular-nums keeps digit columns aligned; whitespace-nowrap stops cells
          wrapping to 2 lines (which made rows look crooked on narrow phones);
          numeric values are wrapped in dir="ltr" so the $, %, +/- don't reorder
          inside the RTL row. */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-xs text-text-muted border-b border-border-primary">
              <th className="text-right pb-2 ps-3 font-medium whitespace-nowrap">חודש</th>
              <th className="text-right pb-2 ps-3 font-medium whitespace-nowrap">עסקאות</th>
              <th className="text-right pb-2 ps-3 font-medium whitespace-nowrap">% הצלחה</th>
              <th className="text-right pb-2 ps-3 font-medium whitespace-nowrap">רווח/הפסד</th>
              <th className="text-right pb-2 font-medium whitespace-nowrap">מצטבר</th>
            </tr>
          </thead>
          <tbody>
            {data.map((m) => (
              <tr key={m.month} className="border-b border-border-primary/50 align-middle">
                <td className="py-2 ps-3 text-text-primary font-medium whitespace-nowrap">{formatMonth(m.month)}</td>
                <td className="py-2 ps-3 text-text-secondary whitespace-nowrap">{m.count}</td>
                <td className="py-2 ps-3 text-text-secondary whitespace-nowrap"><span dir="ltr" className="inline-block">{m.winRate.toFixed(1)}%</span></td>
                <td className={`py-2 ps-3 font-medium whitespace-nowrap ${pnlColor(m.pnl)}`}><span dir="ltr" className="inline-block">{formatCurrency(m.pnl)}</span></td>
                <td className={`py-2 font-medium whitespace-nowrap ${pnlColor(m.cumulativePnl)}`}><span dir="ltr" className="inline-block">{formatCurrency(m.cumulativePnl)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
