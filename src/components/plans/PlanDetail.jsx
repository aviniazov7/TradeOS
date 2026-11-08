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
const ACTION = `inline-flex h-10 items-center gap-1.5 rounded-lg border border-border-primary bg-bg-tertiary px-3 text-sm font-medium text-text-primary cursor-pointer hover:border-border-hover ${FOCUS}`;

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

function sectionsOf(plan) {
  const sections = [{ id: 'overview', label: 'סקירה' }];
  if (textOf(plan.entryRules)) sections.push({ id: 'entry', label: 'כללי כניסה' });
  if (textOf(plan.exitRules)) sections.push({ id: 'exit', label: 'כללי יציאה' });
  if (textOf(plan.riskManagement)) sections.push({ id: 'risk', label: 'ניהול סיכונים' });
  if (textOf(plan.tradeManagement)) sections.push({ id: 'management', label: 'ניהול עסקה' });
  if (listOf(plan.checklist).length) sections.push({ id: 'checklist', label: 'צ׳קליסט' });
  if (textOf(plan.marketConditions)) sections.push({ id: 'market', label: 'תנאי שוק' });
  if (textOf(plan.dailyRoutine)) sections.push({ id: 'routine', label: 'שגרה יומית' });
  if (textOf(plan.goals)) sections.push({ id: 'goals', label: 'יעדים' });
  if (listOf(plan.mistakesToAvoid).length) sections.push({ id: 'mistakes', label: 'טעויות נפוצות' });
  if (tradeExamplesOf(plan).length) sections.push({ id: 'examples', label: 'דוגמאות כניסה' });
  if (textOf(plan.notes)) sections.push({ id: 'notes', label: 'הערות' });
  return sections;
}

function Prose({ value }) {
  return <p className="m-0 whitespace-pre-wrap text-sm leading-7 text-text-primary md:text-[15px]">{textOf(value)}</p>;
}

function ItemList({ items }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex items-start gap-2 text-start text-sm leading-6 text-text-primary">
          <span aria-hidden className="mt-1 h-4 w-4 shrink-0 rounded border border-border-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Fact({ children }) {
  return <li className="rounded-lg border border-border-primary px-3 py-2 text-sm text-text-secondary">{children}</li>;
}

function SectionBody({ id, plan }) {
  if (id === 'overview') {
    const description = textOf(plan.description);
    const pairs = listOf(plan.pairs);
    const timeframes = listOf(plan.timeframes);
    if (!description && pairs.length === 0 && timeframes.length === 0) {
      return <p className="m-0 text-sm leading-6 text-text-secondary">אין תקציר שמור.</p>;
    }
    return (
      <div className="flex flex-col gap-4">
        {description && <Prose value={description} />}
        {pairs.length > 0 && (
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="זוגות">
            {pairs.map((pair) => (
              <li key={pair} dir="ltr" className="inline-flex items-center gap-1.5 text-sm font-medium text-text-primary">
                <CoinIcon pair={pair} className="h-4 w-4" />
                {pair}
              </li>
            ))}
          </ul>
        )}
        {timeframes.length > 0 && (
          <p data-meta="timeframes" className="m-0 flex flex-wrap gap-1.5">
            {timeframes.map((timeframe) => (
              <span key={timeframe} dir="ltr" className="num-mono rounded-md border border-border-primary px-2 py-1 text-xs font-medium text-text-secondary">{timeframe}</span>
            ))}
          </p>
        )}
      </div>
    );
  }
  if (id === 'entry') return <Prose value={plan.entryRules} />;
  if (id === 'exit') return <Prose value={plan.exitRules} />;
  if (id === 'risk') return <Prose value={plan.riskManagement} />;
  if (id === 'management') return <Prose value={plan.tradeManagement} />;
  if (id === 'checklist') return <ItemList items={listOf(plan.checklist)} />;
  if (id === 'market') return <Prose value={plan.marketConditions} />;
  if (id === 'routine') return <Prose value={plan.dailyRoutine} />;
  if (id === 'goals') return <Prose value={plan.goals} />;
  if (id === 'mistakes') return <ItemList items={listOf(plan.mistakesToAvoid)} />;
  if (id === 'notes') return <Prose value={plan.notes} />;
  if (id === 'examples') {
    return (
      <div className="flex flex-col gap-5">
        {tradeExamplesOf(plan).map((example, index) => {
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
              {title && <figcaption className="mt-2 text-sm font-semibold text-text-primary">{title}</figcaption>}
              {body && <p className="m-0 mt-1 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{body}</p>}
            </figure>
          );
        })}
      </div>
    );
  }
  return null;
}

export default function PlanDetail({ plan, sectionId, onSection, onEdit, onDelete, onBack, showBack }) {
  const articleRef = useRef(null);
  const backRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const { isDark } = useTheme();
  const name = planName(plan);
  const accent = planAccent(plan.color);
  const active = Boolean(plan.isActive);
  const sections = sectionsOf(plan);
  const activeSection = sections.some((section) => section.id === sectionId) ? sectionId : 'overview';
  const sessions = listOf(plan.sessions);
  const showLoss = hasValue(plan.maxDailyLoss);
  const showPositions = hasValue(plan.maxPositions);
  const visible = exporting ? sections : sections.filter((section) => section.id === activeSection);

  useEffect(() => {
    if (!showBack) return undefined;
    backRef.current?.focus();
    return undefined;
  }, [showBack, plan.id]);

  const onTabsKey = (event) => {
    const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')];
    const index = tabs.indexOf(document.activeElement);
    if (index < 0) return;
    const forward = document.documentElement.dir === 'ltr' ? 'ArrowRight' : 'ArrowLeft';
    const backward = forward === 'ArrowRight' ? 'ArrowLeft' : 'ArrowRight';
    let next = index;
    if (event.key === forward) next = index + 1;
    else if (event.key === backward) next = index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    const tab = tabs[(next + tabs.length) % tabs.length];
    tab.focus();
    onSection(tab.dataset.section);
  };

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
    <article ref={articleRef} className="flex flex-col">
      {showBack && (
        <button
          ref={backRef}
          type="button"
          onClick={onBack}
          className={`mb-4 inline-flex min-h-10 items-center gap-1.5 self-start rounded-lg text-sm font-medium text-text-secondary cursor-pointer hover:text-text-primary ${FOCUS}`}
        >
          <ArrowRight className="h-4 w-4" aria-hidden />
          חזרה לרשימה
        </button>
      )}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="plan-detail-title" className="flex items-center gap-2 text-2xl font-semibold leading-tight text-text-primary md:text-3xl">
            {accent && <span aria-hidden data-accent={accent} className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />}
            <span className="min-w-0">{name}</span>
          </h2>
          <p className={`mt-2 text-sm font-medium ${active ? 'text-profit' : 'text-text-muted'}`}>{active ? 'פעילה' : 'לא פעילה'}</p>
        </div>
        <div data-export-hide="true" className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => onEdit(plan)} aria-label={`עריכת ${name}`} className={ACTION}>
            <Pencil className="h-4 w-4" aria-hidden />
            עריכה
          </button>
          <button type="button" onClick={handleShare} disabled={exporting} aria-label="ייצוא PDF" className={`${ACTION} disabled:opacity-50`}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}
            PDF
          </button>
          <button type="button" onClick={() => onDelete(plan)} aria-label={`מחיקת ${name}`} className={`${ACTION} hover:text-loss`}>
            <Trash2 className="h-4 w-4" aria-hidden />
            מחיקה
          </button>
        </div>
      </header>

      {(showLoss || showPositions || sessions.length > 0) && (
        <ul className="m-0 mt-5 flex list-none flex-wrap gap-2 p-0" aria-label="נתוני התוכנית">
          {showLoss && <Fact>הפסד יומי <b dir="ltr" className="num-mono font-semibold text-text-primary">{plan.maxDailyLoss}%</b></Fact>}
          {showPositions && <Fact>מקסימום עסקאות <b dir="ltr" className="num-mono font-semibold text-text-primary">{plan.maxPositions}</b></Fact>}
          {sessions.map((session) => <Fact key={session}>{session}</Fact>)}
        </ul>
      )}

      <div
        data-export-hide="true"
        role="tablist"
        aria-label="סעיפי התוכנית"
        dir="rtl"
        onKeyDown={onTabsKey}
        className="mt-6 flex flex-wrap gap-x-1 border-b border-border-primary"
      >
        {sections.map((section) => {
          const selected = section.id === activeSection;
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              id={`plan-tab-${section.id}`}
              data-section={section.id}
              aria-selected={selected}
              aria-controls="plan-section-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => onSection(section.id)}
              className={`shrink-0 cursor-pointer border-b-2 px-3 py-2 text-sm font-medium ${selected ? 'border-accent-primary text-text-primary' : 'border-transparent text-text-muted hover:text-text-secondary'} ${FOCUS}`}
            >
              {section.label}
            </button>
          );
        })}
      </div>

      <div id="plan-section-panel" role="tabpanel" aria-labelledby={`plan-tab-${activeSection}`} data-section={activeSection} className="pt-5">
        {visible.map((section) => (
          <section key={section.id} className={exporting ? 'border-t border-border-primary py-5 first:border-t-0 first:pt-0' : ''}>
            {exporting && <h3 className="mb-3 text-sm font-semibold text-text-secondary">{section.label}</h3>}
            <SectionBody id={section.id} plan={plan} />
          </section>
        ))}
      </div>
    </article>
  );
}
