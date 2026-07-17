import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellRing, BellOff, Send, NotebookPen, BarChart3, CalendarClock } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import SelectDropdown from '../shared/SelectDropdown';
import { subscribeToUserSetting, setUserSetting } from '../../services/firestoreService';
import {
  pushSupported, subscribeToPush, unsubscribeFromPush, sendTestPush,
  getNotifySchedule, saveNotifySchedule,
} from '../../services/pushService';

// Push notifications are ON by default; the user can turn them off here.
const DEFAULTS = { pushEnabled: true, tradeOpenAlerts: true };

// Journal reminder / daily summary / economic calendar defaults — mirrors the
// worker's DEFAULT_SETTINGS (#219).
const SCHEDULE_DEFAULTS = {
  journal: { enabled: false, time: '21:00' },
  summary: { enabled: false, time: '22:00' },
  calendar: { enabled: false },
};

// Small right-aligned toggle, matching the main push toggle's look.
function MiniToggle({ on }) {
  return (
    <div className={`w-10 h-5 rounded-full transition-colors ${on ? 'bg-accent-primary' : 'bg-border-primary'} relative shrink-0`}>
      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${on ? 'right-0.5' : 'left-0.5'}`} />
    </div>
  );
}

// Half-hour steps — the worker cron ticks every 10 minutes, so round times
// always land inside a tick window and the list stays short and scannable.
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const t = `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`;
  return { value: t, label: t };
});

// Styled time picker (SelectDropdown, like every other picker in the app) —
// the native <input type="time"> looked dated and inconsistent per browser.
// A legacy free-typed value (e.g. 00:21) is kept as an extra option so it
// still displays until the user picks a new one.
function TimeSelect({ value, onChange }) {
  const options = TIME_OPTIONS.some((o) => o.value === value)
    ? TIME_OPTIONS
    : [{ value, label: value }, ...TIME_OPTIONS];
  return (
    <div className="w-24">
      <SelectDropdown compact value={value} onChange={(v) => v && onChange(v)} options={options} />
    </div>
  );
}

// Scheduled pushes (journal reminder / daily summary / economic calendar).
// The worker's cron is driven by /notify-settings; Firestore keeps a mirror
// under notifications.schedule so other devices/hooks can read the state.
function ScheduleSection({ user }) {
  const [schedule, setSchedule] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getNotifySchedule()
      .then((s) => { if (!cancelled) setSchedule({ ...SCHEDULE_DEFAULTS, ...s }); })
      .catch(() => { if (!cancelled) setSchedule(SCHEDULE_DEFAULTS); });
    return () => { cancelled = true; };
  }, []);

  const update = async (next) => {
    setSaving(true);
    const prev = schedule;
    setSchedule(next);
    try {
      await saveNotifySchedule(next);
      setUserSetting(user.uid, 'notifications', { schedule: next }, true).catch(() => {});
    } catch (e) {
      setSchedule(prev);
      toast.error(e.message || 'השמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  if (!schedule) return null;

  const rows = [
    { key: 'journal', label: 'תזכורת מילוי יומן', Icon: NotebookPen, hasTime: true },
    { key: 'summary', label: 'סיכום יומי', Icon: BarChart3, hasTime: true },
    { key: 'calendar', label: 'אירועים כלכליים (שעה לפני)', Icon: CalendarClock, hasTime: false },
  ];

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] text-text-muted font-semibold">התראות מתוזמנות</p>
      {rows.map((row) => {
        const { key, label, hasTime } = row;
        const Icon = row.Icon;
        return (
        <div key={key} className="flex items-center justify-between gap-2 min-h-9">
          {/* Right side (RTL start): icon + label toggle the row */}
          <button
            onClick={() => update({ ...schedule, [key]: { ...schedule[key], enabled: !schedule[key].enabled } })}
            disabled={saving}
            className="flex items-center gap-2.5 text-sm text-text-primary cursor-pointer disabled:opacity-50"
          >
            <Icon className={`w-4 h-4 ${schedule[key].enabled ? 'text-accent-primary' : 'text-text-muted'}`} />
            <span className="text-right">{label}</span>
          </button>
          {/* Left side: time picker, then the toggle FLUSH at the far left
              (last in DOM = leftmost in RTL), per Avi's layout request. */}
          <div className="flex items-center gap-2">
            {hasTime && schedule[key].enabled && (
              <TimeSelect
                value={schedule[key].time}
                onChange={(v) => update({ ...schedule, [key]: { ...schedule[key], time: v } })}
              />
            )}
            <button
              onClick={() => update({ ...schedule, [key]: { ...schedule[key], enabled: !schedule[key].enabled } })}
              disabled={saving}
              className="cursor-pointer disabled:opacity-50"
              aria-label={label}
            >
              <MiniToggle on={schedule[key].enabled} />
            </button>
          </div>
        </div>
        );
      })}
    </div>
  );
}

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
    // Persist only the changed fields (merge:true) — writing the whole `settings`
    // closure could clobber a field changed elsewhere between renders.
    await setUserSetting(user.uid, 'notifications', updates, true);
  }, [user]);

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
      // Exchange credentials already live in the encrypted server-side store, so
      // the background poller can notify on closed trades without the client
      // re-sending any keys here.
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
      // NOTE: do NOT drop the stored exchange credentials here — they are now the
      // single source of truth for sync/balance/positions, so deleting them would
      // silently disconnect every exchange. Credentials are removed only on an
      // explicit exchange Disconnect.
      await save({ pushEnabled: false });
      toast('ההתראות כובו', { icon: <BellOff className="w-5 h-5 text-text-muted" /> });
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
      const r = await sendTestPush();
      if (r.sent > 0) {
        toast.success('נשלחה התראת בדיקה', { icon: <BellRing className="w-5 h-5 text-accent-primary" /> });
      } else if (!r.hasVapid) {
        toast.error('חסר מפתח חתימה בשרת (VAPID). פנה למפתח.');
      } else if (r.total === 0) {
        toast.error('המכשיר לא נרשם. כבה והפעל התראות מחדש.');
      } else {
        // Registered but delivery failed — surface the upstream reason.
        const reason = r.results?.[0]?.status
          ? `שגיאה ${r.results[0].status}${r.results[0].body ? `: ${r.results[0].body}` : ''}`
          : 'השליחה נכשלה';
        toast.error(`רשום ${r.total} מכשירים אך השליחה נכשלה — ${reason}`);
      }
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
                  <div className="pt-2 border-t border-border-primary/60">
                    <ScheduleSection user={user} />
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
