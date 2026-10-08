import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { pushSupported, ensurePushRegistered } from '../services/pushService';
import { getUserSetting } from '../services/firestoreService';

/**
 * Keep this device's push subscription registered with the worker — checked on
 * every app open (re-sent when it changed, else at most once a day) for any
 * user who has already granted OS notification permission.
 *
 * Previously the only place that called subscribeToPush() was the settings page
 * (and exchange settings), so a user who enabled push but never revisited those
 * screens could silently fall off the worker's subscription list (e.g. the
 * subscription rotated/expired) — and then an admin couldn't reach them even
 * though "push is on". Running it app-wide keeps granted devices registered.
 *
 * Respects an explicit in-app opt-out (notifications.pushEnabled === false) and
 * never requests permission here (that needs a user gesture — see PushNudge).
 */
export function usePushAutoRegister() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user || !pushSupported()) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    let cancelled = false;
    (async () => {
      try {
        const s = await getUserSetting(user.uid, 'notifications').catch(() => null);
        if (cancelled || s?.pushEnabled === false) return; // honor explicit opt-out
        // Skips the network call when this exact subscription was registered
        // within the last day (see the marker in pushService) — re-registering
        // on every app open was a steady drain on the worker's KV writes.
        await ensurePushRegistered();
      } catch { /* best-effort — never block app load on push */ }
    })();
    return () => { cancelled = true; };
  }, [user]);
}
