import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getUserSetting, setUserSetting } from '../services/firestoreService';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || '';

async function syncToWorker(method, path, body) {
  if (!WORKER_URL) return;
  try {
    await fetch(`${WORKER_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Worker sync is best-effort
  }
}

export function useTelegramAlerts() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load settings
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    Promise.all([
      getUserSetting(user.uid, 'telegram'),
      getUserSetting(user.uid, 'priceAlerts'),
    ]).then(([tg, pa]) => {
      setSettings(tg);
      setAlerts(pa?.alerts || []);
      setLoading(false);
    });
  }, [user]);

  const updateTelegramSettings = useCallback(async (data) => {
    if (!user) return;
    await setUserSetting(user.uid, 'telegram', data);
    setSettings(data);
  }, [user]);

  const addAlert = useCallback(async (alert) => {
    if (!user || !settings?.chatId) return;
    const newAlert = { ...alert, id: Date.now().toString(), active: true, createdAt: new Date().toISOString() };
    const updated = [...alerts, newAlert];
    await setUserSetting(user.uid, 'priceAlerts', { alerts: updated });
    setAlerts(updated);

    // Sync to Worker for 24/7 monitoring
    syncToWorker('POST', '/alerts', {
      chatId: settings.chatId,
      pair: newAlert.pair,
      targetPrice: newAlert.targetPrice,
      direction: newAlert.direction,
      id: newAlert.id,
    });
  }, [user, alerts, settings]);

  const removeAlert = useCallback(async (alertId) => {
    if (!user) return;
    const updated = alerts.filter((a) => a.id !== alertId);
    await setUserSetting(user.uid, 'priceAlerts', { alerts: updated });
    setAlerts(updated);

    // Sync to Worker
    if (settings?.chatId) {
      syncToWorker('DELETE', `/alerts/${settings.chatId}/${alertId}`);
    }
  }, [user, alerts, settings]);

  return { settings, alerts, loading, updateTelegramSettings, addAlert, removeAlert };
}
