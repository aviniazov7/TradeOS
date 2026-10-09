import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { BellRing, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { setUserSetting } from '../../services/firestoreService';
import { pushSupported, subscribeToPush, getNotifySchedule, saveNotifySchedule } from '../../services/pushService';
import { withScheduleDefaults } from '../../utils/notifySchedule';

// Switch for the "high-impact USD event in about an hour" push, right where the
// economic calendar is. It is the same preference as the profile's
// "אירועים כלכליים (שעה לפני)" row (schedule.calendar) — one setting, two
// places. Turning it on also registers this device for push, asking the
// browser's permission first, so one tap is enough.
export default function CalendarAlertToggle() {
  const { user } = useAuth();
  const uid = user?.uid;
  const supported = pushSupported();
  const [schedule, setSchedule] = useState(null);
  const [permission, setPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported || !uid) return undefined;
    let cancelled = false;
    getNotifySchedule()
      .then((s) => { if (!cancelled) setSchedule(withScheduleDefaults(s)); })
      .catch(() => { if (!cancelled) setSchedule(withScheduleDefaults(null)); });
    return () => { cancelled = true; };
  }, [supported, uid]);

  if (!uid) return null;

  const wanted = schedule?.calendar?.enabled === true;
  const on = wanted && permission === 'granted';

  const persist = async (next) => {
    const saved = await saveNotifySchedule(next);
    setSchedule(withScheduleDefaults(saved || next));
    // Keep the Firestore mirror the profile page reads in step (best effort).
    setUserSetting(uid, 'notifications', { schedule: next }, true).catch(() => {});
  };

  const turnOn = async () => {
    let perm = permission;
    if (perm !== 'granted') {
      perm = await Notification.requestPermission();
      setPermission(perm);
    }
    if (perm !== 'granted') {
      toast.error('כדי לקבל את ההתראה צריך לאשר התראות לאתר בהגדרות הדפדפן');
      return;
    }
    await subscribeToPush();
    await persist({ ...withScheduleDefaults(schedule), calendar: { enabled: true } });
    setUserSetting(uid, 'notifications', { pushEnabled: true }, true).catch(() => {});
    toast.success('תקבל התראה שעה לפני כל אירוע USD חשוב');
  };

  const turnOff = async () => {
    await persist({ ...withScheduleDefaults(schedule), calendar: { enabled: false } });
    toast('ההתראה על אירועים כלכליים כובתה');
  };

  const toggle = async () => {
    if (busy || !schedule) return;
    setBusy(true);
    try {
      if (on) await turnOff(); else await turnOn();
    } catch (e) {
      toast.error(e?.message || 'העדכון נכשל. נסה שוב');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-border-primary bg-bg-secondary px-4 py-3">
      <span className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${on ? 'bg-accent-primary/15 text-accent-primary' : 'bg-bg-tertiary text-text-muted'}`}>
        <BellRing className="w-[18px] h-[18px]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-text-primary">התראה שעה לפני אירוע USD חשוב</div>
        <div className="text-xs text-text-muted leading-relaxed">
          {!supported
            ? 'הדפדפן הזה לא תומך בהתראות. באייפון: הוסף את TradeOS למסך הבית ופתח משם.'
            : permission === 'denied'
              ? 'ההתראות חסומות בדפדפן. אפשר אותן בהגדרות האתר כדי להפעיל.'
              : 'מגיעה לטלפון בעברית: שם האירוע, השעה בישראל, התחזית והנתון הקודם, עם אזהרה מתנודתיות.'}
        </div>
      </div>
      {supported && permission !== 'denied' && (
        <button type="button" onClick={toggle} disabled={busy || !schedule} role="switch" aria-checked={on}
          aria-label="התראה שעה לפני אירוע USD חשוב"
          className="shrink-0 cursor-pointer disabled:opacity-60">
          {busy ? (
            <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
          ) : (
            <span aria-hidden className={`block w-10 h-5 rounded-full transition-colors ${on ? 'bg-accent-primary' : 'bg-border-primary'} relative`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'right-0.5' : 'left-0.5'}`} />
            </span>
          )}
        </button>
      )}
    </div>
  );
}
