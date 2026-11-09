import { evaluateJournalRisk } from '../../utils/journalRiskRules';

const ROWS = [
  ['weeklyLoss', 'הפסד שבועי'],
  ['dailyLossPercent', 'הפסד יומי'],
  ['weeklyLossPercent', 'הפסד שבועי באחוזים'],
  ['maxTrades', 'עסקאות ביום'],
  ['tradingHours', 'שעות מסחר'],
];

const TONE_CLASS = {
  ok: 'border-profit/30 bg-profit/10 text-profit',
  breach: 'border-loss/30 bg-loss/10 text-loss',
  muted: 'border-border-primary bg-bg-tertiary text-text-secondary',
};

function statusView(state) {
  if (!state) return null;
  const rows = ROWS
    .map(([key, label]) => ({ label, row: state[key] }))
    .filter((item) => item.row?.enabled);
  if (!rows.length) return null;
  const breached = rows.filter((item) => item.row.breached);
  if (breached.length) {
    return {
      tone: 'breach',
      breached: true,
      label: `חריגה: ${breached.map((item) => item.label).join(', ')}`,
    };
  }
  if (rows.every((item) => item.row.measurable === false)) {
    return { tone: 'muted', breached: false, label: 'אין יתרת פתיחה למדידת האחוז' };
  }
  return { tone: 'ok', breached: false, label: 'כללי הסיכון בטווח' };
}

// Read-only result of evaluateJournalRisk. Missing or disabled rules draw
// nothing, so a journal without rules stays as it was. This is not an alert.
export default function JournalRiskStatus({
  rules,
  trades,
  journalId = null,
  balance = null,
  now,
}) {
  const view = statusView(evaluateJournalRisk(trades, rules, {
    now: now ?? new Date(),
    journalId,
    balance,
  }));
  if (!view) return null;
  return (
    <div
      role="status"
      data-testid="journal-risk-status"
      data-breached={view.breached ? '1' : '0'}
      data-tone={view.tone}
      className={`mb-3 inline-flex w-fit max-w-full items-center rounded-lg border px-2.5 py-1 text-xs font-semibold ${TONE_CLASS[view.tone]}`}
    >
      {view.label}
    </div>
  );
}
