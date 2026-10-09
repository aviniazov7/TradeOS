import { useState } from 'react';
import toast from 'react-hot-toast';
import { Mail } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { setUserProfile, timestamp } from '../../services/firestoreService';

// Opt-in for marketing email (updates and offers). Off unless the user turns it
// on, here or with the box on the signup form; every campaign email also has a
// one-click unsubscribe. Service emails (Premium receipts…) don't depend on it.
export default function MarketingEmailToggle() {
  const { user, profile } = useAuth();
  const on = profile?.marketingEmails === true;
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (!user || busy) return;
    setBusy(true);
    try {
      await setUserProfile(user.uid, { marketingEmails: !on, marketingEmailsAt: timestamp() });
      toast.success(on ? 'הוסרת מרשימת התפוצה' : 'נרשמת לעדכונים והטבות במייל');
    } catch {
      toast.error('העדכון נכשל. נסה שוב');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={toggle} disabled={busy} role="switch" aria-checked={on}
      className="w-full flex items-center justify-between gap-3 px-5 py-4 text-right hover:bg-bg-tertiary transition-colors cursor-pointer border-t border-border-primary disabled:opacity-60">
      <span className="flex items-center gap-3 min-w-0">
        <Mail className="w-5 h-5 text-text-muted shrink-0" />
        <span className="min-w-0">
          <span className="block text-sm text-text-primary">עדכונים והטבות במייל</span>
          <span className="block text-xs text-text-muted leading-relaxed">נשלח רק אם אישרת, ואפשר לבטל בכל רגע. הודעות שירות (כמו אישור Premium) לא תלויות בזה.</span>
        </span>
      </span>
      <span aria-hidden className={`w-10 h-5 rounded-full shrink-0 transition-colors ${on ? 'bg-accent-primary' : 'bg-border-primary'} relative`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'right-0.5' : 'left-0.5'}`} />
      </span>
    </button>
  );
}
