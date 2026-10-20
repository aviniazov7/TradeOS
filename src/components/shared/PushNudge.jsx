import { useLayoutEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { pushSupported, subscribeToPush } from '../../services/pushService';
import { setUserSetting } from '../../services/firestoreService';
import { clearPushNudgeChrome, publishPushNudgeChrome } from '../../utils/floatingChrome';

const DISMISS_KEY = 'tradeos_pushNudgeDismissed';

/**
 * One-time nudge prompting installed users who haven't granted notification
 * permission yet to enable it. iOS only exposes pushSupported() in a standalone
 * (added-to-home-screen) PWA and requires a user gesture to request permission,
 * so this button is the only way to register those users for push.
 */
export default function PushNudge() {
  const { user } = useAuth();
  const [hidden, setHidden] = useState(() => {
    if (typeof Notification === 'undefined' || !pushSupported()) return true;
    if (Notification.permission !== 'default') return true; // already granted/denied → no nudge
    return localStorage.getItem(DISMISS_KEY) === '1';
  });
  const [busy, setBusy] = useState(false);
  const bannerRef = useRef(null);
  const visible = Boolean(user) && !hidden;

  // Tell the accessibility button (and the other phone chrome) how tall this
  // bar is, so they can sit above it instead of on its dismiss control.
  useLayoutEffect(() => {
    if (!visible) return undefined;
    const el = bannerRef.current;
    const sync = () => publishPushNudgeChrome(el?.getBoundingClientRect().height || 0);
    sync();
    if (!el || typeof ResizeObserver === 'undefined') return () => clearPushNudgeChrome();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      clearPushNudgeChrome();
    };
  }, [visible]);

  if (!visible) return null;

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        toast.error('ההרשאה נדחתה. אפשר להפעיל בהגדרות בכל עת.');
        localStorage.setItem(DISMISS_KEY, '1');
        setHidden(true);
        return;
      }
      await subscribeToPush();
      await setUserSetting(user.uid, 'notifications', { pushEnabled: true }, true);
      toast.success('ההתראות הופעלו 🔔');
      setHidden(true);
    } catch (e) {
      toast.error(e.message || 'הפעלת ההתראות נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setHidden(true);
  };

  return (
    <div
      ref={bannerRef}
      dir="rtl"
      data-testid="push-nudge"
      className="fixed left-1/2 -translate-x-1/2 z-[90] bottom-[calc(env(safe-area-inset-bottom,0px)+80px)] lg:bottom-6 w-[calc(100%-1.5rem)] max-w-md
                 flex items-center gap-3 px-3 py-3 rounded-2xl bg-bg-overlay border border-border-primary shadow-lg"
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-accent-primary/15 flex-shrink-0">
        <Bell className="w-5 h-5 text-accent-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text-primary leading-tight">הפעל התראות</p>
        <p className="text-xs text-text-secondary leading-tight mt-0.5">קבל עדכונים חשובים גם כשהאפליקציה סגורה</p>
      </div>
      <button
        type="button"
        onClick={enable}
        disabled={busy}
        className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-accent-primary text-bg-primary text-sm font-semibold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50"
      >
        {busy ? '...' : 'הפעל'}
      </button>
      <button
        type="button"
        onClick={dismiss}
        data-testid="push-nudge-dismiss"
        className="relative z-10 shrink-0 grid h-11 w-11 place-items-center rounded-xl text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors cursor-pointer"
        aria-label="סגור"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
