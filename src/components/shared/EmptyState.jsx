import { Inbox } from 'lucide-react';

export default function EmptyState({
  icon: Icon = Inbox,
  title = 'אין נתונים עדיין',
  description = '',
  action,
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="w-12 h-12 text-text-muted mb-4" />
      <h3 className="text-lg font-medium text-text-primary mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-text-muted mb-4 max-w-sm">{description}</p>
      )}
      {action}
    </div>
  );
}
