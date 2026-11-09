import { filterJournalShare } from '../../utils/journalShareFilter';
import { formatCurrency, isolateLtr } from '../../utils/formatters';

const DIRECTION = { long: 'לונג', short: 'שורט' };

function hasKey(trades, keys) {
  return trades.some((trade) => keys.some((key) => trade[key] !== undefined));
}

/**
 * Renders only filterJournalShare's copy. Raw notes, live balances and keys
 * never reach this tree unless that function copied them.
 */
export default function JournalSharePreview({ journal, trades, fields }) {
  const view = filterJournalShare(journal, trades, fields);
  const rows = Array.isArray(view.trades) ? view.trades : null;
  const notesOn = rows ? hasKey(rows, ['notes', 'entryReason']) : false;
  const emotionsOn = rows ? hasKey(rows, ['emotionBefore', 'emotionAfter', 'mistakes']) : false;
  const chartsOn = rows ? hasKey(rows, ['tradingViewUrls']) : false;

  return (
    <section
      data-testid="share-preview"
      aria-label="מה הצופה יראה"
      className="rounded-xl border border-border-primary bg-bg-secondary p-3 space-y-2"
    >
      <h3 className="text-sm font-bold text-text-primary">מה הצופה יראה</h3>
      <p className="text-[11px] leading-relaxed text-text-muted">
        זו התצוגה המסוננת עצמה. יתרה חיה, כתובת בורסה ומפתחות לא נכנסים אליה.
      </p>

      {view.balances ? (
        <p className="text-xs text-text-primary">
          יתרת פתיחה {isolateLtr(view.balances.initialBalance ?? '—')}
          {' · '}
          גודל חשבון פרופ {isolateLtr(view.balances.propAccountSize ?? '—')}
        </p>
      ) : (
        <p className="text-xs text-text-muted">אין יתרה בעותק.</p>
      )}

      {!rows && <p className="text-xs text-text-muted">אין עסקאות בעותק.</p>}

      {rows && (
        <>
          <p className="text-xs text-text-primary">
            {isolateLtr(String(rows.length))} עסקאות
            {view.stats ? ` · נטו ${formatCurrency(view.stats.net)}` : ''}
            {view.stats?.winRate != null ? ` · הצלחה ${isolateLtr(`${Math.round(view.stats.winRate)}%`)}` : ''}
          </p>
          <ul className="space-y-1.5">
            {rows.map((trade) => (
              <li key={trade.id || trade.pair} className="rounded-lg bg-bg-tertiary px-2.5 py-1.5 text-xs text-text-primary">
                <span className="font-semibold">{trade.pair}</span>
                {' '}
                <span className="text-text-muted">{DIRECTION[trade.direction] || trade.direction}</span>
                {trade.notes != null && <span className="block text-text-secondary mt-0.5">{trade.notes}</span>}
                {trade.entryReason != null && <span className="block text-text-secondary">{trade.entryReason}</span>}
                {trade.emotionBefore != null && <span className="block text-text-secondary">לפני: {trade.emotionBefore}</span>}
                {trade.mistakes != null && <span className="block text-text-secondary">טעויות: {String(trade.mistakes)}</span>}
                {Array.isArray(trade.tradingViewUrls) && trade.tradingViewUrls.map((url) => (
                  <span key={url} className="block text-text-muted truncate" dir="ltr">{url}</span>
                ))}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-text-muted">
            {!notesOn && 'הערות לא נכללות. '}
            {!emotionsOn && 'רגשות וטעויות לא נכללים. '}
            {!chartsOn && 'קישורי גרף לא נכללים.'}
          </p>
        </>
      )}
    </section>
  );
}
