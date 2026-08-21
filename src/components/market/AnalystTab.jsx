import { Link } from 'react-router-dom';
import { BookOpen, ArrowLeft } from 'lucide-react';
import { useJournalContext } from '../../contexts/JournalContext';
import AnalystInsights from '../journal/AnalystInsights';

/**
 * The same deterministic analysis the journal's AI modal shows, on the TradeAI
 * page. Trades come from the page so there is one subscription for all three
 * tabs, and the component is only mounted while its own tab is selected.
 */
export default function AnalystTab({ heightClass, trades }) {
  const { activeJournal } = useJournalContext();
  const list = trades || [];

  return (
    <div className={`max-w-2xl mx-auto w-full ${heightClass} overflow-y-auto rounded-2xl border border-border-primary bg-bg-secondary/40 p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <div>
          <h2 className="text-sm font-bold text-text-primary">האנליסט שלך</h2>
          <p className="text-[11px] text-text-muted mt-0.5">
            נמדד על {activeJournal?.name || 'היומן הפעיל'} — כל המספרים מחושבים מהעסקאות שלך, לא נכתבים על ידי מודל.
          </p>
        </div>
        <Link
          to="/journal?ai=1"
          className="inline-flex items-center gap-1 text-[11px] text-accent-primary hover:text-accent-hover"
        >
          לניתוח AI מלא <ArrowLeft className="w-3 h-3" />
        </Link>
      </div>

      {!list.length && (
        <div className="flex items-start gap-3 rounded-xl border border-border-primary bg-bg-secondary p-4">
          <BookOpen className="w-5 h-5 text-text-muted shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-text-primary">אין עדיין עסקאות ביומן הזה</p>
            <p className="text-xs text-text-secondary mt-0.5">
              האנליסט מודד את מה שבאמת עשית מול התוכנית שהגדרת, אז הוא מתחיל לעבוד ברגע שיש מה למדוד.
            </p>
            <Link to="/journal?new=1" className="inline-flex items-center gap-1 text-xs text-accent-primary mt-2">
              להוספת עסקה <ArrowLeft className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}

      {list.length > 0 && <AnalystInsights trades={list} />}
    </div>
  );
}
