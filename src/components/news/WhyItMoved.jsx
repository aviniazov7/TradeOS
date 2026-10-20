import { useEffect, useState } from 'react';
import { Activity, ExternalLink, Radio, TrendingUp, TrendingDown } from 'lucide-react';
import { fetchNewsImpact } from '../../services/newsService';
import { LRM } from '../../utils/formatters';
import { decodeHtmlEntities } from '../../utils/htmlEntities';

const AGE = (min) => (min < 60 ? `לפני ${min} דק׳` : `לפני ${Math.round(min / 60)} שע׳`);

// The window the coverage is drawn from, in words. Stated plainly and always —
// the reader needs to know how fresh the news behind a claim is, and a number
// they can read beats a status word they have to decode.
// Returns the whole phrase, prefix included: a Hebrew prefix takes a maqaf
// before a numeral ("מ-4 השעות") but not before a word ("מהשעה"), so the two
// cannot be concatenated by the caller.
const windowLabel = (min) => {
  if (!min) return '';
  if (min < 60) return `חדשות מ-${min} הדקות האחרונות`;
  if (min === 90) return 'חדשות משעה וחצי האחרונה';
  const h = Math.round(min / 60);
  if (h === 1) return 'חדשות מהשעה האחרונה';
  if (h === 2) return 'חדשות מהשעתיים האחרונות';
  return `חדשות מ-${h} השעות האחרונות`;
};

// Cause decides the border, because "we know why" and "we do not" are the two
// states the reader actually needs to tell apart at a glance.
const CAUSE = {
  direct: { label: 'מיוחס לנכס', cls: 'border-accent-primary/40 bg-accent-primary/5' },
  macro: { label: 'רקע מאקרו', cls: 'border-breakeven/40 bg-breakeven/5' },
  unexplained: { label: 'ללא הסבר', cls: 'border-border-primary bg-bg-secondary' },
};

function MoveCard({ f }) {
  const meta = CAUSE[f.cause] || CAUSE.unexplained;
  const Dir = f.changePct >= 0 ? TrendingUp : TrendingDown;
  return (
    <li className={`rounded-2xl border p-4 ${meta.cls}`}>
      <div className="flex items-start gap-3">
        <Dir className={`w-4 h-4 shrink-0 mt-0.5 ${f.changePct >= 0 ? 'text-profit' : 'text-loss'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-text-primary" dir="ltr">{f.ticker}</span>
            <span className={`text-sm font-bold ${f.changePct >= 0 ? 'text-profit' : 'text-loss'}`} dir="ltr">
              {LRM}{f.changePct >= 0 ? '+' : ''}{f.changePct}%
            </span>
            <span className="text-[10px] text-text-muted">ווליום ×{f.volumeX}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border-primary text-text-muted">
              {meta.label}
            </span>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed mt-1.5">{decodeHtmlEntities(f.text)}</p>
          {f.story?.url && (
            <a
              href={f.story.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-accent-primary hover:text-accent-hover mt-1.5"
            >
              למקור <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * "Why did the price move" — the deterministic half of the news feature.
 * Everything here is computed on the cron and read from a prepared blob, so it
 * costs no AI call and states no direction: it reports what moved and what was
 * published alongside it.
 */
export default function WhyItMoved() {
  const [data, setData] = useState(undefined); // undefined = loading

  useEffect(() => {
    let cancelled = false;
    fetchNewsImpact()
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, []);

  if (data === undefined) return <div className="h-24 rounded-2xl bg-bg-secondary animate-pulse mb-5" />;
  if (!data) return null; // a failed read stays silent rather than claiming the market is quiet

  const { findings = [], loudest = [], windowMin } = data;

  return (
    <section className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Activity className="w-4 h-4 text-accent-primary" />
        <h2 className="text-sm font-bold text-text-primary">למה המחיר זז</h2>
        <span className="text-[10px] text-text-muted">
          תנועה חריגה במחיר ובווליום, והסיקור שהתפרסם במקביל
        </span>
        {windowMin > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border-primary text-text-muted">
            {windowLabel(windowMin)}
          </span>
        )}
      </div>

      {findings.length > 0 ? (
        <ul className="space-y-2">
          {findings.map((f) => <MoveCard key={f.symbol} f={f} />)}
        </ul>
      ) : (
        <p className="text-xs text-text-secondary bg-bg-secondary border border-border-primary rounded-2xl p-4">
          אף נכס לא עבר כרגע את הסף של תנועה חריגה גם במחיר וגם בווליום. זה לא אומר שהשוק שקט —
          זה אומר ששום דבר לא חרג מספיק כדי להיות ראוי לציון.
        </p>
      )}

      {loudest.length > 0 && (
        <div className="rounded-2xl border border-border-primary bg-bg-secondary p-4">
          <div className="flex items-center gap-2 mb-2">
            <Radio className="w-3.5 h-3.5 text-accent-primary" />
            <h3 className="text-xs font-bold text-text-primary">על מה מדברים עכשיו</h3>
            <span className="text-[10px] text-text-muted">לפי מספר מקורות עצמאיים</span>
          </div>
          <ul className="space-y-1.5">
            {loudest.map((m) => (
              <li key={m.key} className="flex items-start gap-2 text-[11px]">
                <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted tabular-nums">
                  {m.sourceCount}
                </span>
                <span className="min-w-0 flex-1 text-text-secondary" dir="auto">
                  {decodeHtmlEntities(m.title)}
                  <span className="text-text-muted"> · {AGE(m.ageMin)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
