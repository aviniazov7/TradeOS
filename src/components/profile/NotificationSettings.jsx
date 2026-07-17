import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellRing, BellOff, Send, NotebookPen, BarChart3, CalendarClock, Plus, Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeToUserSetting, setUserSetting } from '../../services/firestoreService';
import {
  pushSupported, subscribeToPush, unsubscribeFromPush, sendTestPush,
  getNotifySchedule, saveNotifySchedule, listPriceAlerts, addPriceAlert, deletePriceAlert,
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
        <div key={key} className="flex items-center justify-between gap-2">
          <button
            onClick={() => update({ ...schedule, [key]: { ...schedule[key], enabled: !schedule[key].enabled } })}
            disabled={saving}
            className="flex items-center gap-2.5 flex-1 text-sm text-text-primary cursor-pointer disabled:opacity-50"
          >
            <Icon className={`w-4 h-4 ${schedule[key].enabled ? 'text-accent-primary' : 'text-text-muted'}`} />
            <span className="flex-1 text-right">{label}</span>
            <MiniToggle on={schedule[key].enabled} />
          </button>
          {hasTime && schedule[key].enabled && (
            <input
              type="time"
              value={schedule[key].time}
              onChange={(e) => e.target.value && update({ ...schedule, [key]: { ...schedule[key], time: e.target.value } })}
              className="bg-bg-secondary border border-border-primary rounded-lg px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-primary"
            />
          )}
        </div>
        );
      })}
    </div>
  );
}

// Price alerts — created here in the app, checked by the worker cron every 10
// minutes and delivered as Web Push (used to require connecting the bot).
function PriceAlertsSection() {
  const [alerts, setAlerts] = useState([]);
  const [pair, setPair] = useState('');
  const [price, setPrice] = useState('');
  const [direction, setDirection] = useState('above');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listPriceAlerts().then((a) => setAlerts(a.filter((x) => x.active !== false))).catch(() => {});
  }, []);

  const add = async () => {
    const p = pair.trim().toUpperCase();
    const target = parseFloat(price);
    if (!p || !(target > 0)) { toast.error('מלא מטבע ומחיר יעד'); return; }
    setBusy(true);
    try {
      const normalized = p.endsWith('USDT') ? p : `${p}USDT`;
      const id = await addPriceAlert({ pair: normalized, targetPrice: target, direction });
      setAlerts((a) => [...a, { id, pair: normalized, targetPrice: target, direction, active: true }]);
      setPair(''); setPrice('');
      toast.success('ההתראה נוצרה — תקבל Push כשהמחיר יגיע ליעד');
    } catch (e) {
      toast.error(e.message || 'יצירת ההתראה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    const prev = alerts;
    setAlerts((a) => a.filter((x) => x.id !== id));
    try { await deletePriceAlert(id); } catch { setAlerts(prev); toast.error('המחיקה נכשלה'); }
  };

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] text-text-muted font-semibold">התראות מחיר</p>
      {alerts.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-2 bg-bg-secondary border border-border-primary rounded-lg px-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            {a.direction === 'above'
              ? <TrendingUp className="w-4 h-4 text-profit" />
              : <TrendingDown className="w-4 h-4 text-loss" />}
            <span className="font-semibold text-text-primary">{a.pair.replace('USDT', '')}</span>
            <span className="text-xs text-text-muted" dir="ltr">{a.direction === 'above' ? '≥' : '≤'} ${a.targetPrice}</span>
          </div>
          <button onClick={() => remove(a.id)} className="p-1 text-text-muted hover:text-loss cursor-pointer" title="מחק">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <input
          value={pair}
          onChange={(e) => setPair(e.target.value)}
          placeholder="BTC"
          className="w-20 bg-bg-secondary border border-border-primary rounded-lg px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent-primary uppercase"
        />
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          className="bg-bg-secondary border border-border-primary rounded-lg px-1.5 py-1.5 text-xs text-text-primary outline-none cursor-pointer"
        >
          <option value="above">מעל</option>
          <option value="below">מתחת</option>
        </select>
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="מחיר יעד"
          type="number"
          min="0"
          className="flex-1 min-w-0 bg-bg-secondary border border-border-primary rounded-lg px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent-primary"
          dir="ltr"
        />
        <button
          onClick={add}
          disabled={busy}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-accent-primary/10 border border-accent-primary/30 text-accent-primary text-xs font-semibold hover:bg-accent-primary/20 transition-colors cursor-pointer disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" /> הוסף
        </button>
      </div>
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
                  <div className="pt-2 border-t border-border-primary/60">
                    <PriceAlertsSection />
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
