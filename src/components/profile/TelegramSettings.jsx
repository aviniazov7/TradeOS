import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, ExternalLink, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { getUserSetting, setUserSetting } from '../../services/firestoreService';

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME;
const WORKER_URL = import.meta.env.VITE_WORKER_URL || '';

export default function TelegramSettings() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    getUserSetting(user.uid, 'telegram').then((data) => {
      if (data?.connected) {
        setEnabled(true);
        setVerified(true);
      }
      setLoading(false);
    });
  }, [user]);

  const deepLink = user ? `https://t.me/${BOT_USERNAME}?start=${user.uid}` : '#';

  const handleToggle = async () => {
    const newVal = !enabled;
    setEnabled(newVal);
    if (!newVal) {
      await setUserSetting(user.uid, 'telegram', { chatId: '', connected: false });
      setVerified(false);
    }
  };

  const handleVerify = async () => {
    if (!user || !WORKER_URL) return;
    setVerifying(true);
    try {
      const res = await fetch(`${WORKER_URL}/chatid/${user.uid}`);
      if (!res.ok) throw new Error('לא נמצא חיבור. שלח /start לבוט ונסה שוב.');
      const { chatId } = await res.json();
      await setUserSetting(user.uid, 'telegram', { chatId: String(chatId), connected: true });
      setVerified(true);
      toast.success('טלגרם מחובר בהצלחה!');
    } catch (err) {
      toast.error(err.message || 'שגיאה באימות');
    } finally {
      setVerifying(false);
    }
  };

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
                <div className="space-y-3">
                  <p className="text-xs text-text-muted text-center">חבר את הטלגרם שלך ב-2 צעדים:</p>

                  <a
                    href={deepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-[#0088cc] text-white text-sm font-medium hover:bg-[#0077b3] transition-colors"
                  >
                    <MessageSquare className="w-4 h-4" />
                    1. פתח את הבוט ושלח Start
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <button
                    onClick={handleVerify}
                    disabled={verifying}
                    className="w-full py-2.5 rounded-lg bg-accent-primary text-bg-primary text-sm font-medium hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {verifying ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        מאמת...
                      </>
                    ) : (
                      '2. אמת חיבור'
                    )}
                  </button>
                </div>
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
