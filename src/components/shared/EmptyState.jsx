import { Inbox } from 'lucide-react';

export default function EmptyState({
  icon: Icon = Inbox,
  title = 'אין נתונים עדיין',
  description = '',
  action,
  // Convenience pair for the common case — renders the app-standard primary
  // button so call sites don't each rebuild the same markup. `action` (a full
  // custom node) wins when both are given.
  actionLabel,
  onAction,
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="w-12 h-12 text-text-muted mb-4" />
      <h3 className="text-lg font-medium text-text-primary mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-text-muted mb-4 max-w-sm">{description}</p>
      )}
      {action}
      {!action && actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-4 py-2 rounded-lg bg-accent-primary text-bg-primary text-sm font-semibold hover:bg-accent-hover transition-colors cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
