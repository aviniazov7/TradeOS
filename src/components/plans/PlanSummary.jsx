import CoinIcon from '../shared/CoinIcon';
import { listOf, planAccent, planName, textOf } from './planFields';

const PAIR_LIMIT = 3;
const TIMEFRAME_LIMIT = 3;
const SESSION_LIMIT = 2;
const FOCUS = 'outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary';

export default function PlanSummary({ plan, selected, onSelect }) {
  const name = planName(plan);
  const description = textOf(plan.description);
  const pairs = listOf(plan.pairs);
  const timeframes = listOf(plan.timeframes);
  const sessions = listOf(plan.sessions);
  const accent = planAccent(plan.color);
  const active = Boolean(plan.isActive);
  const shownPairs = pairs.slice(0, PAIR_LIMIT);
  const shownTimeframes = timeframes.slice(0, TIMEFRAME_LIMIT);
  const shownSessions = sessions.slice(0, SESSION_LIMIT);

  return (
    <li>
      <button
        type="button"
        data-testid="plan-option"
        data-plan-id={plan.id}
        data-active={active ? 'true' : 'false'}
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(plan)}
        className={`w-full cursor-pointer rounded-lg border p-3 text-start transition-colors ${selected ? 'border-accent-primary bg-accent-primary/10' : 'border-border-primary bg-transparent hover:border-border-hover'} ${FOCUS}`}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 items-start gap-2">
            {accent && <span aria-hidden data-accent={accent} className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accent }} />}
            <span className="line-clamp-2 text-sm font-semibold leading-5 text-text-primary">{name}</span>
          </span>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${active ? 'border-profit/30 text-profit' : 'border-border-primary text-text-muted'}`}>
            {active ? 'פעילה' : 'לא פעילה'}
          </span>
        </span>
        {description && <span className="mt-1.5 line-clamp-2 block text-xs leading-5 text-text-secondary">{description}</span>}
        {(shownPairs.length > 0 || shownTimeframes.length > 0 || shownSessions.length > 0) && (
          <span className="mt-2 flex flex-col items-start gap-1.5">
            {shownPairs.length > 0 && (
              <span className="flex flex-wrap items-center gap-1.5">
                {shownPairs.map((pair) => (
                  <span key={pair} dir="ltr" className="inline-flex items-center gap-1 text-[11px] font-medium text-text-secondary">
                    <CoinIcon pair={pair} className="h-3.5 w-3.5" />
                    {pair}
                  </span>
                ))}
                {pairs.length > PAIR_LIMIT && <span className="text-[11px] text-text-muted">עוד {pairs.length - PAIR_LIMIT}</span>}
              </span>
            )}
            {shownTimeframes.length > 0 && (
              <span data-meta="timeframes" className="flex flex-wrap gap-1">
                {shownTimeframes.map((timeframe) => (
                  <span key={timeframe} dir="ltr" className="num-mono rounded-md border border-border-primary px-1.5 py-0.5 text-[11px] font-medium text-text-secondary">{timeframe}</span>
                ))}
                {timeframes.length > TIMEFRAME_LIMIT && <span className="self-center text-[11px] text-text-muted">עוד {timeframes.length - TIMEFRAME_LIMIT}</span>}
              </span>
            )}
            {shownSessions.length > 0 && (
              <span className="flex flex-wrap gap-1">
                {shownSessions.map((session) => (
                  <span key={session} className="rounded-md bg-bg-tertiary px-1.5 py-0.5 text-[11px] text-text-secondary">{session}</span>
                ))}
                {sessions.length > SESSION_LIMIT && <span className="self-center text-[11px] text-text-muted">עוד {sessions.length - SESSION_LIMIT}</span>}
              </span>
            )}
          </span>
        )}
      </button>
    </li>
  );
}
