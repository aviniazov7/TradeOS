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
      throw new Error('שירות ה-AI עמוס כרגע (מגבלת קצב). המתן כ-30 שניות ונסה שוב.');
    }
    if (response.status === 401) {
      const reason = err.reason ? ` (${err.reason})` : '';
      throw new Error(`יש להתחבר מחדש${reason}`);
    }
    throw new Error(err.error || `שגיאת AI: ${response.status}`);
  }
}


// Abort a streamed request if no chunk arrives for this long, so the UI never
// hangs on "מעבד..." forever when a provider connection wedges open mid-stream.
// Generous enough to cover a slow vision model's first token (reset per chunk).
const STREAM_IDLE_TIMEOUT_MS = 45000;

// iOS WebKit rejects an aborted fetch with TypeError "Load failed", not
// AbortError. The chart screen maps every non-abort rejection to "check your
// connection", so a timeout while a vision model is slow looked like a dead
// network. The signal is the reliable signal that we cancelled the request.
export function aiFetchFailureMessage(error, aborted) {
  if (aborted || error?.name === 'AbortError') return 'השרת לא הגיב בזמן. נסה שוב.';
  return 'בעיית תקשורת עם השרת. בדוק את החיבור ונסה שוב.';
}

export async function sendMessageStream(messages, onChunk, retries = 2, context = null) {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('יש להתחבר כדי להשתמש בצ׳אט');

  let idToken = await user.getIdToken();

  // Upload only the most recent image — the worker forwards a single image to
  // the provider anyway, so older ones would just inflate the request body.
  const lastImageIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.image) return i;
    }
    return -1;
  })();

  const payload = JSON.stringify({
    messages: messages.map((msg, i) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      text: msg.text,
      ...(i === lastImageIdx ? { image: msg.image } : {}),
    })),
    // The trader's own book. The worker sizes it down and skips it on image
    // turns; sending it means "where am I losing money" is answered from the
    // journal instead of from general trading advice.
    ...(context ? { context } : {}),
  });

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    let idleTimer;
    const armIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => controller.abort(), STREAM_IDLE_TIMEOUT_MS);
    };
    armIdle();

    let headersReceived = false;
    try {
      let response;
      try {
        response = await fetch(WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: payload,
          signal: controller.signal,
        });
        headersReceived = true;
      } catch (e) {
        throw new Error(aiFetchFailureMessage(e, controller.signal.aborted));
      }

      if (response.ok) {
        // A 200 with no body can happen behind some proxies — treat as an error
        // rather than throwing a raw English TypeError from getReader().
        if (!response.body) throw new Error('לא התקבלה תשובה מהשרת');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let received = 0;

        // Parse one SSE line. Throws if the worker signalled an error mid-stream
        // (after it already sent 200), so a provider failure surfaces instead of
        // ending as a silent blank result.
        const processLine = (line) => {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) return;
          const data = trimmed.slice(trimmed.indexOf(':') + 1).trim();
          if (!data || data === '[DONE]') return;
          let parsed;
          try { parsed = JSON.parse(data); } catch { return; /* partial/non-JSON */ }
          if (parsed.error) {
            throw new Error(typeof parsed.error === 'string' ? parsed.error : 'שגיאת AI');
          }
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) { received += content.length; onChunk(content); }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          armIdle(); // a chunk arrived — reset the idle deadline
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) processLine(line);
        }
        // Flush trailing bytes + the final un-terminated line so a clean close
        // without a [DONE] marker doesn't silently drop the last delta.
        buffer += decoder.decode();
        if (buffer.trim()) processLine(buffer);

        // 200 but nothing streamed = empty/error-only provider response (the
        // worker already burned the quota charge on its side).
        if (received === 0) throw new Error('לא התקבלה תשובה מה-AI. נסה שוב.');
        return;
      }

      const err = await response.json().catch(() => ({}));
      if (response.status === 429) {
        if (err?.quotaExceeded) {
          throw new Error(err.error || 'הגעת למכסה היומית. תוכל להמשיך מחר.');
        }
        // The worker already walked its whole provider chain before saying
        // 429, so one calm retry is plenty — more just burns the rate limit.
        if (attempt < Math.min(retries, 1)) {
          await new Promise((r) => setTimeout(r, 4000));
          continue;
        }
        throw new Error(err.error || 'שירות ה-AI עמוס כרגע. נסה שוב בעוד דקה.');
      }
      if (response.status === 401) {
        // One silent recovery: a rejected token (revocation / clock skew / key
        // rotation) is retried once with a forced refresh before we tell the
        // user to log in again.
        if (attempt < retries) { idToken = await user.getIdToken(true); continue; }
        throw new Error('יש להתחבר מחדש');
      }
      // 4xx/5xx — including a provider 404 the worker wrapped as 502. The raw
      // code ("שגיאת AI: 404") is meaningless to a user, so show a friendly
      // message and keep the detail in the console. A worker-authored human
      // message (e.g. the Premium gate) is preserved.
      if (err?.error && !/^שגיאת AI:/.test(err.error)) throw new Error(err.error);
      console.error('AI worker error:', response.status, err?.error || '(no body)');
      throw new Error('שירות ה-AI אינו זמין כרגע. נסה שוב בעוד רגע 🙏');
    } catch (e) {
      // Headers already arrived: the idle timer cut the stream. Before that,
      // the inner catch already mapped an iOS "Load failed" abort.
      if (headersReceived && (e.name === 'AbortError' || controller.signal.aborted)) {
        throw new Error('התשובה נקטעה (timeout). נסה שוב.');
      }
      throw e;
    } finally {
      clearTimeout(idleTimer);
    }
  }
}
