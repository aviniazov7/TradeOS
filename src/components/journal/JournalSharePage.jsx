import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BookOpen, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { formatCurrency, formatDateTime, isolateLtr } from '../../utils/formatters';
import {
  SHARE_VIEW_MISSING,
  SHARE_VIEW_UNAVAILABLE,
  fetchSharedJournal,
} from '../../services/journalShareService';

const DIRECTION = { long: 'לונג', short: 'שורט' };
const STATUS = { open: 'פתוחה', closed: 'סגורה', partial: 'חלקית' };
const RESULT = { win: 'רווח', loss: 'הפסד', breakeven: 'איזון' };

const TRADE_LINES = [
  ['entryPrice', 'כניסה'],
  ['exitPrice', 'יציאה'],
  ['quantity', 'כמות'],
  ['leverage', 'מינוף'],
  ['fees', 'עמלות'],
  ['pnl', 'ברוטו'],
  ['stopLoss', 'סטופ'],
  ['takeProfit', 'יעד'],
  ['notes', 'הערה'],
  ['entryReason', 'סיבת כניסה'],
  ['emotionBefore', 'רגש לפני'],
  ['emotionAfter', 'רגש אחרי'],
  ['mistakes', 'טעויות'],
  ['focusRating', 'מיקוד'],
  ['planAdherenceRating', 'עמידה בתוכנית'],
  ['stressRating', 'לחץ'],
  ['confidenceRating', 'ביטחון'],
];

function useSharePrivacy() {
  useEffect(() => {
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    const referrer = document.createElement('meta');
    referrer.name = 'referrer';
    referrer.content = 'no-referrer';
    document.head.append(robots, referrer);
    return () => {
      robots.remove();
      referrer.remove();
    };
  }, []);
}

function lineValue(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return isolateLtr(String(value));
  return String(value);
}

function TradeCard({ trade }) {
  const when = trade.entryDate ? formatDateTime(trade.entryDate) : '';
  return (
    <article className="rounded-xl border border-border-primary bg-bg-secondary p-3 space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-text-primary">{trade.pair || 'עסקה'}</h2>
        <span className="text-xs text-text-muted">
          {DIRECTION[trade.direction] || ''}
          {trade.status ? ` · ${STATUS[trade.status] || ''}` : ''}
        </span>
      </div>
      <p className="text-sm">
        {trade.result && (
          <span className={trade.result === 'loss' ? 'text-loss' : trade.result === 'win' ? 'text-profit' : 'text-text-secondary'}>
            {RESULT[trade.result] || ''}
          </span>
        )}
        {trade.netPnl != null && <span className="text-text-primary"> {formatCurrency(trade.netPnl)}</span>}
        {when && <span className="text-text-muted"> · {isolateLtr(when)}</span>}
      </p>
      <dl className="space-y-0.5">
        {TRADE_LINES.map(([key, label]) => {
          if (trade[key] == null || trade[key] === '') return null;
          return (
            <div key={key} className="flex justify-between gap-3 text-xs">
              <dt className="text-text-muted">{label}</dt>
              <dd className="text-text-primary text-left" dir="auto">{lineValue(trade[key])}</dd>
            </div>
          );
        })}
      </dl>
      {Array.isArray(trade.tradingViewUrls) && trade.tradingViewUrls.map((url) => (
        <a
          key={url}
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="block text-xs text-accent-hover truncate"
          dir="ltr"
        >
          {url}
        </a>
      ))}
    </article>
  );
}

function ShareBody({ share }) {
  const trades = Array.isArray(share.trades) ? share.trades : null;
  const balances = share.balances && typeof share.balances === 'object' ? share.balances : null;
  const stats = share.stats && typeof share.stats === 'object' ? share.stats : null;
  const empty = !trades && !balances;
  return (
    <div className="space-y-3" data-testid="share-body">
      {balances && (
        <p className="text-sm text-text-primary">
          יתרת פתיחה {isolateLtr(balances.initialBalance ?? '—')}
          {' · '}
          גודל חשבון פרופ {isolateLtr(balances.propAccountSize ?? '—')}
        </p>
      )}
      {stats && trades && (
        <p className="text-xs text-text-secondary">
          {isolateLtr(String(trades.length))} עסקאות
          {' · '}
          נטו {formatCurrency(stats.net)}
          {stats.winRate != null ? ` · הצלחה ${isolateLtr(`${Math.round(stats.winRate)}%`)}` : ''}
        </p>
      )}
      {trades && (
        <div className="space-y-2">
          {trades.map((trade, index) => (
            <TradeCard key={trade.id || `${trade.pair}-${index}`} trade={trade} />
          ))}
        </div>
      )}
      {empty && <p className="text-sm text-text-muted">השיתוף פעיל, ואין בו עסקאות או יתרה.</p>}
    </div>
  );
}

export default function JournalSharePage({ load = fetchSharedJournal }) {
  const { token = '' } = useParams();
  const { toggleTheme, isDark } = useTheme();
  const [state, setState] = useState({ status: 'loading', token: '' });
  if (state.token !== token) setState({ status: 'loading', token });
  useSharePrivacy();

  useEffect(() => {
    let cancelled = false;
    load(token)
      .then((result) => {
        if (cancelled) return;
        if (result?.ok) setState({ status: 'ready', token, share: result.share, expiresAt: result.expiresAt });
        else if (result?.unavailable) setState({ status: 'unavailable', token, message: result.message || '' });
        else setState({ status: 'missing', token });
      })
      .catch(() => { if (!cancelled) setState({ status: 'unavailable', token, message: '' }); });
    return () => { cancelled = true; };
  }, [token, load]);

  return (
    <div className="min-h-dvh bg-bg-primary text-text-primary" dir="rtl">
      <header className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 px-4 py-3">
        <span className="inline-flex items-center gap-2 text-sm font-bold">
          <BookOpen className="w-4 h-4 text-text-secondary" />
          יומן משותף
        </span>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="ערכת נושא"
          className="h-9 w-9 grid place-items-center rounded-lg border border-border-primary bg-bg-tertiary text-text-secondary cursor-pointer"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </header>
      <main className="mx-auto w-full max-w-lg px-4 pb-12 space-y-4">
        <p className="text-xs leading-relaxed text-text-muted">
          קריאה בלבד. אין צורך בחשבון כדי לצפות. אי אפשר לערוך מכאן, ואין הוספת הערות.
        </p>
        {state.status === 'loading' && <p className="text-sm text-text-muted">טוען את היומן…</p>}
        {state.status === 'missing' && (
          <h1 className="text-lg font-bold" data-testid="share-missing">{SHARE_VIEW_MISSING}</h1>
        )}
        {state.status === 'unavailable' && (
          <p role="alert" className="text-sm text-loss">{state.message || SHARE_VIEW_UNAVAILABLE}</p>
        )}
        {state.status === 'ready' && (
          <>
            <p className="text-sm font-semibold text-text-primary" data-testid="share-end">
              בתוקף עד {isolateLtr(formatDateTime(state.expiresAt))}
            </p>
            <ShareBody share={state.share || {}} />
          </>
        )}
      </main>
    </div>
  );
}
