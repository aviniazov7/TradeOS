// Shared look of the development map page (kept apart from the components so
// fast refresh keeps working).

export const panel = 'rounded-2xl border border-border-primary bg-bg-secondary p-4 md:p-5 min-w-0';

// 70+ strong, 40–69 building, below 40 weak; null = not enough data.
export function scoreTone(score) {
  if (score == null) return { text: 'text-text-muted', color: 'var(--color-text-muted)', label: 'אין מספיק נתונים' };
  if (score >= 70) return { text: 'text-profit', color: 'var(--color-profit)', label: 'חזק' };
  if (score >= 40) return { text: 'text-breakeven', color: 'var(--color-breakeven)', label: 'בבנייה' };
  return { text: 'text-loss', color: 'var(--color-loss)', label: 'חלש' };
}
