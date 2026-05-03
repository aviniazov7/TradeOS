const BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
const BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

export async function sendTelegramMessage(chatId, text) {
  const res = await fetch(`${BASE}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.description || 'שגיאה בשליחת הודעה');
  }
  return true;
}

/**
 * Find chat ID from a user who sent /start with a specific uid parameter.
 * Deep link: https://t.me/BOT?start=FIREBASE_UID
 * Telegram sends the bot: "/start FIREBASE_UID"
 */
export async function findChatIdByUid(uid) {
  const res = await fetch(`${BASE}/getUpdates?limit=100`);
  if (!res.ok) throw new Error('שגיאה בחיבור לבוט');
  const data = await res.json();

  if (!data.ok || !data.result?.length) {
    throw new Error('לא נמצאה הודעת Start. שלח /start לבוט ונסה שוב.');
  }

  // Search from newest to oldest for /start with matching uid
  for (let i = data.result.length - 1; i >= 0; i--) {
    const msg = data.result[i].message;
    if (!msg?.text) continue;
    if (msg.text === `/start ${uid}` || msg.text === '/start') {
      return msg.chat.id;
    }
  }

  throw new Error('לא נמצאה הודעת Start. שלח /start לבוט ונסה שוב.');
}
