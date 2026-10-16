import { useState } from 'react';
import { Bell, ShieldCheck } from 'lucide-react';
import { demoFeed } from '../../../functions/adminNotifications.mjs';
import AdminNotifications from './AdminNotifications';

// Unauthenticated sample of the admin notifications tab. Registered only in
// dev and on a hosting preview built with VITE_ADMIN_NOTIF_PREVIEW=1, so the
// production bundle does not expose it. Sample data never touches Firestore.
export default function AdminNotificationsPreview() {
  const [unread, setUnread] = useState(() => demoFeed().filter((item) => !item.read).length);
  return (
    <div dir="rtl" className="min-h-screen p-3 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-accent-primary/12 border border-accent-primary/20 grid place-items-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-accent-primary" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-bold text-text-primary leading-tight">ניהול</h1>
              <p className="text-xs text-text-secondary truncate">התראות · תצוגת דמו</p>
            </div>
          </div>
          <button
            type="button"
            data-testid="admin-notif-bell"
            aria-label={unread > 0 ? `התראות, ${unread} שלא נקראו` : 'התראות'}
            className="relative w-11 h-11 shrink-0 rounded-xl border border-border-primary bg-bg-tertiary text-text-secondary grid place-items-center"
          >
            <Bell className="w-[18px] h-[18px]" />
            {unread > 0 && (
              <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-loss text-white text-[10px] font-bold grid place-items-center num-mono">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>
        </div>
        <AdminNotifications demo settingsInitiallyOpen onUnreadChange={setUnread} />
      </div>
    </div>
  );
}
