import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Pencil, Trash2, Share2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import CoinIcon from '../shared/CoinIcon';
import { useTheme } from '../../hooks/useTheme';
import { safeHttpUrl } from '../../utils/urls';
import {
  hasValue,
  listOf,
  planAccent,
  planName,
  textOf,
  tradeExamplesOf,
} from './planFields';

const FOCUS = 'outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary';

function toImageUrl(url) {
  const safe = safeHttpUrl(url);
  if (!safe) return null;
  const tvMatch = safe.match(/tradingview\.com\/x\/([a-zA-Z0-9]+)/);
  if (tvMatch) {
    const id = tvMatch[1];
    return `https://s3.tradingview.com/snapshots/${id[0].toLowerCase()}/${id}.png`;
  }
  return safe;
}

function Section({ title, children }) {
  return (
    <section className="border-b border-border-primary py-8 last:border-b-0">
      <h3 className="text-[13px] font-semibold text-text-muted">{title}</h3>
      <div className="mt-3 text-[15px] leading-7 text-text-primary md:text-base">{children}</div>
    </section>
  );
}

function Prose({ value }) {
  const text = textOf(value);
  if (!text) return null;
  return <p className="m-0 whitespace-pre-wrap">{text}</p>;
}

function ItemList({ items }) {
  return (
    <ol className="m-0 list-decimal space-y-2 ps-5 marker:text-text-muted">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="ps-1">{item}</li>
      ))}
    </ol>
  );
}

function Fact({ term, value }) {
  return (
    <div className="flex items-baseline gap-3 py-1">
      <dt className="text-sm text-text-secondary">{term}</dt>
      <dd dir="ltr" className="num-mono m-0 text-base font-semibold text-text-primary">{value}</dd>
    </div>
  );
}

export default function PlanReader({ plan, onBack, onEdit, onDelete }) {
  const articleRef = useRef(null);
  const backRef = useRef(null);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const [exporting, setExporting] = useState(false);
  const { isDark } = useTheme();
  const name = planName(plan);
  const accent = planAccent(plan.color);
  const description = textOf(plan.description);
  const pairs = listOf(plan.pairs);
  const timeframes = listOf(plan.timeframes);
  const sessions = listOf(plan.sessions);
  const checklist = listOf(plan.checklist);
  const mistakes = listOf(plan.mistakesToAvoid);
  const examples = tradeExamplesOf(plan);
  const entry = textOf(plan.entryRules);
  const exit = textOf(plan.exitRules);
  const risk = textOf(plan.riskManagement);
  const management = textOf(plan.tradeManagement);
  const goals = textOf(plan.goals);
  const market = textOf(plan.marketConditions);
  const routine = textOf(plan.dailyRoutine);
  const notes = textOf(plan.notes);
  const showLoss = hasValue(plan.maxDailyLoss);
  const showPositions = hasValue(plan.maxPositions);
  const showRisk = showLoss || showPositions || Boolean(risk);
  const hasContext = pairs.length > 0 || timeframes.length > 0 || sessions.length > 0;
  const hasSections = Boolean(entry || exit || showRisk || management || checklist.length || market || routine || goals || mistakes.length || examples.length || notes);
  const hasBody = Boolean(description || hasContext || hasSections);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const frame = requestAnimationFrame(() => backRef.current?.focus());
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      onBackRef.current?.();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey);
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus();
    };
  }, []);

  const handleShare = async () => {
    const el = articleRef.current;
    if (!el || exporting) return;
    setExporting(true);
    const prevMaxH = el.style.maxHeight;
    const prevOverflow = el.style.overflow;
    try {
      el.style.maxHeight = 'none';
      el.style.overflow = 'visible';
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(el, {
        pixelRatio: 2,
        backgroundColor: isDark ? '#000000' : '#e8ecf4',
        cacheBust: true,
        filter: (node) => {
          if (node.dataset?.exportHide) return false;
          if (node.tagName === 'IMG' && node.src && !node.src.startsWith('data:')) return false;
          return true;
        },
      });
      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve) => { img.onload = resolve; });
      const { jsPDF } = await import('jspdf');
      const pdfWidth = 210;
      const pdfHeight = (img.height / img.width) * pdfWidth;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pdfWidth, pdfHeight] });
      pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
      const pdfBlob = pdf.output('blob');
      const fileName = `${name}.pdf`;
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
      } else {
        const link = document.createElement('a');
        link.download = fileName;
        link.href = URL.createObjectURL(pdfBlob);
        link.click();
        URL.revokeObjectURL(link.href);
        toast.success('ה-PDF הורד');
      }
    } catch (err) {
      if (err.name !== 'AbortError') toast.error('שגיאה בייצוא');
    } finally {
      el.style.maxHeight = prevMaxH;
      el.style.overflow = prevOverflow;
      setExporting(false);
    }
  };

  return (
    <article ref={articleRef} data-testid="plan-reader" aria-labelledby="plan-reader-title" className="w-full">
      <div data-export-hide="true" className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <button
          ref={backRef}
          type="button"
          onClick={onBack}
          className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg text-sm font-medium text-text-secondary cursor-pointer hover:text-text-primary ${FOCUS}`}
        >
          <ArrowRight className="h-4 w-4" aria-hidden />
          חזרה לתוכניות
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleShare}
            disabled={exporting}
            aria-label="ייצוא PDF"
            className={`inline-flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary cursor-pointer hover:bg-bg-tertiary hover:text-text-primary disabled:opacity-50 ${FOCUS}`}
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}
          </button>
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

      <header>
        <p className="flex items-center gap-2 text-xs font-medium text-text-muted">
          {accent && <span aria-hidden data-accent={accent} className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />}
          תוכנית מסחר
        </p>
        <h2 id="plan-reader-title" className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-text-primary md:text-4xl">
          {name}
        </h2>
        <p className={`mt-3 text-sm font-medium ${plan.isActive ? 'text-profit' : 'text-text-muted'}`}>
          {plan.isActive ? 'פעילה' : 'לא פעילה'}
        </p>
        {description && (
          <p className="mt-5 max-w-2xl text-base leading-7 text-text-secondary whitespace-pre-wrap">{description}</p>
        )}
        {hasContext && (
          <div className="mt-6 flex flex-col gap-3">
            {pairs.length > 0 && (
              <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-2 p-0" aria-label="זוגות">
                {pairs.map((pair) => (
                  <li key={pair} dir="ltr" className="inline-flex items-center gap-1.5 text-sm font-medium text-text-primary">
                    <CoinIcon pair={pair} className="h-4 w-4" />
                    {pair}
                  </li>
                ))}
              </ul>
            )}
            {(timeframes.length > 0 || sessions.length > 0) && (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
                {timeframes.length > 0 && (
                  <span data-meta="timeframes" className="inline-flex flex-wrap gap-x-2">
                    {timeframes.map((timeframe) => (
                      <span key={timeframe} dir="ltr" className="num-mono font-medium text-text-primary">{timeframe}</span>
                    ))}
                  </span>
                )}
                {sessions.length > 0 && (
                  <span aria-label="סשנים" className="inline-flex flex-wrap gap-x-2">
                    {sessions.map((session) => <span key={session}>{session}</span>)}
                  </span>
                )}
              </p>
            )}
          </div>
        )}
      </header>

      {hasSections && (
        <div className="mt-10 border-t border-border-primary">
          {entry && <Section title="כללי כניסה"><Prose value={entry} /></Section>}
          {exit && <Section title="כללי יציאה"><Prose value={exit} /></Section>}
          {showRisk && (
            <Section title="ניהול סיכונים">
              {(showLoss || showPositions) && (
                <dl className="m-0">
                  {showLoss && <Fact term="הפסד יומי מקסימלי" value={`${plan.maxDailyLoss}%`} />}
                  {showPositions && <Fact term="מקסימום עסקאות במקביל" value={String(plan.maxPositions)} />}
                </dl>
              )}
              {risk && <div className={showLoss || showPositions ? 'mt-4' : ''}><Prose value={risk} /></div>}
            </Section>
          )}
          {management && <Section title="ניהול עסקה"><Prose value={management} /></Section>}
          {checklist.length > 0 && <Section title="צ׳קליסט לפני עסקה"><ItemList items={checklist} /></Section>}
          {market && <Section title="תנאי שוק"><Prose value={market} /></Section>}
          {routine && <Section title="שגרה יומית"><Prose value={routine} /></Section>}
          {goals && <Section title="יעדים"><Prose value={goals} /></Section>}
          {mistakes.length > 0 && <Section title="טעויות נפוצות"><ItemList items={mistakes} /></Section>}
          {examples.length > 0 && (
            <Section title="דוגמאות כניסה">
              <div className="flex flex-col gap-6">
                {examples.map((example, index) => {
                  const image = toImageUrl(example.chartUrl);
                  const href = safeHttpUrl(example.chartUrl);
                  const title = textOf(example.title);
                  const body = textOf(example.description);
                  return (
                    <figure key={`${title}-${index}`} className="m-0">
                      {image && (
                        href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="block">
                            <img src={image} alt={title || 'דוגמה'} className="w-full rounded-lg" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
                          </a>
                        ) : (
                          <img src={image} alt={title || 'דוגמה'} className="w-full rounded-lg" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
                        )
                      )}
                      {title && <figcaption className="mt-2 font-semibold">{title}</figcaption>}
                      {body && <p className={`m-0 whitespace-pre-wrap text-text-secondary ${title ? 'mt-1' : ''}`}>{body}</p>}
                    </figure>
                  );
                })}
              </div>
            </Section>
          )}
          {notes && <Section title="הערות"><Prose value={notes} /></Section>}
        </div>
      )}

      {!hasBody && (
        <p className="mt-10 border-t border-border-primary pt-8 text-sm leading-6 text-text-secondary">
          אין פרטים שמורים בתוכנית הזו.
        </p>
      )}
    </article>
  );
}
