import { Link } from 'react-router-dom';
import { BookOpen, ArrowLeft, Sparkles } from 'lucide-react';
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
    <div className={`w-full ${heightClass} overflow-y-auto overscroll-contain rounded-2xl border border-border-primary bg-bg-secondary`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border-primary">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text-primary">האנליסט שלך</h2>
          <p className="text-xs text-text-muted mt-0.5 truncate">
            {activeJournal?.name || 'היומן הפעיל'} · מחושב ישירות מהעסקאות שלך
          </p>
        </div>
        <Link
          to="/journal?ai=1"
          className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-accent-primary/12 border border-accent-primary/30 text-accent-hover text-xs font-bold hover:bg-accent-primary/20 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" /> ניתוח AI מלא
        </Link>
      </div>

      <div className="p-4 md:p-5 max-w-4xl mx-auto">
        {list.length > 0 ? <AnalystInsights trades={list} /> : (
          <div className="flex flex-col items-center text-center gap-3 py-12">
            <span className="w-12 h-12 rounded-2xl grid place-items-center bg-bg-tertiary border border-border-primary">
              <BookOpen className="w-6 h-6 text-text-muted" />
            </span>
            <div>
              <p className="text-sm font-bold text-text-primary">אין עדיין עסקאות ביומן הזה</p>
              <p className="text-[13px] text-text-secondary mt-1 max-w-sm">
                האנליסט מודד את מה שעשית בפועל מול התוכנית שלך — הוא מתחיל לעבוד מהעסקה הראשונה.
              </p>
            </div>
            <Link to="/journal?new=1" className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-accent-muted hover:bg-accent-primary text-white text-sm font-bold transition-colors">
              הוספת עסקה <ArrowLeft className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
