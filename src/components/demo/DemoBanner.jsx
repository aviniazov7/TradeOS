import { FlaskConical, X } from 'lucide-react';
import { DEMO_BANNER_TEXT } from '../../utils/demoData';

// Sticky, on every signed-in page, so sample numbers are never mistaken for
// the account. Exit drops the overlay immediately; nothing was written.
export default function DemoBanner({ onExit }) {
  return (
    <div
      role="status"
      data-testid="demo-banner"
      className="sticky top-0 z-30 -mx-3 md:-mx-6 mb-3 px-3 md:px-6 py-2.5 border-b border-breakeven/30 bg-breakeven/15"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-text-primary leading-relaxed inline-flex items-start gap-2">
          <FlaskConical className="w-4 h-4 shrink-0 mt-0.5 text-breakeven" />
          <span>{DEMO_BANNER_TEXT}</span>
        </p>
        <button
          type="button"
          onClick={onExit}
          className="h-8 shrink-0 inline-flex items-center gap-1 px-2.5 rounded-lg text-xs font-bold border border-breakeven/40 text-text-primary hover:bg-breakeven/20 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
          יציאה ממצב דמו
        </button>
      </div>
    </div>
  );
}
