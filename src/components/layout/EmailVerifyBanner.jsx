import { useState } from 'react';
import toast from 'react-hot-toast';
import { MailCheck, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { authErrorHe } from '../../utils/authErrors';

const DISMISS_KEY = 'tradeos_verify_banner_dismissed';

// Reminder for email/password accounts that haven't confirmed their address.
// A nudge, not a gate: nothing in the app is blocked while unverified.
// Dismissing hides it for the rest of the browser session.
export default function EmailVerifyBanner() {
  const { user, needsEmailVerification, resendVerification, checkEmailVerified } = useAuth();
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });
  const [busy, setBusy] = useState(false);

  if (!needsEmailVerification || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode */ }
  };
  const resend = async () => {
    setBusy(true);
    try {
      await resendVerification();
      toast.success('שלחנו שוב את קישור האימות');
    } catch (err) {
      toast.error(authErrorHe(err, 'השליחה נכשלה. נסה שוב בעוד כמה דקות'));
    } finally {
      setBusy(false);
    }
  };
  const check = async () => {
    setBusy(true);
    try {
      if (await checkEmailVerified()) toast.success('האימייל אומת, תודה!');
      else toast.error('עדיין לא אומת. לחץ על הקישור במייל ונסה שוב');
    } catch {
      toast.error('הבדיקה נכשלה. נסה שוב');
    } finally {
      setBusy(false);
    }
  };

  const btn = 'h-7 px-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50';
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-accent-primary/30 bg-accent-primary/10 px-3 py-2.5">
      <MailCheck className="w-4 h-4 text-accent-hover shrink-0" aria-hidden />
      <p className="flex-1 min-w-[12rem] text-sm text-text-secondary">
        אמת את כתובת האימייל שלך. שלחנו קישור ל-<span dir="ltr" className="text-text-primary">{user?.email}</span>
      </p>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={check} disabled={busy} className={`${btn} bg-accent-muted hover:bg-accent-primary text-white`}>
          אימתתי
        </button>
        <button type="button" onClick={resend} disabled={busy} className={`${btn} text-text-secondary hover:text-text-primary hover:bg-white/5`}>
          שלח שוב
        </button>
        <button type="button" onClick={dismiss} aria-label="הסתר עד הכניסה הבאה" title="הסתר"
          className="w-7 h-7 grid place-items-center rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 cursor-pointer">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
