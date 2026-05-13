import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Send, RotateCcw, User, Sparkles, BarChart3 } from 'lucide-react';
import DOMPurify from 'dompurify';
import { sendMessageStream } from '../../services/groqApi';
import { detectCoinFromText } from '../../utils/technicals';
import { fetchCoinChart } from '../../services/coingeckoApi';
import ChatChart from './ChatChart';

const STORAGE_KEY = 'tradeos-ai-chat-history';

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
  const lastSentRef = useRef(0);
  const chartPromiseRef = useRef(null);

  // Load from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.length > 0) {
          setMessages(parsed);
          return;
        }
      }
    } catch { /* ignore */ }
    setMessages([WELCOME_MESSAGE]);
  }, []);

  // Save to localStorage (keep last 50 messages, strip chart data to save space)
  useEffect(() => {
    if (messages.length > 0) {
      const toSave = (messages.length > 50 ? messages.slice(-50) : messages).map(
        ({ chart, ...rest }) => rest
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    }
  }, [messages]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming, streamingText]);

  const handleSend = async (text = input.trim()) => {
    if (!text || streaming || cooldown) return;

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
      }
    } finally {
      setStreaming(false);
      setStreamingText('');
      streamingTextRef.current = '';
      setPendingChart(null);
      chartPromiseRef.current = null;
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([WELCOME_MESSAGE]);
    localStorage.removeItem(STORAGE_KEY);
    setError(null);
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
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer border border-border-primary"
          >
            <RotateCcw className="w-3 h-3" />
            שיחה חדשה
          </button>
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
