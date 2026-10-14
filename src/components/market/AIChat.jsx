import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { m, AnimatePresence } from 'framer-motion';
import { Bot, Send, RotateCcw, Sparkles, BarChart3, History, Trash2, Crown, Image as ImageIcon, Copy, Check, TrendingDown, Target, Clock, AlertTriangle, ShieldCheck, ClipboardList } from 'lucide-react';
import { sendMessageStream } from '../../services/groqApi';
import { buildCoachStats } from '../../utils/coachStats';
import { formatAIText } from '../../utils/aiChatHelpers';
import { detectCoinFromText } from '../../utils/technicals';
import { fetchCoinChart } from '../../services/coingeckoApi';
import { useAiUsage } from '../../hooks/useAiUsage';
const ChatChart = lazy(() => import('./ChatChart'));

const STORAGE_KEY = 'tradeos-ai-conversations';
const LEGACY_KEY = 'tradeos-ai-chat-history';
const MAX_CONVERSATIONS = 30;

function convTitle(messages) {
  const firstUser = messages.find((m) => m.role === 'user');
  return (firstUser?.text || 'שיחה חדשה').slice(0, 40);
}

function loadConversations() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
    // Migrate the old single-history key to the first conversation
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const msgs = JSON.parse(legacy);
      if (Array.isArray(msgs) && msgs.some((m) => m.role === 'user')) {
        const conv = { id: String(Date.now()), title: convTitle(msgs), messages: msgs, updatedAt: Date.now() };
        localStorage.setItem(STORAGE_KEY, JSON.stringify([conv]));
        localStorage.removeItem(LEGACY_KEY);
        return [conv];
      }
      localStorage.removeItem(LEGACY_KEY);
    }
  } catch { /* ignore */ }
  return [];
}

function saveConversations(list) {
  try {
    const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CONVERSATIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
  } catch { /* ignore */ }
}

const WELCOME_MESSAGE = {
  role: 'model',
  text: 'שלום! אני TradeAI — המנטור שלך לשיטת ויקוף. אפשר לשאול אותי על שלבי איסוף ופיזור, LPSY, LPS, Spring, ניתוח Volume ועוד. רוצה ניתוח של צילום גרף? עבור לטאב "ניתוח גרפים". במה אוכל לעזור?',
};

// The questions worth asking about YOUR OWN book — answerable from the
// journal, which is the reason to ask them here and not in a generic chatbot.
const QUICK_QUESTIONS = [
  { Icon: TrendingDown, text: 'איפה אני מפסיד הכי הרבה כסף?' },
  { Icon: Target, text: 'איזו אסטרטגיה עובדת לי הכי טוב?' },
  { Icon: Clock, text: 'באילו שעות אני סוחר הכי טוב?' },
  { Icon: AlertTriangle, text: 'מה 3 הטעויות שחוזרות אצלי?' },
  { Icon: ShieldCheck, text: 'האם הסיכון שלי כרגע סביר?' },
  { Icon: ClipboardList, text: 'האם אני עומד בתוכנית המסחר שלי?' },
];


function TypingIndicator() {
  return (
    <div className="flex items-start gap-2.5 flex-row-reverse">
      <BotMark />
      <div className="bg-bg-tertiary rounded-2xl rounded-tl-md px-4 py-3">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <m.div
              key={i}
              animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
              className="w-1.5 h-1.5 rounded-full bg-accent-primary"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// The assistant's small mark beside its messages.
function BotMark() {
  return (
    <div className="w-8 h-8 rounded-xl shrink-0 grid place-items-center" style={{ background: 'linear-gradient(135deg, #2563eb 0%, #38bdf8 100%)' }}>
      <Sparkles className="w-4 h-4" style={{ color: '#06060a' }} />
    </div>
  );
}

export default function AIChat({ heightClass = 'h-[calc(100dvh-13.5rem)] md:h-[calc(100vh-220px)]', seedQuestion = null, trades = null, hint = '' }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  // The trader's own book, in the same compact shape the AI coach uses. Built
  // once per trades change and sent with every turn, so a question about "my"
  // trades is answered from them rather than from general advice.
  const journalContext = useMemo(
    () => (trades?.length ? buildCoachStats(trades, { premium: true }) : null),
    [trades],
  );
  // A question picked from the hub lands in the box, it is never auto-sent —
  // the user still gets to edit it, and an accidental chip tap must not spend
  // one of their AI questions.
  useEffect(() => {
    if (seedQuestion?.text) setInput(seedQuestion.text);
  }, [seedQuestion]);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState(null);
  const [cooldown, setCooldown] = useState(false);
  const [pendingChart, setPendingChart] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const streamingTextRef = useRef('');
  const batchTimeoutRef = useRef(null);
  const cooldownTimerRef = useRef(null);
  const copiedTimerRef = useRef(null);
  const aiUsage = useAiUsage();
  const lastSentRef = useRef(0);
  const chartPromiseRef = useRef(null);

  const [copiedIdx, setCopiedIdx] = useState(null);
  const [conversations, setConversations] = useState(() => loadConversations());
  const [currentConvId, setCurrentConvId] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyBtnRef = useRef(null);
  const [historyPos, setHistoryPos] = useState(null); // { top, left, width }

  // Recalculate dropdown position when it opens (and on resize/scroll). We
  // render the menu in a portal at document.body so no parent stacking
  // context or clip-path can ever hide it or leak content through it.
  useEffect(() => {
    if (!historyOpen) { setHistoryPos(null); return; }
    const place = () => {
      const el = historyBtnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const W = 288; // w-72
      setHistoryPos({
        top: r.bottom + 8,
        left: Math.max(8, Math.min(window.innerWidth - W - 8, r.left)),
        width: W,
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [historyOpen]);

  // On mount: open the most recent conversation if any, otherwise show welcome.
  useEffect(() => {
    if (conversations.length > 0) {
      const recent = conversations[0];
      setMessages(recent.messages);
      setCurrentConvId(recent.id);
    } else {
      setMessages([WELCOME_MESSAGE]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save current conversation whenever messages change (only once the user has sent
  // something — the lone welcome message is not a real conversation).
  useEffect(() => {
    if (messages.length === 0) return;
    if (!messages.some((m) => m.role === 'user')) return;
    // Strip heavy fields (chart data, base64 images) before persisting —
    // a single screenshot would blow through the localStorage quota.
    const stripped = messages.map(({ chart, image, ...rest }) => (image ? { ...rest, hadImage: true } : rest));
    const title = convTitle(stripped);
    const updatedAt = Date.now();
    setConversations((prev) => {
      let id = currentConvId;
      if (!id) { id = String(Date.now()); }
      const others = prev.filter((c) => c.id !== id);
      const next = [{ id, title, messages: stripped, updatedAt }, ...others].slice(0, MAX_CONVERSATIONS);
      saveConversations(next);
      if (!currentConvId) setCurrentConvId(id);
      return next;
    });
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom
  // Stick-to-bottom instead of scroll-to-bottom. The previous version called
  // smooth scrollIntoView on every streamed batch — ~33 times a second — which
  // restarted its own animation each frame and dragged the reader back down the
  // moment they scrolled up to re-read something.
  const stickRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const onMessagesScroll = (e) => {
    const el = e.currentTarget;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickRef.current = near;
    setAtBottom(near);
  };
  useEffect(() => {
    if (!stickRef.current) return;
    // 'auto' while tokens stream: a smooth animation cannot keep up with its own
    // restart rate, and the result is a permanently jittering viewport.
    messagesEndRef.current?.scrollIntoView({ behavior: streaming ? 'auto' : 'smooth' });
  }, [messages, streaming, streamingText]);

  const lastPromptRef = useRef('');
  const handleSend = async (text = input.trim()) => {
    if (!text || streaming || cooldown) return;

    // Min 6s between sends so we stay under the shared upstream rate limits
    // (Gemini free 15 RPM ≈ one every 4s; we add buffer).
    const now = Date.now();
    if (now - lastSentRef.current < 6000) {
      setError('המתן כמה שניות בין הודעות');
      return;
    }
    lastSentRef.current = now;
    lastPromptRef.current = text; // remember the prompt so "retry" resends it (the user msg is removed from `messages` on error)
    setCooldown(true);
    clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = setTimeout(() => setCooldown(false), 6000);

    setInput('');
    setError(null);

    const userMsg = { role: 'user', text, timestamp: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setStreaming(true);
    setStreamingText('');
    streamingTextRef.current = '';

    // Detect coin and fetch chart data in parallel with AI response
    const detectedCoin = detectCoinFromText(text);
    if (detectedCoin) {
      setPendingChart(detectedCoin.symbol);
      chartPromiseRef.current = fetchCoinChart(detectedCoin.coingeckoId, 30, detectedCoin.symbol).catch((err) => {
        console.warn('Chart fetch failed:', err);
        return null;
      });
    } else {
      setPendingChart(null);
      chartPromiseRef.current = null;
    }

    try {
      await sendMessageStream(newMessages, (chunk) => {
        streamingTextRef.current += chunk;
        if (!batchTimeoutRef.current) {
          batchTimeoutRef.current = setTimeout(() => {
            setStreamingText(streamingTextRef.current);
            batchTimeoutRef.current = null;
          }, 30);
        }
      }, 2, journalContext);

      // Flush any pending batch
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
        batchTimeoutRef.current = null;
      }

      // The answer is shown right away — the coin chart never holds it back.
      // If the chart is already here it rides along; if it lands later it's
      // attached to this answer then; if it never comes, there's no chart.
      const chartPromise = chartPromiseRef.current;
      const readyChart = chartPromise
        ? await Promise.race([chartPromise, new Promise((r) => setTimeout(() => r(undefined), 300))])
        : null;
      const aiMsg = {
        role: 'model',
        text: streamingTextRef.current,
        timestamp: Date.now(),
        chart: readyChart?.prices ? { prices: readyChart.prices, symbol: detectedCoin.symbol } : undefined,
      };
      setMessages((prev) => [...prev, aiMsg]);
      if (chartPromise && readyChart === undefined) {
        chartPromise.then((late) => {
          if (!late?.prices) return;
          setMessages((prev) => prev.map((m) => (m === aiMsg ? { ...m, chart: { prices: late.prices, symbol: detectedCoin.symbol } } : m)));
        });
      }
    } catch (err) {
      setError(err.message || 'שגיאה בתקשורת עם ה-AI');
      if (streamingTextRef.current) {
        // Keep the partial answer; don't wait on the chart for it.
        const aiMsg = {
          role: 'model',
          text: streamingTextRef.current,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        // Failed before any token streamed back → roll the user message out so
        // a retry doesn't pile up duplicate 'hey' bubbles like in the report.
        setMessages((prev) => prev.filter((m) => m !== userMsg));
        // And restore the typed text so the user can edit + resend.
        setInput(text);
      }
    } finally {
      setStreaming(false);
      setStreamingText('');
      streamingTextRef.current = '';
      setPendingChart(null);
      chartPromiseRef.current = null;
      inputRef.current?.focus();
      aiUsage.refresh();
    }
  };

  const copyMessage = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(key);
      clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopiedIdx((v) => (v === key ? null : v)), 1500);
    } catch {
      setError('ההעתקה נכשלה');
    }
  };

  // Message deletion/rollback shifts array indexes, so both the React key and
  // the copied-indicator must be keyed by message identity, not position.
  const msgKey = (msg) => (msg.timestamp ? `${msg.timestamp}-${msg.role}` : 'welcome');

  // Streaming can outlive the page (user navigates away mid-response) — kill
  // every pending timer so no setState fires after unmount.
  useEffect(() => () => {
    clearTimeout(batchTimeoutRef.current);
    clearTimeout(cooldownTimerRef.current);
    clearTimeout(copiedTimerRef.current);
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Start a fresh chat — the previous one stays in the history list.
  const clearChat = () => {
    setMessages([WELCOME_MESSAGE]);
    setCurrentConvId(null);
    setError(null);
    setHistoryOpen(false);
  };

  const loadConversation = (id) => {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    setMessages(conv.messages);
    setCurrentConvId(id);
    setError(null);
    setHistoryOpen(false);
  };

  const deleteConversation = (id, e) => {
    if (e) e.stopPropagation();
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveConversations(next);
      return next;
    });
    if (id === currentConvId) clearChat();
  };


  // An empty conversation shows a welcome screen with suggestions instead of
  // the canned greeting bubble.
  const isEmpty = !messages.some((m) => m.role === 'user') && !streaming;
  const pickSuggestion = (text) => {
    // Lands in the box, never auto-sent: the user can edit it, and a stray
    // tap must not spend one of their daily questions.
    setInput(text);
    inputRef.current?.focus();
  };
  const currentTitle = currentConvId ? (conversations.find((c) => c.id === currentConvId)?.title || 'שיחה') : 'שיחה חדשה';
  const remaining = !aiUsage.loading && aiUsage.limit ? Math.max(0, aiUsage.limit - aiUsage.used) : null;
  const toolBtn = 'h-9 inline-flex items-center gap-1.5 px-2.5 sm:px-3 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 text-text-secondary hover:text-text-primary bg-bg-tertiary border border-border-primary hover:border-border-hover transition-colors cursor-pointer';

  return (
    <div className="w-full">
      <div className={`relative flex flex-col bg-bg-secondary border border-border-primary rounded-2xl overflow-hidden ${heightClass}`}>
        {/* Toolbar: which conversation you're in + history / new chat. */}
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border-primary">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-profit shrink-0" style={{ boxShadow: '0 0 8px var(--color-profit)' }} />
            <span className="text-sm font-semibold text-text-primary truncate">{currentTitle}</span>
          </div>
          <div className="flex items-center gap-2">
            <button ref={historyBtnRef} onClick={() => setHistoryOpen((v) => !v)} className={toolBtn} title="היסטוריית שיחות">
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">היסטוריה</span>
              {conversations.length > 0 && (
                <span className="num-mono text-[10px] px-1.5 rounded-full bg-accent-primary/15 text-accent-hover">{conversations.length}</span>
              )}
            </button>
            <button onClick={clearChat} className={toolBtn} title="שיחה חדשה">
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">שיחה חדשה</span>
            </button>
          </div>
        </div>

        {/* History dropdown — rendered in a portal at document.body so no
            parent stacking context, transform, or overflow can clip it. */}
        {historyOpen && historyPos && createPortal(
          <>
            <div className="fixed inset-0 z-[9998] bg-black/50" onClick={() => setHistoryOpen(false)} />
            <div
              className="fixed z-[9999] border border-border-primary rounded-xl shadow-2xl overflow-hidden"
              style={{ top: historyPos.top, left: historyPos.left, width: historyPos.width, backgroundColor: 'var(--color-bg-overlay)' }}
            >
              <div className="px-3 py-2 text-xs text-text-secondary border-b border-border-primary/50">
                {conversations.length === 0 ? 'אין שיחות שמורות' : `${conversations.length} שיחות אחרונות (עד ${MAX_CONVERSATIONS})`}
              </div>
              <div className="max-h-80 overflow-y-auto overscroll-contain">
                {conversations.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => loadConversation(c.id)}
                    className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-bg-tertiary transition-colors ${c.id === currentConvId ? 'bg-accent-primary/10' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-text-primary truncate">{c.title}</div>
                      <div className="text-[11px] text-text-secondary">
                        {new Date(c.updatedAt).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <button onClick={(e) => deleteConversation(c.id, e)} className="p-1.5 rounded-lg text-text-muted hover:text-loss sm:opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" title="מחק שיחה">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>,
          document.body,
        )}

        {/* Messages / welcome */}
        <div className={`flex-1 overflow-y-auto overscroll-contain px-3 sm:px-5 py-5 space-y-5 relative ${isEmpty ? 'flex flex-col' : ''}`} onScroll={onMessagesScroll}>
          {isEmpty ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-5">
              <div className="w-14 h-14 rounded-2xl grid place-items-center" style={{ background: 'linear-gradient(135deg, #2563eb 0%, #38bdf8 100%)', boxShadow: '0 0 28px -6px rgba(59,130,246,0.7)' }}>
                <Sparkles className="w-7 h-7" style={{ color: '#06060a' }} />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-xl md:text-2xl font-bold text-text-primary">הסוכן מכיר כל עסקה שלך</h2>
                <p className="text-sm text-text-secondary max-w-md mx-auto leading-relaxed">
                  {hint || 'שאל על הביצועים, הטעויות והסיכון שלך. התשובות מבוססות על היומן שלך, לא על עצות כלליות.'}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
                {QUICK_QUESTIONS.map(({ Icon, text }) => (
                  <button
                    key={text}
                    onClick={() => pickSuggestion(text)}
                    className="flex items-center gap-3 px-3.5 py-3 rounded-xl text-right bg-bg-tertiary border border-border-primary hover:border-accent-primary/40 hover:bg-accent-primary/5 transition-colors cursor-pointer"
                  >
                    <span className="w-8 h-8 rounded-lg bg-accent-primary/12 text-accent-hover grid place-items-center shrink-0">
                      {Icon && <Icon className="w-4 h-4" />}
                    </span>
                    <span className="text-sm text-text-primary">{text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.filter((m) => m !== WELCOME_MESSAGE).map((msg) => {
                const mine = msg.role === 'user';
                return (
                  <m.div
                    key={msgKey(msg)}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className={`group flex items-start gap-2.5 ${mine ? '' : 'flex-row-reverse'}`}
                  >
                    {!mine && <BotMark />}
                    <div className={`flex flex-col gap-1 min-w-0 ${mine ? 'max-w-[85%] sm:max-w-[75%]' : 'max-w-[92%] sm:max-w-[85%]'}`}>
                      <div className={`rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
                        mine
                          ? 'bg-accent-primary/15 border border-accent-primary/25 text-text-primary rounded-tr-md'
                          : 'bg-bg-tertiary text-text-primary/90 rounded-tl-md'
                      }`}>
                        {mine ? (
                          <>
                            {msg.image && <img src={msg.image} alt="גרף שצורף" className="mb-2 rounded-lg max-h-48 w-auto border border-border-primary" />}
                            {!msg.image && msg.hadImage && (
                              <span className="flex items-center gap-1 text-xs text-text-secondary mb-1"><ImageIcon className="w-3 h-3" /> צורפה תמונת גרף</span>
                            )}
                            <p dir="auto">{msg.text}</p>
                          </>
                        ) : (
                          <>
                            {msg.chart && (
                              <Suspense fallback={<div className="h-40 rounded-xl bg-bg-secondary animate-pulse mb-2" />}>
                                <ChatChart prices={msg.chart.prices} coinSymbol={msg.chart.symbol} />
                              </Suspense>
                            )}
                            <div className="space-y-0">{formatAIText(msg.text)}</div>
                          </>
                        )}
                      </div>
                      {msg.text && (
                        <button
                          onClick={() => copyMessage(msgKey(msg), msg.text)}
                          className={`inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary transition-opacity cursor-pointer px-1 sm:opacity-0 group-hover:opacity-100 ${mine ? 'self-start' : 'self-end'}`}
                          title="העתק הודעה"
                        >
                          {copiedIdx === msgKey(msg) ? <><Check className="w-3 h-3 text-profit" /> הועתק</> : <><Copy className="w-3 h-3" /> העתק</>}
                        </button>
                      )}
                    </div>
                  </m.div>
                );
              })}
            </AnimatePresence>
          )}

          {/* Streaming AI response */}
          {streaming && streamingText && (
            <div className="flex items-start gap-2.5 flex-row-reverse">
              <BotMark />
              <div className="max-w-[92%] sm:max-w-[85%] rounded-2xl rounded-tl-md px-4 py-3 text-[15px] leading-relaxed bg-bg-tertiary text-text-primary/90">
                {pendingChart && (
                  <div className="mb-3 h-10 rounded-xl bg-bg-secondary border border-border-primary flex items-center gap-2 px-3 text-xs text-text-secondary">
                    <BarChart3 className="w-3.5 h-3.5 text-accent-primary animate-pulse" /> טוען גרף {pendingChart}…
                  </div>
                )}
                <div className="space-y-0">{formatAIText(streamingText)}</div>
              </div>
            </div>
          )}

          {/* Typing indicator - before first chunk arrives */}
          {streaming && !streamingText && <TypingIndicator />}

          {error && (
            <div className="flex justify-center">
              <div className="bg-loss/10 border border-loss/25 rounded-xl px-4 py-2.5 text-sm text-loss text-center">
                {error}
                <button onClick={() => handleSend(lastPromptRef.current)} className="block mx-auto mt-1 text-xs underline cursor-pointer text-text-secondary hover:text-text-primary">
                  נסה שוב
                </button>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {!atBottom && !isEmpty && (
          <button
            onClick={() => { stickRef.current = true; setAtBottom(true); messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-bg-tertiary border border-border-primary text-text-secondary hover:text-text-primary shadow-lg cursor-pointer"
          >
            לתשובה האחרונה ↓
          </button>
        )}

        {/* Input — one box with the send button inside, quota underneath. */}
        <div className="border-t border-border-primary px-3 sm:px-4 pt-3 pb-2.5">
          <div className="flex items-end gap-2 rounded-2xl bg-bg-tertiary border border-border-primary focus-within:border-accent-primary/60 transition-colors p-1.5 ps-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="שאל על המסחר שלך, על ויקוף או על מטבע…"
              rows={1}
              className="flex-1 bg-transparent py-2 text-[15px] text-text-primary placeholder-text-muted outline-none resize-none"
              style={{ maxHeight: '120px' }}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || streaming || cooldown}
              aria-label="שליחה"
              className="w-10 h-10 rounded-xl bg-accent-muted hover:bg-accent-primary text-white grid place-items-center transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          {remaining != null && (
            <div className="flex items-center justify-between gap-2 mt-1.5 px-1 text-[11px] text-text-muted">
              <span className="inline-flex items-center gap-1">
                {aiUsage.premium && <Crown className="w-3 h-3 text-accent-hover" />}
                {aiUsage.premium ? 'Premium' : 'מסלול חינמי'}
              </span>
              <span className={remaining <= 3 ? 'text-loss font-semibold' : ''}>נשארו {remaining} מתוך {aiUsage.limit} שאלות היום</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
