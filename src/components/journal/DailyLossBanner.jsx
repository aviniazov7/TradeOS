import { AlertTriangle } from 'lucide-react';
import { dailyLossAlertState } from '../../utils/dailyLossAlert';

function money(value) {
  return `$${Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function DailyLossBanner({ alert, trades, journalId, now }) {
  const state = dailyLossAlertState(trades, alert, { now, journalId });
  if (!state.show) return null;
  return (
    <div
      role="alert"
      data-testid="daily-loss-banner"
      className="mb-3 flex items-start gap-2 rounded-xl border border-loss/30 bg-loss/10 px-3 md:px-4 py-2.5"
    >
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-loss" />
      <p className="text-sm font-semibold text-loss">
        הפסד היום הגיע לתקרה:
        {' '}
        <span dir="ltr" className="num-mono">{money(state.loss)}</span>
        {' '}
        מתוך
        {' '}
        <span dir="ltr" className="num-mono">{money(state.amount)}</span>
        . הרישום עדיין פתוח.
      </p>
    </div>
  );
}
