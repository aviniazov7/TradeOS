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
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-text-muted border-b border-border-primary">
              <th className="text-right pb-2 font-medium">חודש</th>
              <th className="text-right pb-2 font-medium">עסקאות</th>
              <th className="text-right pb-2 font-medium">% הצלחה</th>
              <th className="text-right pb-2 font-medium">רווח/הפסד</th>
              <th className="text-right pb-2 font-medium">מצטבר</th>
            </tr>
          </thead>
          <tbody>
            {data.map((m) => (
              <tr key={m.month} className="border-b border-border-primary/50">
                <td className="py-2 text-text-primary font-medium">{formatMonth(m.month)}</td>
                <td className="py-2 text-text-secondary">{m.count}</td>
                <td className="py-2 text-text-secondary">{m.winRate.toFixed(1)}%</td>
                <td className={`py-2 font-medium ${pnlColor(m.pnl)}`}>{formatCurrency(m.pnl)}</td>
                <td className={`py-2 font-medium ${pnlColor(m.cumulativePnl)}`}>{formatCurrency(m.cumulativePnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
