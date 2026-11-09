import { AlertTriangle } from 'lucide-react';

// Clear breach banner. Dismissal is owned by the journal page so the new-trade
// warning hides for the same Israel day. This is not a block.
export default function JournalRiskBanner({ notice, onDismiss }) {
  if (!notice) return null;
  return (
    <div
      role="alert"
      dir="rtl"
      data-testid="journal-risk-banner"
      className="mb-3 flex items-start gap-2 rounded-xl border border-loss/30 bg-loss/10 px-3 md:px-4 py-2.5 text-loss"
    >
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-loss" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-loss">{notice.title}</p>
        <ul className="mt-1 space-y-0.5">
          {notice.lines.map((line) => (
            <li key={line.id} className="text-xs font-medium text-loss">{line.text}</li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        data-testid="journal-risk-banner-dismiss"
        aria-label="הסתר להיום"
        className="shrink-0 h-11 px-3 rounded-lg border border-loss/30 text-xs font-semibold text-loss hover:bg-loss/15 transition-colors cursor-pointer"
      >
        הסתר להיום
      </button>
    </div>
  );
}
