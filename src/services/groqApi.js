import { getAuth } from 'firebase/auth';

const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://trade-os.tradeos.workers.dev';
const WORKER_URL = `${WORKER_BASE}/ai-chat`;
const PROJECT_DESC_URL = `${WORKER_BASE}/ai-project-desc`;

export async function fetchProjectDescription(coinName, symbol, retries = 2) {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('יש להתחבר כדי להשתמש בתכונה זו');

  // Force refresh so we never send a stale/expired token to the worker
  const idToken = await user.getIdToken(true);
  if (!idToken) throw new Error('יש להתחבר מחדש');

  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(PROJECT_DESC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ coinName, symbol }),
    });

    if (response.ok) {
      const data = await response.json().catch(() => null);
      if (!data) {
        throw new Error('השרת מחזיר תשובה לא צפויה. ייתכן שעדיין לא הותקנה הגרסה החדשה — נסה שוב בעוד רגע.');
      }
      return data.text || '';
    }

    // Read body once so we can distinguish quota-exceeded (don't retry) from
    // a transient rate-limit (retry with backoff).
    const err = response.ok ? null : await response.json().catch(() => ({}));
    if (response.status === 429) {
      if (err?.quotaExceeded) {
        throw new Error(err.error || 'הגעת למכסה היומית. תוכל להמשיך מחר.');
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 3000));
        continue;
      }
      throw new Error('המערכת עמוסה. המתן כמה שניות ונסה שוב.');
    }
    if (response.status === 401) {
      const reason = err.reason ? ` (${err.reason})` : '';
      throw new Error(`יש להתחבר מחדש${reason}`);
    }
    throw new Error(err.error || `שגיאת AI: ${response.status}`);
  }
}


export async function sendMessageStream(messages, onChunk, retries = 2) {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('יש להתחבר כדי להשתמש בצ׳אט');

  const idToken = await user.getIdToken();

  // Upload only the most recent image — the worker forwards a single image to
  // the provider anyway, so older ones would just inflate the request body.
  const lastImageIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.image) return i;
    }
    return -1;
  })();

  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        messages: messages.map((msg, i) => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          text: msg.text,
          ...(i === lastImageIdx ? { image: msg.image } : {}),
        })),
      }),
    });

    if (response.ok) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            if (data === '[DONE]') return;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) onChunk(content);
            } catch { /* ignore parse errors */ }
          }
        }
      }
      return;
    }

    // Read body once so we can distinguish quota-exceeded (don't retry) from
    // a transient rate-limit (retry with backoff).
    const err = response.ok ? null : await response.json().catch(() => ({}));
    if (response.status === 429) {
      if (err?.quotaExceeded) {
        throw new Error(err.error || 'הגעת למכסה היומית. תוכל להמשיך מחר.');
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 3000));
        continue;
      }
      throw new Error('המערכת עמוסה. המתן כמה שניות ונסה שוב.');
    }
    if (response.status === 401) {
      throw new Error('יש להתחבר מחדש');
    }
    throw new Error(err.error || `שגיאת AI: ${response.status}`);
  }
}
