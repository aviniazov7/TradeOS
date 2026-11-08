import { m } from 'framer-motion';
import { Pencil, Trash2, Eye } from 'lucide-react';
import { staggerItem } from '../../utils/animations';
import { getSessionClasses } from '../../utils/constants';
import CoinIcon from '../shared/CoinIcon';
import Card from '../shared/Card';

const PAIR_LIMIT = 4;
const TIMEFRAME_LIMIT = 4;
const SESSION_LIMIT = 3;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const FOCUS = 'outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary';

function listOf(value) {
  return Array.isArray(value) ? value.filter((item) => item != null && String(item).trim() !== '') : [];
}

function firstLine(value) {
  if (typeof value !== 'string') return '';
  return value.split('\n').map((part) => part.trim()).find(Boolean) || '';
}

function hasValue(value) {
  return value != null && value !== '';
}

function planAccent(color) {
  return HEX_COLOR.test(color || '') ? color : '#3b82f6';
}

function planLabel(plan) {
  return typeof plan.name === 'string' && plan.name.trim() ? plan.name.trim() : 'ללא שם';
}

export default function PlanCard({ plan, onView, onEdit, onDelete }) {
  const name = planLabel(plan);
  const accent = planAccent(plan.color);
  const description = typeof plan.description === 'string' ? plan.description.trim() : '';
  const entryLine = firstLine(plan.entryRules);
  const pairs = listOf(plan.pairs);
  const timeframes = listOf(plan.timeframes);
  const sessions = listOf(plan.sessions);
  const shownPairs = pairs.slice(0, PAIR_LIMIT);
  const shownTimeframes = timeframes.slice(0, TIMEFRAME_LIMIT);
  const shownSessions = sessions.slice(0, SESSION_LIMIT);
  const checklistCount = listOf(plan.checklist).length;
  const showLoss = hasValue(plan.maxDailyLoss);
  const showPositions = hasValue(plan.maxPositions);
  const active = Boolean(plan.isActive);

  return (
    <Card
      as={m.article}
      variants={staggerItem}
      data-testid="plan-card"
      data-active={active ? 'true' : 'false'}
      aria-label={name}
      className="rounded-2xl h-full min-w-0 p-4 md:p-5 flex flex-col gap-3 transition-colors hover:border-border-hover"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <span
            aria-hidden
            data-accent={accent}
            className="mt-[0.45rem] h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-border-hover"
            style={{ backgroundColor: accent }}
          />
          <h3 className="text-[17px] md:text-lg font-bold leading-snug text-text-primary line-clamp-2" title={name}>
            {name}
          </h3>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${active ? 'border-profit/30 bg-profit/12 text-profit' : 'border-border-primary bg-bg-tertiary text-text-secondary'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-profit' : 'bg-text-muted'}`} aria-hidden />
          {active ? 'פעילה' : 'לא פעילה'}
        </span>
      </header>

      {description && (
        <p className="text-sm leading-relaxed text-text-secondary line-clamp-3">{description}</p>
      )}

      {entryLine && (
        <div className="rounded-xl border border-border-primary bg-bg-tertiary px-3 py-2.5">
          <p className="text-[11px] font-semibold text-text-muted">כניסה</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-text-secondary line-clamp-2">{entryLine}</p>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2.5">
        {shownPairs.length > 0 && (
          <ul className="m-0 flex list-none flex-wrap items-center gap-x-3 gap-y-1.5 p-0" aria-label="זוגות">
            {shownPairs.map((pair) => (
              <li key={pair} dir="ltr" className="inline-flex max-w-full items-center gap-1.5 text-xs font-semibold text-text-primary">
                <CoinIcon pair={pair} className="h-4 w-4" />
                <span className="truncate">{pair}</span>
              </li>
            ))}
            {pairs.length > PAIR_LIMIT && (
              <li className="text-xs font-medium text-text-secondary">+{pairs.length - PAIR_LIMIT}</li>
            )}
          </ul>
        )}

        {shownTimeframes.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
            <span className="text-text-muted">טיימפריים</span>
            {shownTimeframes.map((timeframe) => (
              <span key={timeframe} dir="ltr" className="num-mono text-[12px] font-semibold text-text-primary">{timeframe}</span>
            ))}
            {timeframes.length > TIMEFRAME_LIMIT && (
              <span>+{timeframes.length - TIMEFRAME_LIMIT}</span>
            )}
          </p>
        )}

        {shownSessions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" aria-label="סשנים">
            {shownSessions.map((session) => (
              <span key={session} className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${getSessionClasses(session)}`}>
                {session}
              </span>
            ))}
            {sessions.length > SESSION_LIMIT && (
              <span className="text-[11px] font-medium text-text-secondary">+{sessions.length - SESSION_LIMIT}</span>
            )}
          </div>
        )}

        {(showLoss || showPositions || checklistCount > 0) && (
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-secondary">
            {showLoss && (
              <span>
                הפסד יומי{' '}
                <b dir="ltr" className="num-mono font-semibold text-text-primary">{plan.maxDailyLoss}%</b>
              </span>
            )}
            {showPositions && (
              <span>
                עסקאות במקביל{' '}
                <b dir="ltr" className="num-mono font-semibold text-text-primary">{plan.maxPositions}</b>
              </span>
            )}
            {checklistCount > 0 && (
              <span>
                צ'קליסט{' '}
                <b className="num-mono font-semibold text-text-primary">{checklistCount}</b>
              </span>
            )}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-border-primary pt-3">
          <button
            type="button"
            onClick={() => onView(plan)}
            aria-label={`צפייה ב${name}`}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-accent-hover cursor-pointer hover:text-accent-primary ${FOCUS}`}
          >
            <Eye className="h-4 w-4" aria-hidden />
            צפה בתוכנית
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit(plan)}
              aria-label={`עריכת ${name}`}
              title="עריכה"
              className={`inline-flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary cursor-pointer hover:bg-bg-tertiary hover:text-accent-primary ${FOCUS}`}
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
      </div>
    </Card>
  );
}
