import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LifeBuoy, Send, Loader2, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { getUserSetting } from '../../services/firestoreService';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://trade-os.tradeos.workers.dev';
const MAX_LEN = 2000;
const MIN_LEN = 3;

export default function ContactDeveloper() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [telegramConnected, setTelegramConnected] = useState(true);

  useEffect(() => {
    if (!user || !open) return;
    getUserSetting(user.uid, 'telegram')
      .then((data) => setTelegramConnected(!!data?.connected))
      .catch(() => setTelegramConnected(true));
  }, [user, open]);

  const trimmedLen = message.trim().length;
  const canSend = !sending && trimmedLen >= MIN_LEN && trimmedLen <= MAX_LEN;

  const handleSend = async () => {
    const trimmed = message.trim();
    if (trimmed.length < MIN_LEN) {
      toast.error(`ההודעה חייבת להכיל לפחות ${MIN_LEN} תווים`);
      return;
    }
    if (trimmed.length > MAX_LEN) {
      toast.error(`ההודעה חורגת מ-${MAX_LEN} תווים`);
      return;
    }
    if (!user) {
      toast.error('יש להתחבר כדי לשלוח הודעה');
      return;
    }
    if (!WORKER_URL) {
      toast.error('שירות יצירת קשר אינו זמין כרגע');
      return;
    }

    setSending(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`${WORKER_URL}/contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          message: trimmed,
          displayName: user.displayName || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'שגיאה בשליחת ההודעה');
      }

      toast.success('ההודעה נשלחה');
      setMessage('');
      setOpen(false);
    } catch (err) {
      console.error('Contact developer send failed:', err);
      toast.error(err.message || 'שגיאה בשליחת ההודעה');
    } finally {
      setSending(false);
    }
  };

  if (!WORKER_URL) return null;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 text-sm text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer border-b border-border-primary"
      >
        <LifeBuoy className="w-5 h-5 text-text-muted" />
        תמיכה ומשוב
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-b border-border-primary"
          >
            <div className="px-5 py-4 space-y-3 bg-bg-tertiary/50">
              <p className="text-xs text-text-muted">
                דווח על באג, שלח בקשת תכונה או כל משוב אחר. הצוות יקבל את פנייתך ויחזור אליך בהקדם.
              </p>

              {!telegramConnected && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[#0088cc]/10 border border-[#0088cc]/30">
                  <Info className="w-4 h-4 text-[#0088cc] flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-[#0088cc] leading-relaxed">
                    לקבלת מענה מהיר ומעקב, מומלץ לחבר את חשבון הטלגרם בסעיף <b>בוט Telegram</b> למעלה.
                  </p>
                </div>
              )}

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX_LEN))}
                placeholder="כתוב את ההודעה שלך כאן..."
                rows={5}
                maxLength={MAX_LEN}
                disabled={sending}
                className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors resize-none disabled:opacity-50"
              />

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-muted">
                  {trimmedLen}/{MAX_LEN}
                </span>
                <button
                  onClick={handleSend}
                  disabled={!canSend}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-primary text-bg-primary text-sm font-semibold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      שולח...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      שלח
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
