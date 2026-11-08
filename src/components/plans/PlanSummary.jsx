import { Pencil, Trash2 } from 'lucide-react';
import CoinIcon from '../shared/CoinIcon';
import { hasValue, listOf, planName, planSummaryText } from './planFields';

const PAIR_LIMIT = 2;
const TIMEFRAME_LIMIT = 3;
const SESSION_LIMIT = 2;
const FOCUS = 'outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary';

function MetaGroup({ children, label }) {
  return <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1" aria-label={label}>{children}</span>;
}

export default function PlanSummary({ plan, onView, onEdit, onDelete }) {
  const name = planName(plan);
  const summary = planSummaryText(plan);
  const pairs = listOf(plan.pairs);
  const timeframes = listOf(plan.timeframes);
  const sessions = listOf(plan.sessions);
  const checklistCount = listOf(plan.checklist).length;
  const active = Boolean(plan.isActive);
  const groups = [];

  if (pairs.length > 0) {
    groups.push(
      <MetaGroup key="pairs" label="זוגות">
        {pairs.slice(0, PAIR_LIMIT).map((pair) => (
          <span key={pair} dir="ltr" className="inline-flex items-center gap-1 font-medium text-text-secondary">
            <CoinIcon pair={pair} className="h-3.5 w-3.5" />
            {pair}
          </span>
        ))}
        {pairs.length > PAIR_LIMIT && <span>+{pairs.length - PAIR_LIMIT}</span>}
      </MetaGroup>,
    );
  }

  if (timeframes.length > 0) {
    groups.push(
      <MetaGroup key="timeframes" label="טיימפריים">
        <span data-meta="timeframes" className="inline-flex flex-wrap gap-x-2">
          {timeframes.slice(0, TIMEFRAME_LIMIT).map((timeframe) => (
            <span key={timeframe} dir="ltr" className="num-mono font-medium text-text-secondary">{timeframe}</span>
          ))}
        </span>
        {timeframes.length > TIMEFRAME_LIMIT && <span>+{timeframes.length - TIMEFRAME_LIMIT}</span>}
      </MetaGroup>,
    );
  }

  if (sessions.length > 0) {
    groups.push(
      <MetaGroup key="sessions" label="סשנים">
        {sessions.slice(0, SESSION_LIMIT).map((session) => (
          <span key={session}>{session}</span>
        ))}
        {sessions.length > SESSION_LIMIT && <span>+{sessions.length - SESSION_LIMIT}</span>}
      </MetaGroup>,
    );
  }

  if (hasValue(plan.maxDailyLoss)) {
    groups.push(
      <span key="loss">
        הפסד יומי <b dir="ltr" className="num-mono font-semibold text-text-secondary">{plan.maxDailyLoss}%</b>
      </span>,
    );
  }

  if (checklistCount > 0) {
    groups.push(
      <span key="checklist">
        צ׳קליסט <b className="num-mono font-semibold text-text-secondary">{checklistCount}</b>
      </span>,
    );
  }

  return (
    <li
      data-testid="plan-summary"
      data-active={active ? 'true' : 'false'}
      className="relative border-b border-border-primary py-6 md:py-7"
    >
      <div className="flex items-start gap-2 sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-x-3">
            <h3 className="min-w-0 max-w-[calc(100%-4.5rem)] text-lg font-semibold leading-snug text-text-primary md:text-xl">
              <button
                type="button"
                onClick={() => onView(plan)}
                aria-label={`צפייה ב${name}`}
                className={`line-clamp-2 cursor-pointer text-start after:absolute after:inset-0 ${FOCUS}`}
              >
                {name}
              </button>
            </h3>
            <span className={`shrink-0 pt-1 text-xs font-medium ${active ? 'text-profit' : 'text-text-muted'}`}>
              {active ? 'פעילה' : 'לא פעילה'}
            </span>
          </div>
          {summary && (
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary line-clamp-2">{summary}</p>
          )}
          {groups.length > 0 && (
            <p className="mt-3 flex flex-wrap items-center gap-y-1 text-[13px] leading-5 text-text-muted">
              {groups.map((group, index) => (
                <span key={group.key} className="inline-flex items-center">
                  {index > 0 && <span aria-hidden className="px-2 text-text-muted">·</span>}
                  {group}
                </span>
              ))}
            </p>
          )}
        </div>
        <div className="relative z-10 flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => onEdit(plan)}
            aria-label={`עריכת ${name}`}
            title="עריכה"
            className={`inline-flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary cursor-pointer hover:bg-bg-tertiary hover:text-text-primary ${FOCUS}`}
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onDelete(plan)}
            aria-label={`מחיקת ${name}`}
            title="מחיקה"
            className={`inline-flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary cursor-pointer hover:bg-bg-tertiary hover:text-loss ${FOCUS}`}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </li>
  );
}
