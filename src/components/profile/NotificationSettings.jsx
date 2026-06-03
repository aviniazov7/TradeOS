import { useState, useEffect, useCallback } from 'react';
import { Bell, BellRing, BellOff, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeToUserSetting, setUserSetting } from '../../services/firestoreService';
import { pushSupported, subscribeToPush, unsubscribeFromPush, sendTestPush } from '../../services/pushService';

// Push notifications are ON by default; the user can turn them off here.
const DEFAULTS = { pushEnabled: true, tradeOpenAlerts: true };

export default function NotificationSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(DEFAULTS);
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const [busy, setBusy] = useState(false);
  const supported = pushSupported();

  useEffect(() => {
    if (!user) return;
    return subscribeToUserSetting(user.uid, 'notifications', (data) => {
      setSettings({ ...DEFAULTS, ...(data || {}) });
    });
  }, [user]);

  const save = useCallback(async (updates) => {
    if (!user) return;
    setSettings((s) => ({ ...s, ...updates }));
    await setUserSetting(user.uid, 'notifications', { ...settings, ...updates }, true);
  }, [user, settings]);

  // Enabling: ask permission (needs a user gesture) → subscribe → persist.
  const enablePush = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        toast.error('ההרשאה נדחתה. אפשר התראות בהגדרות הדפדפן.');
        return;
      }
      await subscribeToPush();
      await save({ pushEnabled: true });
      toast.success('ההתראות הופעלו');
    } catch (e) {
      toast.error(e.message || 'הפעלת ההתראות נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const disablePush = async () => {
    setBusy(true);
    try {
      await unsubscribeFromPush();
      await save({ pushEnabled: false });
      toast('ההתראות כובו', { icon: '🔕' });
    } catch (e) {
      toast.error(e.message || 'כיבוי ההתראות נכשל');
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      const sent = await sendTestPush();
      if (sent > 0) toast.success('נשלחה התראת בדיקה 🔔');
      else toast.error('לא נמצא מכשיר רשום — הפעל התראות מחדש');
    } catch (e) {
      toast.error(e.message || 'שליחת הבדיקה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const isActive = settings.pushEnabled && permission === 'granted';

  if (!supported) {
    return (
      <div className="bg-bg-secondary border border-border-primary rounded-xl p-4 flex items-center gap-3">
        <BellOff className="w-5 h-5 text-text-muted" />
        <div className="text-sm text-text-secondary">הדפדפן לא תומך בהתראות Push.</div>
      </div>
    );
  }

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${isActive ? 'bg-accent-primary/15 text-accent-primary' : 'bg-bg-tertiary text-text-muted'}`}>
          {isActive ? <BellRing className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-text-primary">התראות Push</div>
          <div className="text-xs text-text-secondary">
            {isActive ? 'מופעל — תקבל התראה כשנפתחת עסקה חדשה' : 'קבל התראות גם כשהאפליקציה סגורה'}
          </div>
        </div>
        <button
          onClick={isActive ? disablePush : enablePush}
          disabled={busy}
          className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer disabled:opacity-50 ${isActive ? 'bg-accent-primary' : 'bg-bg-tertiary border border-border-primary'}`}
          aria-label="הפעל/כבה התראות"
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${isActive ? 'right-0.5' : 'left-0.5'}`} />
        </button>
      </div>

      {permission === 'denied' && (
        <div className="text-xs text-loss bg-loss/10 border border-loss/30 rounded-lg p-2">
          ההתראות חסומות בדפדפן. כדי להפעיל — אשר התראות עבור האתר בהגדרות הדפדפן/המכשיר.
        </div>
      )}

      {isActive && (
        <button
          onClick={test}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-bg-tertiary border border-border-primary text-sm text-text-primary hover:bg-border-hover transition-colors cursor-pointer disabled:opacity-50"
        >
          <Send className="w-4 h-4" /> שלח התראת בדיקה
        </button>
      )}
    </div>
  );
}
