import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellRing, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeToUserSetting, setUserSetting, getUserSetting } from '../../services/firestoreService';
import { pushSupported, subscribeToPush, unsubscribeFromPush, sendTestPush, registerExchangeForPush, unregisterExchangeForPush } from '../../services/pushService';

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
      // Register any connected exchange so the background poller can notify on
      // closed trades even when the app is shut.
      const exchanges = await getUserSetting(user.uid, 'exchanges').catch(() => null);
      if (exchanges) {
        for (const [id, conf] of Object.entries(exchanges)) {
          if (conf?.apiKey && conf?.apiSecret) registerExchangeForPush(id, conf.apiKey, conf.apiSecret, conf.passphrase);
        }
      }
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
      await unregisterExchangeForPush(); // drop stored exchange keys
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
      // Make sure THIS device is registered before testing — the toggle state
      // is synced from Firestore across devices, so a device that never ran
      // the enable flow won't have a subscription stored on the worker yet.
      await subscribeToPush();
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

  // If push is enabled (synced from another device) and permission is already
  // granted here, register this device with the worker so it actually receives
  // pushes — otherwise the toggle reads "on" but no subscription exists.
  useEffect(() => {
    if (isActive) subscribeToPush().catch(() => {});
  }, [isActive]);

  if (!supported) return null;

  return (
    <div>
      <button
        onClick={isActive ? disablePush : enablePush}
        disabled={busy}
        className="w-full flex items-center justify-between px-5 py-4 text-sm text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer border-b border-border-primary disabled:opacity-50"
      >
        <div className="flex items-center gap-3">
          {isActive
            ? <BellRing className="w-5 h-5 text-accent-primary" />
            : <Bell className="w-5 h-5 text-text-muted" />}
          התראות Push
        </div>
        <div className={`w-10 h-5 rounded-full transition-colors ${isActive ? 'bg-accent-primary' : 'bg-border-primary'} relative`}>
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${isActive ? 'right-0.5' : 'left-0.5'}`} />
        </div>
      </button>

      <AnimatePresence>
        {(isActive || permission === 'denied') && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-b border-border-primary"
          >
            <div className="px-5 py-4 space-y-3 bg-bg-tertiary/50">
              {permission === 'denied' ? (
                <p className="text-xs text-loss bg-loss/10 border border-loss/30 rounded-lg p-2">
                  ההתראות חסומות בדפדפן. כדי להפעיל — אשר התראות עבור האתר בהגדרות הדפדפן/המכשיר.
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-xs text-profit">
                    <BellRing className="w-4 h-4" />
                    <span>מופעל — תקבל התראה כשנפתחת עסקה חדשה, גם כשהאפליקציה סגורה</span>
                  </div>
                  <button
                    onClick={test}
                    disabled={busy}
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-accent-primary/10 text-accent-primary text-sm font-medium hover:bg-accent-primary/20 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    שלח התראת בדיקה
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
