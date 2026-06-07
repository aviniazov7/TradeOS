import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, ExternalLink, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { getUserSetting, setUserSetting } from '../../services/firestoreService';
import { auth } from '../../services/firebase';

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'TradeOSAlerts_bot';
const WORKER_URL = import.meta.env.VITE_WORKER_URL || '';

export default function TelegramSettings() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [verified, setVerified] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    getUserSetting(user.uid, 'telegram').then((data) => {
      if (data?.connected) { setEnabled(true); setVerified(true); }
      setLoading(false);
    });
  }, [user]);

  const stopPolling = () => {
    clearInterval(pollRef.current);
    clearTimeout(timeoutRef.current);
    setWaiting(false);
  };

  const startPolling = () => {
    if (!user || !WORKER_URL) return;
    setWaiting(true);

    const check = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch(`${WORKER_URL}/chatid/${user.uid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const { chatId } = await res.json();
        await setUserSetting(user.uid, 'telegram', { chatId: String(chatId), connected: true });
        stopPolling();
        setVerified(true);
        toast.success('טלגרם מחובר בהצלחה! 🎉');
      } catch { /* keep polling */ }
    };

    pollRef.current = setInterval(check, 2500);
    // Stop after 90 seconds
    timeoutRef.current = setTimeout(() => {
      stopPolling();
      toast.error('לא זוהה חיבור. שלח /start לבוט ונסה שוב.');
    }, 90000);
  };

  const handleConnect = () => {
    const deepLink = `https://t.me/${BOT_USERNAME}?start=${user?.uid}`;
    window.open(deepLink, '_blank');
    startPolling();
  };

  const handleToggle = async () => {
    const newVal = !enabled;
    setEnabled(newVal);
    if (!newVal) {
      stopPolling();
      await setUserSetting(user.uid, 'telegram', { chatId: '', connected: false });
      setVerified(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), []);

  if (loading) return null;

  return (
    <div>
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-sm text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer border-b border-border-primary"
      >
        <div className="flex items-center gap-3">
          <MessageSquare className={`w-5 h-5 ${enabled ? 'text-[#0088cc]' : 'text-text-muted'}`} />
          בוט Telegram
        </div>
        <div className={`w-10 h-5 rounded-full transition-colors ${enabled ? 'bg-[#0088cc]' : 'bg-border-primary'} relative`}>
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? 'right-0.5' : 'left-0.5'}`} />
        </div>
      </button>

      <AnimatePresence>
        {enabled && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-b border-border-primary"
          >
            <div className="px-5 py-4 space-y-3 bg-bg-tertiary/50">
              {!verified ? (
                waiting ? (
                  <div className="flex flex-col items-center gap-3 py-2">
                    <Loader2 className="w-6 h-6 text-[#0088cc] animate-spin" />
                    <p className="text-xs text-text-muted text-center">ממתין לחיבור מהבוט...</p>
                    <button
                      onClick={stopPolling}
                      className="text-[10px] text-text-muted/60 underline cursor-pointer"
                    >
                      ביטול
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleConnect}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-[#0088cc] text-white text-sm font-medium hover:bg-[#0077b3] transition-colors cursor-pointer"
                  >
                    <MessageSquare className="w-4 h-4" />
                    חבר טלגרם
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs text-profit">
                    <Check className="w-4 h-4" />
                    <span>טלגרם מחובר</span>
                  </div>
                  <a
                    href={`https://t.me/${BOT_USERNAME}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-[#0088cc]/10 text-[#0088cc] text-sm font-medium hover:bg-[#0088cc]/20 transition-colors"
                  >
                    <MessageSquare className="w-4 h-4" />
                    פתח את הבוט
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <p className="text-[10px] text-text-muted text-center">
                    נהל התראות מחיר, בדוק טרנדינג ועוד — הכל בבוט הטלגרם
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
