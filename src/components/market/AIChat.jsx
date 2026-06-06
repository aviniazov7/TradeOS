import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Send, RotateCcw, User, Sparkles, BarChart3, History, Trash2, Crown } from 'lucide-react';
import DOMPurify from 'dompurify';
import { sendMessageStream } from '../../services/groqApi';
import { detectCoinFromText } from '../../utils/technicals';
import { fetchCoinChart } from '../../services/coingeckoApi';
import { useAiUsage } from '../../hooks/useAiUsage';
import ChatChart from './ChatChart';

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
  text: 'שלום! אני TradeAI — המנטור שלך לשיטת ויקוף. אפשר לשאול אותי על שלבי איסוף ופיזור, LPSY, LPS, Spring, ניתוח Volume ועוד. במה אוכל לעזור?',
};

const QUICK_QUESTIONS = [
  'מה זה LPSY?',
  'מה זה LPS?',
  'הסבר Spring',
  'שלבי איסוף',
  'איך לזהות פיזור?',
  'חוק מאמץ מול תוצאה',
];

// Sanitize-last invariant: ALL HTML construction (markdown→tags) happens here,
// then DOMPurify runs as the final step before dangerouslySetInnerHTML. Never
// pass un-sanitized HTML to the DOM. Tags/attrs are tightly restricted so
// event handlers (onclick, onerror, etc.) and embedded scripts are stripped.
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['strong', 'code', 'em'],
  ALLOWED_ATTR: ['class'],
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link'],
  ALLOW_DATA_ATTR: false,
};

function buildLineHtml(line) {
  let formatted = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/`(.+?)`/g, '<code class="bg-bg-tertiary px-1 py-0.5 rounded text-accent-primary text-[11px]">$1</code>');
  return formatted;
}

function safeHtml(raw) {
  return DOMPurify.sanitize(raw, SANITIZE_CONFIG);
}

function formatAIText(text) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const formatted = buildLineHtml(line);

    if (/^[-•*]\s/.test(formatted)) {
      return <li key={i} className="mr-4 mb-0.5" dangerouslySetInnerHTML={{ __html: safeHtml(formatted.replace(/^[-•*]\s/, '')) }} />;
    }
    if (/^#{1,3}\s/.test(formatted)) {
      const content = formatted.replace(/^#{1,3}\s/, '');
      return <p key={i} className="font-bold text-text-primary mt-2 mb-1" dangerouslySetInnerHTML={{ __html: safeHtml(content) }} />;
    }
    if (!formatted.trim()) return <br key={i} />;
    return <p key={i} className="mb-0.5" dangerouslySetInnerHTML={{ __html: safeHtml(formatted) }} />;
  });
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-3 max-w-[85%] flex-row-reverse">
      <div className="w-7 h-7 rounded-lg bg-accent-primary/15 flex items-center justify-center shrink-0">
        <Bot className="w-4 h-4 text-accent-primary" />
      </div>
      <div className="bg-bg-secondary border border-border-primary rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <motion.div
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

export default function AIChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState(null);
  const [cooldown, setCooldown] = useState(false);
  const [pendingChart, setPendingChart] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const streamingTextRef = useRef('');
  const batchTimeoutRef = useRef(null);
  const aiUsage = useAiUsage();
  const lastSentRef = useRef(0);
  const chartPromiseRef = useRef(null);

  const [conversations, setConversations] = useState(() => loadConversations());
  const [currentConvId, setCurrentConvId] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);

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
    const stripped = messages.map(({ chart, ...rest }) => rest);
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
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming, streamingText]);

  const handleSend = async (text = input.trim()) => {
    if (!text || streaming || cooldown) return;

    // Block trivially short messages that just burn the daily quota without
    // producing a useful answer.
    if (text.length < 3) {
      setError('שאל שאלה ברורה (לפחות 3 תווים)');
      return;
    }

    const now = Date.now();
    if (now - lastSentRef.current < 3000) {
      setError('המתן כמה שניות בין הודעות');
      return;
    }
    lastSentRef.current = now;
    setCooldown(true);
    setTimeout(() => setCooldown(false), 3000);

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
      chartPromiseRef.current = fetchCoinChart(detectedCoin.coingeckoId, 30).catch((err) => {
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
      });

      // Flush any pending batch
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
        batchTimeoutRef.current = null;
      }

      // Wait for chart data if we started fetching
      const chartResult = chartPromiseRef.current ? await chartPromiseRef.current : null;

      const aiMsg = {
        role: 'model',
        text: streamingTextRef.current,
        timestamp: Date.now(),
        chart: chartResult?.prices ? { prices: chartResult.prices, symbol: detectedCoin.symbol } : undefined,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      setError(err.message || 'שגיאה בתקשורת עם ה-AI');
      if (streamingTextRef.current) {
        const chartResult = chartPromiseRef.current ? await chartPromiseRef.current.catch(() => null) : null;
        const aiMsg = {
          role: 'model',
          text: streamingTextRef.current,
          timestamp: Date.now(),
          chart: chartResult?.prices && detectedCoin ? { prices: chartResult.prices, symbol: detectedCoin.symbol } : undefined,
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

  const showQuickQuestions = messages.length <= 1 && !streaming;

  return (
    <div className="max-w-2xl mx-auto w-full">
      <div className="flex flex-col bg-bg-secondary/30 border border-border-primary rounded-2xl overflow-hidden h-[calc(100dvh-13.5rem)] md:h-[calc(100vh-220px)] min-h-[400px]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary bg-bg-secondary/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-accent-primary/15 flex items-center justify-center">
              <Bot className="w-5 h-5 text-accent-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-primary">TradeAI</h3>
              <p className="text-[10px] text-text-muted">מנטור מסחר — שיטת ויקוף</p>
            </div>
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-2 h-2 rounded-full bg-profit"
            />
          </div>
          <div className="flex items-center gap-2 relative">
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer border border-border-primary"
              title="היסטוריית שיחות"
            >
              <History className="w-3 h-3" />
              היסטוריה
              {conversations.length > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent-primary/15 text-accent-primary">
                  {conversations.length}
                </span>
              )}
            </button>
            <button
              onClick={clearChat}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer border border-border-primary"
            >
              <RotateCcw className="w-3 h-3" />
              שיחה חדשה
            </button>

            {historyOpen && (
              <>
                <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setHistoryOpen(false)} />
                <div
                  className="absolute top-full left-0 mt-2 w-72 border border-border-primary rounded-xl shadow-2xl z-50 overflow-hidden bg-bg-overlay"
                  style={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
                >
                  <div className="px-3 py-2 text-[11px] text-text-muted border-b border-border-primary/50">
                    {conversations.length === 0 ? 'אין שיחות שמורות' : `${conversations.length} שיחות אחרונות (עד ${MAX_CONVERSATIONS})`}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {conversations.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => loadConversation(c.id)}
                        className={`group flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-bg-tertiary transition-colors ${
                          c.id === currentConvId ? 'bg-accent-primary/10' : ''
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-text-primary truncate">{c.title}</div>
                          <div className="text-[10px] text-text-muted">
                            {new Date(c.updatedAt).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <button
                          onClick={(e) => deleteConversation(c.id, e)}
                          className="p-1 rounded text-text-muted hover:text-loss opacity-0 group-hover:opacity-100 transition-opacity"
                          title="מחק שיחה"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex items-start gap-2.5 ${msg.role === 'user' ? '' : 'flex-row-reverse'}`}
              >
                {/* Avatar */}
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  msg.role === 'user'
                    ? 'bg-accent-primary/20'
                    : 'bg-accent-primary/10'
                }`}>
                  {msg.role === 'user'
                    ? <User className="w-4 h-4 text-accent-primary" />
                    : <Bot className="w-4 h-4 text-accent-primary" />
                  }
                </div>

                {/* Bubble */}
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-accent-primary/15 border border-accent-primary/25 text-text-primary rounded-tr-sm'
                    : 'bg-bg-secondary border border-border-primary text-text-secondary rounded-tl-sm'
                }`}>
                  {msg.role === 'user'
                    ? <p>{msg.text}</p>
                    : <>
                        {msg.chart && <ChatChart prices={msg.chart.prices} coinSymbol={msg.chart.symbol} />}
                        <div className="space-y-0">{formatAIText(msg.text)}</div>
                      </>
                  }
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Streaming AI response */}
          {streaming && streamingText && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2.5 flex-row-reverse"
            >
              <div className="w-7 h-7 rounded-lg bg-accent-primary/10 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-accent-primary" />
              </div>
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed bg-bg-secondary border border-border-primary text-text-secondary">
                {/* Chart loading skeleton */}
                {pendingChart && (
                  <div className="mb-3 rounded-xl bg-bg-tertiary/50 border border-border-primary overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-border-primary">
                      <motion.div animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}>
                        <BarChart3 className="w-3.5 h-3.5 text-accent-primary" />
                      </motion.div>
                      <span className="text-[10px] font-mono text-text-muted">טוען גרף {pendingChart}...</span>
                    </div>
                    <div className="h-44 flex items-center justify-center">
                      <motion.div
                        animate={{ opacity: [0.2, 0.5, 0.2] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="text-[10px] text-text-muted font-mono"
                      >
                        LOADING CHART DATA
                      </motion.div>
                    </div>
                  </div>
                )}
                <div className="space-y-0">{formatAIText(streamingText)}</div>
              </div>
            </motion.div>
          )}

          {/* Typing indicator - before first chunk arrives */}
          {streaming && !streamingText && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <TypingIndicator />
            </motion.div>
          )}

          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center">
              <div className="bg-loss/10 border border-loss/20 rounded-xl px-4 py-2 text-xs text-loss text-center">
                {error}
                <button onClick={() => handleSend(messages[messages.length - 1]?.text)} className="block mx-auto mt-1 underline cursor-pointer text-text-muted hover:text-text-primary">
                  נסה שוב
                </button>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Questions */}
        <AnimatePresence>
          {showQuickQuestions && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="px-4 pb-2"
            >
              <p className="text-[10px] text-text-muted mb-2 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-accent-primary" /> שאלות מוצעות
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    className="px-3 py-1.5 rounded-lg text-xs bg-bg-secondary border border-border-primary text-text-secondary hover:text-accent-primary hover:border-accent-primary/40 transition-all cursor-pointer"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input */}
        <div className="border-t border-border-primary px-4 py-3 bg-bg-secondary/50">
          {/* Daily AI quota — resets at Israel midnight (premium = unlimited) */}
          {!aiUsage.loading && aiUsage.unlimited && (
            <div className="mb-2 flex items-center justify-center gap-1.5 text-[10px] text-accent-primary">
              <Crown className="w-3 h-3" /> Premium · שימוש ללא הגבלה
            </div>
          )}
          {!aiUsage.loading && !aiUsage.unlimited && (() => {
            const remaining = Math.max(0, aiUsage.limit - aiUsage.used);
            const pct = Math.min(100, (aiUsage.used / aiUsage.limit) * 100);
            const low = remaining <= 3;
            return (
              <div className="mb-2">
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="text-text-muted">מכסה יומית</span>
                  <span className={low ? 'text-loss font-semibold' : 'text-text-secondary'}>
                    נשארו {remaining} מתוך {aiUsage.limit}
                  </span>
                </div>
                <div className="h-1 bg-bg-tertiary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${low ? 'bg-loss' : 'bg-accent-primary'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })()}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="שאל על ויקוף, LPSY, LPS..."
              rows={1}
              className="flex-1 bg-bg-tertiary border border-border-primary rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none resize-none focus:border-accent-primary/50 transition-colors"
              style={{ maxHeight: '100px' }}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || streaming || cooldown}
              className="w-10 h-10 rounded-xl bg-accent-primary text-bg-primary flex items-center justify-center hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0 shadow-lg shadow-accent-primary/20"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
