import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToUserSetting, setUserSetting } from '../services/firestoreService';

const DEFAULT_SETTINGS = {
  enabled: false,
  morningTime: '08:00',
  eveningTime: '21:00',
};

export function useNotifications() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const [loading, setLoading] = useState(true);

  // Load settings from Firestore
  useEffect(() => {
    if (!user) { setSettings(DEFAULT_SETTINGS); setLoading(false); return; }

    const unsub = subscribeToUserSetting(user.uid, 'notifications', (data) => {
      if (data) {
        setSettings({ ...DEFAULT_SETTINGS, ...data });
      } else {
        setSettings(DEFAULT_SETTINGS);
      }
      setLoading(false);
    });

    return unsub;
  }, [user]);

  // Request notification permission
  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return 'denied';
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  // Save settings to Firestore
  const updateSettings = useCallback(async (updates) => {
    if (!user) return;
    const newSettings = { ...settings, ...updates };
    await setUserSetting(user.uid, 'notifications', newSettings);
  }, [user, settings]);

  // Toggle enabled (request permission if needed)
  const toggleEnabled = useCallback(async () => {
    if (!settings.enabled) {
      // Enabling — request permission first
      const perm = await requestPermission();
      if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'dismissed';
      await updateSettings({ enabled: true });
      return 'enabled';
    } else {
      // Disabling
      await updateSettings({ enabled: false });
      return 'disabled';
    }
  }, [settings.enabled, requestPermission, updateSettings]);

  // Show notification via service worker or Notification API
  const showNotification = useCallback((title, body, url) => {
    if (permission !== 'granted') return;
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, {
          body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          dir: 'rtl',
          lang: 'he',
          data: { url },
        });
      });
    } else if (typeof Notification !== 'undefined') {
      new Notification(title, { body, icon: '/icon-192.png', dir: 'rtl', lang: 'he' });
    }
  }, [permission]);

  // Test notification
  const sendTestNotification = useCallback(() => {
    if (permission !== 'granted') {
      return false;
    }
    showNotification('TradeOS 🔔', 'ההתראות עובדות! תקבל תזכורת בשעות שנבחרו.', '/profile');
    return true;
  }, [permission, showNotification]);

  // Schedule check — runs every minute while app is open
  useEffect(() => {
    if (!settings.enabled || permission !== 'granted') return;

    const isWithinWindow = (targetTime) => {
      const now = new Date();
      const [h, m] = targetTime.split(':').map(Number);
      const target = new Date(now);
      target.setHours(h, m, 0, 0);
      const diff = now - target;
      return diff >= 0 && diff < 120000; // within 2 minutes
    };

    const checkTime = () => {
      const todayKey = new Date().toISOString().slice(0, 10);

      // Cleanup old notification keys (older than 7 days)
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith('tradeos_notif_') && !key.includes(todayKey)) {
          localStorage.removeItem(key);
        }
      }

      // Check morning
      if (isWithinWindow(settings.morningTime)) {
        const shownKey = `tradeos_notif_morning_${todayKey}`;
        if (!localStorage.getItem(shownKey)) {
          localStorage.setItem(shownKey, '1');
          showNotification('בוקר טוב! ☀️', 'הגיע הזמן למלא את יומן הבוקר', '/mentality/morning');
        }
      }

      // Check evening
      if (isWithinWindow(settings.eveningTime)) {
        const shownKey = `tradeos_notif_evening_${todayKey}`;
        if (!localStorage.getItem(shownKey)) {
          localStorage.setItem(shownKey, '1');
          showNotification('ערב טוב! 🌙', 'הגיע הזמן למלא את יומן הערב', '/mentality/evening');
        }
      }
    };

    // Check immediately and then every 30 seconds
    checkTime();
    const interval = setInterval(checkTime, 30000);
    return () => clearInterval(interval);
  }, [settings.enabled, settings.morningTime, settings.eveningTime, permission, showNotification]);

  return {
    settings,
    permission,
    loading,
    toggleEnabled,
    updateSettings,
    requestPermission,
    sendTestNotification,
  };
}
