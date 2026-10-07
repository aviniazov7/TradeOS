import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Sparkles, TrendingUp, TrendingDown, Minus, RotateCcw, Activity, BarChart3, Zap, Shield, ChevronDown, ChevronUp, Target, Gauge, BookOpen, Flame, FileText, Copy, Check, RefreshCw } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import DOMPurify from 'dompurify';
import { searchCoins, fetchCoinDetails, fetchCoinChart, fetchKlines } from '../../services/coingeckoApi';
import { formatCompactUsd as formatNum, formatCoinPrice as formatPrice, LRM } from '../../utils/formatters';
import { fetchAnalysisLiquidity } from '../../services/bybitDirect';
import { fetchProjectDescription } from '../../services/groqApi';
import { computeRSI, computeMA, computeVolatility } from '../../utils/technicals';

// ── Modern "AI" accent: violet → cyan. Replaces the old flat blue across this
// page. AI_GRADIENT is used for hero CTAs / hairlines / progress; AI_FROM/AI_TO
// are the endpoints. The whole page also overrides --color-accent-primary to
// AI_FROM (see the root wrapper) so every text/icon accent shifts to violet.
const AI_FROM = '#8b5cf6';
const AI_TO = '#06b6d4';
const AI_GRADIENT = `linear-gradient(135deg, ${AI_FROM} 0%, ${AI_TO} 100%)`;

function formatSupply(n) {
  if (!n) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

// Animated number counter
function AnimatedValue({ value, className }) {
  const [display, setDisplay] = useState(value);
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) { setDisplay(value); ref.current = true; return; }
    setDisplay(value);
  }, [value]);
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={className}
    >
      {display}
    </motion.span>
  );
}

// Card with a modern AI-gradient surface: a thin violet→cyan hairline along the
// top edge and a faint corner glow. Hover feedback is a brighter border + a soft
// violet OUTER shadow — never a fill behind the card (the surface is translucent,
// so a gradient behind it would bleed through and wash out the text).
function GlowCard({ children, className = '', delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.5, type: 'spring', stiffness: 120 }}
      className={`relative group h-full ${className}`}
    >
      <div className="relative bg-bg-secondary border border-border-primary rounded-2xl overflow-hidden h-full transition-[border-color,box-shadow] duration-300 group-hover:border-accent-primary/40 group-hover:shadow-[0_10px_34px_-12px_rgba(139,92,246,0.5)]">
        {/* Top accent hairline (violet → cyan) */}
        <div className="absolute top-0 inset-x-0 h-px pointer-events-none"
          style={{ background: `linear-gradient(to right, transparent, ${AI_FROM}, ${AI_TO}, transparent)`, opacity: 0.45 }} />
        {/* Faint static accent glow in the top-right corner (small, never over text) */}
        <div className="absolute -top-10 -right-10 w-24 h-24 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${AI_FROM}1f 0%, transparent 70%)` }} />
        {children}
      </div>
    </motion.div>
  );
}

// Live pulse dot
function PulseDot({ color = 'bg-accent-primary' }) {
  return (
    <span className="relative flex h-2 w-2">
      <motion.span
        animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
        transition={{ duration: 1.5, repeat: Infinity }}
        className={`absolute inset-0 rounded-full ${color}`}
      />
      <span className={`relative inline-flex rounded-full h-2 w-2 ${color}`} />
    </span>
  );
}

const ANALYSIS_STEPS = [
  { text: 'סורק נתוני שוק בזמן אמת', icon: Activity },
  { text: 'מנתח ביצועים היסטוריים', icon: BarChart3 },
  { text: 'מחשב אינדיקטורים טכניים', icon: Zap },
  { text: 'בודק רמות תמיכה והתנגדות', icon: Shield },
  { text: 'מכין דו"ח מסכם', icon: Sparkles },
];

const QUICK_COINS = [
  { symbol: 'BTC', name: 'Bitcoin', coingeckoId: 'bitcoin' },
  { symbol: 'ETH', name: 'Ethereum', coingeckoId: 'ethereum' },
  { symbol: 'SOL', name: 'Solana', coingeckoId: 'solana' },
  { symbol: 'XRP', name: 'XRP', coingeckoId: 'ripple' },
  { symbol: 'BNB', name: 'BNB', coingeckoId: 'binancecoin' },
  { symbol: 'DOGE', name: 'Dogecoin', coingeckoId: 'dogecoin' },
];

const TV_SYMBOL_MAP = {
  bitcoin: 'BTCUSDT', ethereum: 'ETHUSDT', solana: 'SOLUSDT', ripple: 'XRPUSDT',
  binancecoin: 'BNBUSDT', dogecoin: 'DOGEUSDT', cardano: 'ADAUSDT', avalanche: 'AVAXUSDT',
  polkadot: 'DOTUSDT', chainlink: 'LINKUSDT', litecoin: 'LTCUSDT', uniswap: 'UNIUSDT',
};

function TVEmbed({ widget, config, minH = '200px' }) {
  const src = useMemo(() => {
    return `https://s.tradingview.com/embed-widget/${widget}/?locale=he_IL#${encodeURIComponent(JSON.stringify(config))}`;
  }, [widget, config]);

  return (
    <iframe
      key={JSON.stringify(config)}
      src={src}
      className="w-full h-full border-0 overflow-hidden"
      style={{ colorScheme: 'normal', minHeight: minH, overflow: 'hidden' }}
      scrolling="no"
    />
  );
}

const PROJECT_DESC_SANITIZE = {
  ALLOWED_TAGS: ['strong', 'em'],
  ALLOWED_ATTR: [],
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'a', 'img'],
  ALLOW_DATA_ATTR: false,
};

function formatProjectMarkdown(line) {
  const bolded = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return DOMPurify.sanitize(bolded, PROJECT_DESC_SANITIZE);
}

function ProjectDescription({ coin, description, loading, error, expanded, onToggle, onRetry }) {
  const [copied, setCopied] = useState(false);

  const paragraphs = useMemo(() => {
    if (!description) return [];
    return description
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
  }, [description]);

  const visible = expanded ? paragraphs : paragraphs.slice(0, 1);
  const hasMore = paragraphs.length > 1;

  const handleCopy = async () => {
    if (!description) return;
    try {
      await navigator.clipboard.writeText(description);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — silently fail; icon stays as Copy
    }
  };

  return (
    <GlowCard delay={0.35} glowColor="rgba(168,85,247,0.18)">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3 gap-2">
          <h3 className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-accent-primary" />
            על הפרויקט
            <span className="hidden sm:inline-flex items-center gap-1 mr-1.5 px-1.5 py-0.5 rounded-md bg-accent-primary/10 border border-accent-primary/20 text-[9px] font-mono text-accent-primary uppercase tracking-wider">
              <Sparkles className="w-2.5 h-2.5" />
              AI
            </span>
          </h3>
          <div className="flex items-center gap-1">
            {description && !loading && (
              <>
                <button
                  onClick={onRetry}
                  title="צור מחדש"
                  className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleCopy}
                  title={copied ? 'הועתק' : 'העתק'}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${copied ? 'text-profit bg-profit/10' : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'}`}
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </>
            )}
          </div>
        </div>

        {loading && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{ opacity: [0.3, 0.7, 0.3] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.15 }}
                className="h-3 rounded bg-bg-tertiary"
                style={{ width: `${[100, 92, 70][i]}%` }}
              />
            ))}
            <p className="text-[10px] text-text-muted font-mono mt-3 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-accent-primary animate-pulse" />
              מייצר מאמר על {coin?.name}…
            </p>
          </div>
        )}

        {!loading && error && (
          <div className="text-center py-3">
            <p className="text-xs text-loss mb-2">{error}</p>
            <button
              onClick={onRetry}
              className="text-[11px] text-text-muted hover:text-text-primary transition-colors cursor-pointer underline"
            >
              נסה שוב
            </button>
          </div>
        )}

        {!loading && !error && description && (
          <>
            <motion.div
              initial={false}
              animate={{ height: 'auto' }}
              className="text-sm text-text-secondary leading-relaxed space-y-2.5"
              style={{ overflow: 'hidden' }}
            >
              <AnimatePresence initial={false} mode="wait">
                <motion.div
                  key={expanded ? 'full' : 'short'}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-2.5"
                >
                  {visible.map((p, i) => (
                    <p
                      key={i}
                      dangerouslySetInnerHTML={{ __html: formatProjectMarkdown(p) }}
                    />
                  ))}
                  {!expanded && hasMore && (
                    <div className="relative -mt-6 h-6 pointer-events-none bg-gradient-to-t from-bg-secondary to-transparent" />
                  )}
                </motion.div>
              </AnimatePresence>
            </motion.div>

            {hasMore && (
              <button
                onClick={onToggle}
                className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-accent-primary hover:text-accent-hover transition-colors cursor-pointer"
              >
                {expanded ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    הצג פחות
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    קרא עוד
                  </>
                )}
              </button>
            )}

            <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-border-primary/40">
              <Sparkles className="w-3 h-3 text-accent-primary/70" />
              <p className="text-[11px] text-text-muted">
                נוצר ע״י בינה מלאכותית · עשוי להכיל אי־דיוקים
              </p>
            </div>
          </>
        )}
      </div>
    </GlowCard>
  );
}

export default function CoinAnalysis() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedCoin, setSelectedCoin] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [coinData, setCoinData] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [rawPrices, setRawPrices] = useState([]);
  const [error, setError] = useState(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [liquidityData, setLiquidityData] = useState(null);
  const [heatmapKlines, setHeatmapKlines] = useState(null);
  // Which exchange the TradingView chart should use. Falls back to Bybit for
  // coins Binance doesn't list (otherwise the embed shows "Invalid symbol").
  const [chartExchange, setChartExchange] = useState('BINANCE');
  const [projectDesc, setProjectDesc] = useState('');
  const [projectDescLoading, setProjectDescLoading] = useState(false);
  const [projectDescError, setProjectDescError] = useState(null);
  const [projectDescExpanded, setProjectDescExpanded] = useState(false);
  const searchRef = useRef(null);
  const debounceRef = useRef(null);
  const descCacheRef = useRef(new Map());

  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!query || query.length < 2 || selectedCoin) { setSuggestions([]); return; }
    let cancelled = false;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const results = await searchCoins(query);
      if (cancelled) return; // a newer query started — don't overwrite its results
      setSuggestions(results);
      setShowSuggestions(true);
    }, 300);
    return () => { cancelled = true; clearTimeout(debounceRef.current); };
  }, [query, selectedCoin]);

  const loadProjectDescription = async (coin, { force = false } = {}) => {
    if (!coin) return;
    const cacheKey = coin.coingeckoId || coin.symbol;
    if (!force && descCacheRef.current.has(cacheKey)) {
      setProjectDesc(descCacheRef.current.get(cacheKey));
      setProjectDescLoading(false);
      setProjectDescError(null);
      return;
    }
    setProjectDescLoading(true);
    setProjectDescError(null);
    setProjectDesc('');
    setProjectDescExpanded(false);
    try {
      const text = await fetchProjectDescription(coin.name, coin.symbol);
      if (text) {
        descCacheRef.current.set(cacheKey, text);
        setProjectDesc(text);
      } else {
        setProjectDescError('לא הצלחנו לייצר תיאור כרגע.');
      }
    } catch (e) {
      setProjectDescError(e?.message || 'שגיאה ביצירת התיאור.');
    } finally {
      setProjectDescLoading(false);
    }
  };

  const selectCoin = (coin) => {
    setSelectedCoin(coin);
    setQuery(coin.name);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const analyze = async (coin = selectedCoin) => {
    if (!coin) return;
    setSelectedCoin(coin);
    setQuery(coin.name);
    setShowSuggestions(false);
    setAnalyzing(true);
    setActiveStep(0);
    setScanProgress(0);
    setCoinData(null);
    setChartData([]);
    setRawPrices([]);
    setChartExchange('BINANCE');
    setError(null);

    // Kick off AI project description in parallel (non-blocking)
    loadProjectDescription(coin);

    const stepTimers = ANALYSIS_STEPS.map((_, i) =>
      setTimeout(() => setActiveStep(i), i * 550)
    );
    const progressInterval = setInterval(() => {
      setScanProgress((p) => Math.min(p + 1.2, 95));
    }, 30);

    const minDelay = new Promise((r) => setTimeout(r, 3000));

    try {
      const [details, chart] = await Promise.all([
        fetchCoinDetails(coin.coingeckoId, coin.symbol),
        fetchCoinChart(coin.coingeckoId, 30, coin.symbol),
      ]);

      await minDelay;
      clearInterval(progressInterval);
      setScanProgress(100);

      setCoinData(details);
      if (chart.prices) {
        const prices = chart.prices.map(([, p]) => p);
        setRawPrices(prices);
        setChartData(chart.prices.map(([ts, price]) => ({
          date: `${new Date(ts).getDate()}/${new Date(ts).getMonth() + 1}`,
          price,
        })));
      }

      // Liquidity data via Bybit + the worker proxy (non-blocking, background).
      // The old direct Binance calls are geo-blocked from Israeli browsers, and
      // the allForceOrders endpoint was removed by Binance entirely.
      const binanceSymbol = TV_SYMBOL_MAP[coin.coingeckoId] || `${coin.symbol?.toUpperCase()}USDT`;
      Promise.allSettled([
        fetchAnalysisLiquidity(binanceSymbol),
        fetchKlines(binanceSymbol, '1h', 720),
      ]).then(([liqRes, klinesRes]) => {
        const liq = liqRes.status === 'fulfilled' ? liqRes.value : null;
        // The data now comes from Bybit, so a coin found on Bybit spot gets a
        // Bybit TradingView chart (guaranteed to exist there).
        setChartExchange(liq?.onBybitSpot ? 'BYBIT' : 'BINANCE');

        setLiquidityData({
          symbol: binanceSymbol,
          bookTicker: liq?.bookTicker || null,
          openInterest: liq?.openInterest || null,
          funding: liq?.funding || null,
          depth: liq?.depth || null,
          // Bybit has no public REST history for liquidations — the heatmap
          // card shows its Coinglass fallback (Binance killed the old API too).
          forceOrders: null,
        });

        // Store klines for the Liquidation Heatmap canvas
        const klines = klinesRes.status === 'fulfilled' && Array.isArray(klinesRes.value) ? klinesRes.value : null;
        if (klines && klines.length > 10) setHeatmapKlines(klines);
      });
    } catch {
      await minDelay;
      clearInterval(progressInterval);
      setError('שגיאה בטעינת הנתונים. נסה שוב.');
    } finally {
      stepTimers.forEach(clearTimeout);
      setAnalyzing(false);
    }
  };

  const reset = () => {
    setSelectedCoin(null);
    setQuery('');
    setCoinData(null);
    setChartData([]);
    setRawPrices([]);
    setError(null);
    setLiquidityData(null);
    setHeatmapKlines(null);
    setProjectDesc('');
    setProjectDescLoading(false);
    setProjectDescError(null);
    setProjectDescExpanded(false);
  };

  const sentiment = useMemo(() => {
    if (!coinData) return null;
    const m = coinData.market_data;
    const changes = [m?.price_change_percentage_24h, m?.price_change_percentage_7d, m?.price_change_percentage_30d];
    const valid = changes.filter((c) => c != null);
    if (!valid.length) return null;
    const positive = valid.filter((c) => c > 0).length;
    if (positive >= 3) return { label: 'BULLISH', hebLabel: 'בוליש', icon: TrendingUp, color: 'text-profit', rawColor: '#22c55e', borderColor: 'border-profit/40', desc: `${positive}/${valid.length} מדדים חיוביים` };
    if (positive === 0) return { label: 'BEARISH', hebLabel: 'בריש', icon: TrendingDown, color: 'text-loss', rawColor: '#ef4444', borderColor: 'border-loss/40', desc: `${valid.length}/${valid.length} מדדים שליליים` };
    return { label: 'NEUTRAL', hebLabel: 'ניטרלי', icon: Minus, color: 'text-amber-500', rawColor: '#eab308', borderColor: 'border-amber-500/40', desc: `${positive} חיוביים, ${valid.length - positive} שליליים` };
  }, [coinData]);

  const technicals = useMemo(() => {
    if (!rawPrices.length) return null;
    const currentPrice = rawPrices[rawPrices.length - 1];
    const rsi = computeRSI(rawPrices, 14);
    const ma7 = computeMA(rawPrices, 7);
    const ma14 = computeMA(rawPrices, 14);
    const volatility = computeVolatility(rawPrices);
    const high30d = Math.max(...rawPrices);
    const low30d = Math.min(...rawPrices);
    const diff = high30d - low30d;

    const fib = {
      '0.0 (High)': high30d,
      '0.236': high30d - diff * 0.236,
      '0.382': high30d - diff * 0.382,
      '0.5': high30d - diff * 0.5,
      '0.618': high30d - diff * 0.618,
      '1.0 (Low)': low30d,
    };

    let rsiSignal = null;
    if (rsi != null) {
      if (rsi >= 70) rsiSignal = { text: 'Overbought', color: 'text-loss' };
      else if (rsi <= 30) rsiSignal = { text: 'Oversold', color: 'text-profit' };
      else rsiSignal = { text: 'Neutral', color: 'text-text-muted' };
    }

    const maSignal = ma7 && ma14
      ? ma7 > ma14
        ? { text: 'בוליש (MA7 > MA14)', color: 'text-profit' }
        : { text: 'בריש (MA7 < MA14)', color: 'text-loss' }
      : null;

    const pricePosition = diff > 0 ? ((currentPrice - low30d) / diff) * 100 : 50;

    return { rsi, rsiSignal, ma7, ma14, maSignal, volatility, high30d, low30d, fib, currentPrice, pricePosition };
  }, [rawPrices]);

  const chartColor = useMemo(() => {
    if (!chartData.length) return AI_FROM;
    return chartData[chartData.length - 1].price >= chartData[0].price ? '#22c55e' : '#ef4444';
  }, [chartData]);

  const md = coinData?.market_data;

  return (
    <div className="space-y-4 analysis-page">
      {/* Search Bar */}
      <div className="max-w-sm mx-auto" ref={searchRef}>
        <div className="relative flex items-center gap-2">
          <div className="relative flex-1">
            <div className="flex items-center gap-2 bg-bg-secondary border border-border-primary rounded-xl px-4 py-3 focus-within:border-accent-primary/50 transition-colors">
              <Search className="w-4 h-4 text-text-muted shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                setQuery(e.target.value);
                setSelectedCoin(null);
                // Clear previous analysis so quick-buttons always appear while typing
                if (coinData) setCoinData(null);
                if (error) setError(null);
              }}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder="חפש מטבע לניתוח..."
                className="bg-transparent text-sm text-text-primary placeholder-text-muted outline-none w-full"
              />
            </div>
            <AnimatePresence>
              {showSuggestions && suggestions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="absolute z-50 top-full mt-1 right-0 left-0 bg-bg-overlay border border-border-primary rounded-xl shadow-xl overflow-hidden"
                >
                  {suggestions.map((coin) => (
                    <button
                      key={coin.coingeckoId}
                      onClick={() => selectCoin(coin)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-bg-tertiary transition-colors cursor-pointer text-right"
                    >
                      {coin.thumb && <img src={coin.thumb} alt="" className="w-5 h-5 rounded-full" />}
                      <span className="text-text-primary font-medium">{coin.name}</span>
                      <span className="text-text-muted text-xs">{coin.symbol}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <motion.button
            onClick={() => analyze()}
            disabled={!selectedCoin || analyzing}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="relative flex items-center gap-2 text-white font-bold px-5 py-3 rounded-xl transition-all cursor-pointer text-sm disabled:opacity-30 disabled:cursor-not-allowed shrink-0 overflow-hidden"
            style={{ background: AI_GRADIENT, boxShadow: `0 6px 22px -4px ${AI_FROM}80` }}
          >
            {/* sheen sweep */}
            <motion.span
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)' }}
              animate={{ x: ['-120%', '120%'] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1.2 }}
            />
            <Sparkles className="w-4 h-4 relative" />
            <span className="relative">Analyze</span>
          </motion.button>
          {coinData && (
            <button onClick={reset} className="p-3 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer shrink-0 border border-border-primary" title="ניתוח חדש">
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Quick coin buttons */}
      {!coinData && !analyzing && (
        <div className="flex items-center gap-1.5 justify-center">
          {QUICK_COINS.map((c, i) => (
            <motion.button
              key={c.symbol}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => selectCoin(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                selectedCoin?.coingeckoId === c.coingeckoId
                  ? 'text-white border-transparent shadow-md'
                  : 'bg-bg-secondary text-text-secondary border-border-primary hover:border-accent-primary/40 hover:text-accent-primary hover:shadow-md hover:shadow-accent-primary/10'
              }`}
              style={selectedCoin?.coingeckoId === c.coingeckoId
                ? { background: AI_GRADIENT, boxShadow: `0 4px 14px -4px ${AI_FROM}80` }
                : undefined}
            >
              {c.symbol}
            </motion.button>
          ))}
        </div>
      )}

      {/* Analysis Animation */}
      <AnimatePresence>
        {analyzing && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-bg-secondary border border-accent-primary/20 rounded-2xl p-6 md:p-8 relative overflow-hidden"
          >
            <div className="absolute inset-0 opacity-[0.03]" style={{
              backgroundImage: 'linear-gradient(rgba(99,102,241,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.5) 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }} />
            <motion.div
              className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-primary/50 to-transparent"
              animate={{ top: ['0%', '100%'] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            />
            <div className="relative flex flex-col items-center gap-5">
              <div className="relative w-20 h-20">
                <motion.div className="absolute inset-0 rounded-full border-2 border-accent-primary/20"
                  animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <motion.div className="absolute inset-2 rounded-full border border-accent-primary/30"
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
                />
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-3 rounded-full bg-accent-primary/10 border border-accent-primary/30 flex items-center justify-center"
                >
                  <Sparkles className="w-7 h-7 text-accent-primary" />
                </motion.div>
              </div>
              <motion.p animate={{ opacity: [0.6, 1, 0.6] }} transition={{ duration: 1.5, repeat: Infinity }}
                className="text-xs font-mono text-accent-primary tracking-widest uppercase"
              >
                ANALYZING {selectedCoin?.symbol}
              </motion.p>
              <div className="w-full max-w-sm">
                <div className="w-full h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                  <motion.div className="h-full bg-gradient-to-r from-accent-primary to-accent-primary/60 rounded-full"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
                <p className="text-[10px] text-text-muted text-center mt-1 font-mono">{Math.round(scanProgress)}%</p>
              </div>
              <div className="space-y-1.5 w-full max-w-sm">
                {ANALYSIS_STEPS.map((step, i) => (
                  <motion.div key={i}
                    initial={{ opacity: 0, x: 20 }}
                    animate={i <= activeStep ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-2.5"
                  >
                    <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${i < activeStep ? 'bg-profit/15' : i === activeStep ? 'bg-accent-primary/15' : 'bg-bg-tertiary'}`}>
                      {i < activeStep ? (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-2 h-2 rounded-sm bg-profit" />
                      ) : i === activeStep ? (
                        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 0.8, repeat: Infinity }}>
                          <step.icon className="w-3 h-3 text-accent-primary" />
                        </motion.div>
                      ) : null}
                    </div>
                    <span className={`text-xs font-medium ${i < activeStep ? 'text-profit' : i === activeStep ? 'text-text-primary' : 'text-text-muted/30'}`}>
                      {step.text}
                      {i < activeStep && <span className="text-profit mr-1 font-mono text-[10px]"> [OK]</span>}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-loss/10 border border-loss/20 rounded-xl p-4 text-center">
          <p className="text-sm text-loss mb-2">{error}</p>
          <button onClick={() => analyze()} className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer underline">נסה שוב</button>
        </motion.div>
      )}

      {/* Results */}
      <AnimatePresence>
        {coinData && md && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="relative"
          >

            <div className="relative space-y-3">

              {/* === TOP ROW: Sentiment + Coin Info + 24h Range === */}
              {(() => {
                const tvSymbol = `${chartExchange}:${TV_SYMBOL_MAP[selectedCoin?.coingeckoId] || `${coinData.symbol?.toUpperCase()}USDT`}`;
                return (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* 24h Range — always show */}
                    <GlowCard delay={0.05}>
                      <div className="p-4 flex flex-col justify-center h-full">
                        <h3 className="text-[10px] font-semibold text-text-muted mb-2 flex items-center gap-1.5 justify-center">
                          <Gauge className="w-3 h-3 text-accent-primary" /> טווח 24 שעות
                        </h3>
                        {md.high_24h?.usd && md.low_24h?.usd ? (
                          <>
                            <div className="flex items-center justify-between text-xs mb-2">
                              <span className="text-loss font-semibold font-mono">{formatPrice(md.low_24h.usd)}</span>
                              <span className="text-profit font-semibold font-mono">{formatPrice(md.high_24h.usd)}</span>
                            </div>
                            <div className="relative h-3 bg-bg-tertiary rounded-full overflow-hidden">
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 1 }}
                                className="absolute inset-0 rounded-full"
                                style={{ background: 'linear-gradient(to right, rgba(239,68,68,0.4), rgba(234,179,8,0.3), rgba(34,197,94,0.4))' }}
                              />
                              {md.current_price?.usd && (() => {
                                const range = md.high_24h.usd - md.low_24h.usd;
                                const pos = range > 0 ? ((md.current_price.usd - md.low_24h.usd) / range) * 100 : 50;
                                return (
                                  <motion.div
                                    initial={{ left: '50%' }}
                                    animate={{ left: `calc(${Math.min(100, Math.max(0, pos))}% - 7px)` }}
                                    transition={{ duration: 1.5, type: 'spring' }}
                                    className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-accent-primary shadow-lg shadow-accent-primary/30"
                                  />
                                );
                              })()}
                            </div>
                            <p className="text-[10px] text-text-muted text-center mt-2">
                              נוכחי: <span className="text-text-primary font-semibold">{formatPrice(md.current_price?.usd)}</span>
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-text-muted text-center py-4">
                            {formatPrice(md.current_price?.usd) || '—'}
                          </p>
                        )}
                      </div>
                    </GlowCard>

                    {/* TradingView Mini Chart */}
                    <GlowCard delay={0.1}>
                      <div className="h-full overflow-hidden rounded-2xl">
                        <TVEmbed
                          widget="mini-symbol-overview"
                          config={{
                            symbol: tvSymbol,
                            width: '100%',
                            height: '100%',
                            locale: 'he_IL',
                            dateRange: '1D',
                            colorTheme: (typeof document !== 'undefined' && document.documentElement.classList.contains('light')) ? 'light' : 'dark',
                            isTransparent: true,
                            autosize: true,
                          }}
                          minH="200px"
                        />
                      </div>
                    </GlowCard>

                    {/* Sentiment */}
                    {sentiment && (
                      <GlowCard delay={0.15} glowColor={`${sentiment.rawColor}22`}>
                        <div className="p-4 flex flex-col items-center justify-center h-full relative">
                          <motion.div
                            animate={{ scale: [1, 1.15, 1], opacity: [0.15, 0.3, 0.15] }}
                            transition={{ duration: 3, repeat: Infinity }}
                            className="absolute inset-0 rounded-2xl"
                            style={{ boxShadow: `inset 0 0 40px ${sentiment.rawColor}15` }}
                          />
                          <div className="relative flex flex-col items-center gap-2">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${sentiment.color === 'text-profit' ? 'bg-profit/10' : sentiment.color === 'text-loss' ? 'bg-loss/10' : 'bg-amber-500/10'}`}>
                              <motion.div animate={{ rotate: [0, 5, -5, 0] }} transition={{ duration: 4, repeat: Infinity }}>
                                <sentiment.icon className={`w-6 h-6 ${sentiment.color}`} />
                              </motion.div>
                            </div>
                            <div className="text-center">
                              <motion.p
                                animate={{ opacity: [0.7, 1, 0.7] }}
                                transition={{ duration: 2, repeat: Infinity }}
                                className={`text-lg font-bold font-mono tracking-wider ${sentiment.color}`}
                              >
                                {sentiment.label}
                              </motion.p>
                              <p className="text-[10px] text-text-muted mt-0.5">{sentiment.desc}</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <PulseDot color={sentiment.color === 'text-profit' ? 'bg-profit' : sentiment.color === 'text-loss' ? 'bg-loss' : 'bg-amber-500'} />
                              <span className="text-[9px] text-text-muted font-mono">LIVE SIGNAL</span>
                            </div>
                          </div>
                        </div>
                      </GlowCard>
                    )}
                  </div>
                );
              })()}

              {/* Combined performance + stats row */}
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {[
                  md.price_change_percentage_24h != null && {
                    label: '24 שעות',
                    value: `${LRM}${md.price_change_percentage_24h >= 0 ? '+' : ''}${md.price_change_percentage_24h.toFixed(2)}%`,
                    valueColor: md.price_change_percentage_24h >= 0 ? 'text-profit' : 'text-loss',
                    icon: md.price_change_percentage_24h >= 0 ? TrendingUp : TrendingDown,
                  },
                  md.price_change_percentage_7d != null && {
                    label: '7 ימים',
                    value: `${LRM}${md.price_change_percentage_7d >= 0 ? '+' : ''}${md.price_change_percentage_7d.toFixed(2)}%`,
                    valueColor: md.price_change_percentage_7d >= 0 ? 'text-profit' : 'text-loss',
                    icon: md.price_change_percentage_7d >= 0 ? TrendingUp : TrendingDown,
                  },
                  md.price_change_percentage_30d != null && {
                    label: '30 ימים',
                    value: `${LRM}${md.price_change_percentage_30d >= 0 ? '+' : ''}${md.price_change_percentage_30d.toFixed(2)}%`,
                    valueColor: md.price_change_percentage_30d >= 0 ? 'text-profit' : 'text-loss',
                    icon: md.price_change_percentage_30d >= 0 ? TrendingUp : TrendingDown,
                  },
                  { label: 'שווי שוק', value: formatNum(md.market_cap?.usd), icon: BarChart3 },
                  { label: 'נפח 24h', value: formatNum(md.total_volume?.usd), icon: Activity },
                  { label: 'ATH', value: formatPrice(md.ath?.usd), sub: md.ath_change_percentage?.usd != null ? `${md.ath_change_percentage.usd.toFixed(1)}%` : null, subColor: 'text-loss' },
                ].filter(Boolean).map((item, i) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: 0.2 + i * 0.05, type: 'spring', stiffness: 120 }}
                    className="h-full"
                  >
                    <StatBox {...item} />
                  </motion.div>
                ))}
              </div>

              {/* AI Project Description */}
              {(projectDesc || projectDescLoading || projectDescError) && (
                <ProjectDescription
                  coin={selectedCoin}
                  description={projectDesc}
                  loading={projectDescLoading}
                  error={projectDescError}
                  expanded={projectDescExpanded}
                  onToggle={() => setProjectDescExpanded((v) => !v)}
                  onRetry={() => loadProjectDescription(selectedCoin, { force: true })}
                />
              )}

              {/* Technical Indicators */}
              {technicals && (
                <GlowCard delay={0.4} glowColor="rgba(99,102,241,0.2)">
                  <div className="p-4">
                    <h3 className="text-xs font-semibold text-text-secondary mb-3 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-accent-primary" /> אינדיקטורים טכניים
                      <PulseDot />
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {/* RSI */}
                      {technicals.rsi != null && (
                        <motion.div className="text-center"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.45 }}
                        >
                          <p className="text-[10px] text-text-muted mb-1 font-mono">RSI (14)</p>
                          <div className="relative h-2.5 bg-bg-tertiary rounded-full overflow-hidden mb-1.5">
                            <div className="absolute left-0 top-0 bottom-0 w-[30%] bg-profit/20 rounded-l-full" />
                            <div className="absolute right-0 top-0 bottom-0 w-[30%] bg-loss/20 rounded-r-full" />
                            <motion.div
                              initial={{ left: '50%' }}
                              animate={{ left: `calc(${Math.min(100, Math.max(0, technicals.rsi))}% - 5px)` }}
                              transition={{ duration: 1.5, type: 'spring' }}
                              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 shadow-md"
                              style={{ borderColor: technicals.rsi >= 70 ? '#ef4444' : technicals.rsi <= 30 ? '#22c55e' : AI_FROM }}
                            />
                          </div>
                          <AnimatedValue value={technicals.rsi.toFixed(1)} className="text-sm font-bold text-text-primary" />
                          <p className={`text-[10px] font-semibold ${technicals.rsiSignal.color}`}>{technicals.rsiSignal.text}</p>
                        </motion.div>
                      )}

                      {/* MA Signal */}
                      {technicals.maSignal && (
                        <motion.div className="text-center"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.5 }}
                        >
                          <p className="text-[10px] text-text-muted mb-1 font-mono">Moving Avg</p>
                          <p className="text-[10px] text-text-muted mt-1">MA7: <span className="text-text-primary font-semibold">{formatPrice(technicals.ma7)}</span></p>
                          <p className="text-[10px] text-text-muted">MA14: <span className="text-text-primary font-semibold">{formatPrice(technicals.ma14)}</span></p>
                          <p className={`text-[10px] font-semibold mt-1 ${technicals.maSignal.color}`}>{technicals.maSignal.text}</p>
                        </motion.div>
                      )}

                      {/* Volatility */}
                      {technicals.volatility != null && (
                        <motion.div className="text-center"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.55 }}
                        >
                          <p className="text-[10px] text-text-muted mb-1 font-mono">Volatility</p>
                          <AnimatedValue value={`${technicals.volatility.toFixed(2)}%`} className="text-sm font-bold text-text-primary" />
                          <p className={`text-[10px] font-semibold ${technicals.volatility > 5 ? 'text-loss' : technicals.volatility > 2 ? 'text-amber-500' : 'text-profit'}`}>
                            {technicals.volatility > 5 ? 'גבוהה מאוד' : technicals.volatility > 2 ? 'בינונית' : 'נמוכה'}
                          </p>
                        </motion.div>
                      )}

                      {/* 30d Range */}
                      <motion.div className="text-center"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.6 }}
                      >
                        <p className="text-[10px] text-text-muted mb-1 font-mono">30D Range</p>
                        <div className="relative h-2.5 bg-bg-tertiary rounded-full overflow-hidden mb-1.5">
                          <motion.div className="absolute inset-0 rounded-full"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            style={{ background: 'linear-gradient(to right, rgba(239,68,68,0.3), rgba(34,197,94,0.3))' }}
                          />
                          <motion.div
                            initial={{ left: '50%' }}
                            animate={{ left: `calc(${Math.min(100, Math.max(0, technicals.pricePosition))}% - 5px)` }}
                            transition={{ duration: 1.5, type: 'spring' }}
                            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-accent-primary shadow-md"
                          />
                        </div>
                        <AnimatedValue value={`${technicals.pricePosition.toFixed(0)}%`} className="text-sm font-bold text-text-primary" />
                        <p className="text-[10px] text-text-muted">
                          {technicals.pricePosition > 80 ? 'קרוב לשיא' : technicals.pricePosition < 20 ? 'קרוב לשפל' : 'אמצע הטווח'}
                        </p>
                      </motion.div>
                    </div>
                  </div>
                </GlowCard>
              )}

              {/* Fibonacci Levels */}
              {technicals && (
                <GlowCard delay={0.5} glowColor="rgba(99,102,241,0.15)">
                  <div className="p-4">
                    <h3 className="text-xs font-semibold text-text-secondary mb-3 flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-accent-primary" /> רמות פיבונאצ׳י (30 יום)
                    </h3>
                    <div className="space-y-1">
                      {Object.entries(technicals.fib).map(([level, price], i) => {
                        const isCurrent = Math.abs(price - technicals.currentPrice) / technicals.currentPrice < 0.02;
                        return (
                          <motion.div
                            key={level}
                            initial={{ opacity: 0, x: 15 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.55 + i * 0.06 }}
                            className={`flex items-center justify-between py-1.5 px-2.5 rounded-lg text-xs ${isCurrent ? 'bg-accent-primary/10 border border-accent-primary/20' : 'hover:bg-bg-tertiary/50'} transition-colors`}
                          >
                            <span className="text-text-muted font-mono text-[11px]">{level}</span>
                            <div className="flex items-center gap-2">
                              {isCurrent && <PulseDot />}
                              <span className={`font-semibold font-mono ${isCurrent ? 'text-accent-primary' : 'text-text-primary'}`}>
                                {formatPrice(price)}
                              </span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                </GlowCard>
              )}

              {/* Supply */}
              {md.circulating_supply > 0 && (
                <GlowCard delay={0.6}>
                  <div className="p-4">
                    <h3 className="text-xs font-semibold text-text-secondary mb-3 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-accent-primary" /> היצע
                    </h3>
                    <div className="flex items-center justify-between text-xs text-text-muted mb-2">
                      <span>במחזור: <span className="text-text-primary font-semibold">{formatSupply(md.circulating_supply)}</span></span>
                      {md.max_supply && <span>מקסימום: <span className="text-text-primary font-semibold">{formatSupply(md.max_supply)}</span></span>}
                      {!md.max_supply && md.total_supply && <span>כולל: <span className="text-text-primary font-semibold">{formatSupply(md.total_supply)}</span></span>}
                    </div>
                    {md.max_supply > 0 && (
                      <div className="w-full h-3 bg-bg-tertiary rounded-full overflow-hidden relative">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, (md.circulating_supply / md.max_supply) * 100)}%` }}
                          transition={{ duration: 2, delay: 0.3, ease: 'easeOut' }}
                          className="h-full bg-gradient-to-r from-accent-primary to-accent-primary/60 rounded-full"
                        />
                        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-text-primary">
                          {((md.circulating_supply / md.max_supply) * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                </GlowCard>
              )}

              {/* Chart */}
              {chartData.length > 0 && (
                <GlowCard delay={0.7}>
                  <div className="p-4">
                    <h3 className="text-xs font-semibold text-text-secondary mb-3 flex items-center gap-1.5">
                      <BarChart3 className="w-3.5 h-3.5 text-accent-primary" /> מחיר 30 ימים
                      {technicals?.ma7 && (
                        <span className="text-[9px] text-text-muted mr-auto flex items-center gap-2">
                          <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-amber-500 rounded inline-block" /> MA7</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-cyan-500 rounded inline-block" /> MA14</span>
                        </span>
                      )}
                    </h3>
                    <motion.div
                      initial={{ opacity: 0, scaleY: 0.8 }}
                      animate={{ opacity: 1, scaleY: 1 }}
                      transition={{ delay: 0.8, duration: 0.6 }}
                      className="h-52 origin-bottom" dir="ltr"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="coinGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={chartColor} stopOpacity={0.25} />
                              <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1 ? `$${v.toLocaleString()}` : `$${v.toFixed(4)}`} width={65} />
                          <Tooltip
                            contentStyle={{ backgroundColor: 'var(--color-bg-overlay)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 12, fontSize: 12, color: 'var(--color-text-primary)' }}
                            labelStyle={{ color: 'var(--color-text-secondary)' }}
                            formatter={(v) => [formatPrice(v), 'מחיר']}
                          />
                          {technicals?.ma7 && <ReferenceLine y={technicals.ma7} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1} />}
                          {technicals?.ma14 && <ReferenceLine y={technicals.ma14} stroke="#06b6d4" strokeDasharray="4 4" strokeWidth={1} />}
                          <Area type="monotone" dataKey="price" stroke={chartColor} strokeWidth={2} fill="url(#coinGrad)" dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </motion.div>
                  </div>
                </GlowCard>
              )}

              {/* Liquidation Heatmap */}
              {heatmapKlines && <LiquidityHeatmap pair={TV_SYMBOL_MAP[selectedCoin?.coingeckoId] || `${coinData.symbol?.toUpperCase()}USDT`} klines={heatmapKlines} />}

              {/* Liquidity & Market Microstructure */}
              {liquidityData && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.5 }}
                >
                  <div className="flex items-center gap-1.5 mb-2 px-1">
                    <Activity className="w-3.5 h-3.5 text-accent-primary" />
                    <h3 className="text-xs font-semibold text-text-secondary">Liquidity &amp; Market Microstructure</h3>
                    <PulseDot />
                  </div>

                  {/* Row 1: Spread + OI + Funding */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                    {/* Bid-Ask Spread */}
                    {liquidityData.bookTicker && (() => {
                      const bid = parseFloat(liquidityData.bookTicker.bidPrice);
                      const ask = parseFloat(liquidityData.bookTicker.askPrice);
                      const spreadAbs = Math.abs(ask - bid);
                      const spreadPct = bid > 0 ? (spreadAbs / bid) * 100 : 0;
                      // Format spread: show $ absolute + % with enough precision
                      const spreadDisplay = spreadAbs >= 0.01
                        ? `$${spreadAbs.toFixed(2)}`
                        : `$${spreadAbs.toFixed(6)}`;
                      const spreadPctDisplay = spreadPct < 0.001
                        ? `${spreadPct.toFixed(6)}%`
                        : `${spreadPct.toFixed(4)}%`;
                      return (
                        <GlowCard delay={0} glowColor="rgba(99,102,241,0.15)">
                          <div className="p-4">
                            <h4 className="text-[10px] font-semibold text-text-muted mb-3 flex items-center gap-1.5 justify-center">
                              <BookOpen className="w-3 h-3 text-accent-primary" /> Bid-Ask Spread
                            </h4>
                            <div className="flex justify-between items-center mb-2 gap-2">
                              <div className="flex-1 text-center p-2 rounded-lg bg-profit/10 border border-profit/20">
                                <p className="text-[9px] text-text-muted font-mono mb-0.5">BID</p>
                                <p className="text-xs font-bold text-profit font-mono">{formatPrice(bid)}</p>
                              </div>
                              <div className="text-center px-1 min-w-[60px]">
                                <p className="text-[9px] text-text-muted">SPREAD</p>
                                <p className="text-[11px] font-bold text-text-primary font-mono">{spreadDisplay}</p>
                                <p className="text-[9px] text-text-muted font-mono">{spreadPctDisplay}</p>
                              </div>
                              <div className="flex-1 text-center p-2 rounded-lg bg-loss/10 border border-loss/20">
                                <p className="text-[9px] text-text-muted font-mono mb-0.5">ASK</p>
                                <p className="text-xs font-bold text-loss font-mono">{formatPrice(ask)}</p>
                              </div>
                            </div>
                            <p className={`text-[10px] text-center font-semibold ${spreadPct < 0.01 ? 'text-profit' : spreadPct < 0.05 ? 'text-amber-500' : 'text-loss'}`}>
                              {spreadPct < 0.01 ? 'Very Tight — High Liquidity' : spreadPct < 0.05 ? 'Normal Spread' : 'Wide Spread — Low Liquidity'}
                            </p>
                          </div>
                        </GlowCard>
                      );
                    })()}

                    {/* Open Interest */}
                    {liquidityData.openInterest && (() => {
                      const oi = parseFloat(liquidityData.openInterest.openInterest);
                      const price = md?.current_price?.usd || 0;
                      const oiUsd = oi * price;
                      return (
                        <GlowCard delay={0.05} glowColor="rgba(139,92,246,0.15)">
                          <div className="p-4">
                            <h4 className="text-[10px] font-semibold text-text-muted mb-3 flex items-center gap-1.5 justify-center">
                              <BarChart3 className="w-3 h-3 text-violet-400" /> Open Interest
                            </h4>
                            <div className="text-center mb-2">
                              <AnimatedValue value={formatNum(oiUsd)} className="text-lg font-bold text-violet-400" />
                              <p className="text-[10px] text-text-muted mt-0.5">{oi.toLocaleString(undefined, { maximumFractionDigits: 2 })} contracts</p>
                            </div>
                            <p className="text-[10px] text-center text-text-muted">
                              {oiUsd > 1e9 ? 'High Institutional Interest' : oiUsd > 1e8 ? 'Moderate OI' : 'Low Open Interest'}
                            </p>
                          </div>
                        </GlowCard>
                      );
                    })()}

                    {/* Funding Rate */}
                    {liquidityData.funding && (() => {
                      const rate = parseFloat(liquidityData.funding.lastFundingRate) * 100;
                      const nextTime = liquidityData.funding.nextFundingTime;
                      const msUntil = nextTime ? nextTime - Date.now() : 0;
                      const hUntil = Math.floor(msUntil / 3600000);
                      const mUntil = Math.floor((msUntil % 3600000) / 60000);
                      return (
                        <GlowCard delay={0.1} glowColor={rate > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)'}>
                          <div className="p-4">
                            <h4 className="text-[10px] font-semibold text-text-muted mb-3 flex items-center gap-1.5 justify-center">
                              <Zap className="w-3 h-3 text-amber-400" /> Funding Rate
                            </h4>
                            <div className="text-center mb-2">
                              <AnimatedValue
                                value={`${LRM}${rate >= 0 ? '+' : ''}${rate.toFixed(4)}%`}
                                className={`text-lg font-bold font-mono ${rate > 0 ? 'text-loss' : rate < 0 ? 'text-profit' : 'text-text-secondary'}`}
                              />
                              <p className={`text-[10px] mt-0.5 font-semibold ${rate > 0.01 ? 'text-loss' : rate < -0.01 ? 'text-profit' : 'text-text-muted'}`}>
                                {rate > 0.01 ? 'Longs pay Shorts' : rate < -0.01 ? 'Shorts pay Longs' : 'Neutral Funding'}
                              </p>
                            </div>
                            {nextTime && msUntil > 0 && (
                              <p className="text-[10px] text-center text-text-muted">
                                Next: <span className="text-text-secondary font-mono">{hUntil}h {mUntil}m</span>
                              </p>
                            )}
                          </div>
                        </GlowCard>
                      );
                    })()}
                  </div>

                  {/* Row 2: Order Book Depth + Liquidations */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Order Book Depth */}
                    {liquidityData.depth && (() => {
                      const bids = (liquidityData.depth.bids || []).slice(0, 8).map(([p, q]) => ({ price: parseFloat(p), qty: parseFloat(q) }));
                      const asks = (liquidityData.depth.asks || []).slice(0, 8).map(([p, q]) => ({ price: parseFloat(p), qty: parseFloat(q) }));
                      const allQtys = [...bids.map(b => b.qty), ...asks.map(a => a.qty)];
                      const maxQty = allQtys.length ? Math.max(...allQtys) : 1;
                      const totalBids = bids.reduce((s, b) => s + b.qty, 0);
                      const totalAsks = asks.reduce((s, a) => s + a.qty, 0);
                      const bidPct = totalBids + totalAsks > 0 ? (totalBids / (totalBids + totalAsks)) * 100 : 50;
                      return (
                        <GlowCard delay={0.15} glowColor="rgba(34,197,94,0.12)">
                          <div className="p-4">
                            <h4 className="text-[10px] font-semibold text-text-muted mb-2 flex items-center gap-1.5">
                              <Activity className="w-3 h-3 text-accent-primary" /> Order Book Depth
                              <span className="mr-auto flex items-center gap-2">
                                <span className="text-[9px] text-profit font-mono">{bidPct.toFixed(0)}% Bids</span>
                                <span className="text-[9px] text-loss font-mono">{(100 - bidPct).toFixed(0)}% Asks</span>
                              </span>
                            </h4>
                            <div className="h-1.5 rounded-full overflow-hidden flex mb-3">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${bidPct}%` }}
                                transition={{ duration: 1, ease: 'easeOut' }}
                                className="h-full bg-profit"
                              />
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${100 - bidPct}%` }}
                                transition={{ duration: 1, ease: 'easeOut' }}
                                className="h-full bg-loss"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-0.5">
                                <p className="text-[9px] text-profit font-bold text-center mb-1 font-mono">BIDS</p>
                                {bids.map((b, i) => (
                                  <div key={i} className="relative h-4 rounded overflow-hidden bg-bg-tertiary/30">
                                    <motion.div
                                      initial={{ width: 0 }}
                                      animate={{ width: `${(b.qty / maxQty) * 100}%` }}
                                      transition={{ duration: 0.7, delay: i * 0.04 }}
                                      className="absolute inset-y-0 right-0 bg-profit/25"
                                    />
                                    <div className="absolute inset-0 flex items-center justify-between px-1">
                                      <span className="text-[8px] font-mono text-profit">{formatPrice(b.price)}</span>
                                      <span className="text-[8px] font-mono text-text-muted">{b.qty.toFixed(2)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="space-y-0.5">
                                <p className="text-[9px] text-loss font-bold text-center mb-1 font-mono">ASKS</p>
                                {asks.map((a, i) => (
                                  <div key={i} className="relative h-4 rounded overflow-hidden bg-bg-tertiary/30">
                                    <motion.div
                                      initial={{ width: 0 }}
                                      animate={{ width: `${(a.qty / maxQty) * 100}%` }}
                                      transition={{ duration: 0.7, delay: i * 0.04 }}
                                      className="absolute inset-y-0 left-0 bg-loss/25"
                                    />
                                    <div className="absolute inset-0 flex items-center justify-between px-1">
                                      <span className="text-[8px] font-mono text-loss">{formatPrice(a.price)}</span>
                                      <span className="text-[8px] font-mono text-text-muted">{a.qty.toFixed(2)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </GlowCard>
                      );
                    })()}

                    {/* Liquidation Heatmap */}
                    {(() => {
                      // null = API error (no futures pair), [] = valid but no events in 24h
                      const noFutures = liquidityData.forceOrders === null;
                      const orders = liquidityData.forceOrders || [];
                      const longLiqs = orders.filter(o => o.side === 'SELL');
                      const shortLiqs = orders.filter(o => o.side === 'BUY');
                      const longLiqVal = longLiqs.reduce((s, o) => s + parseFloat(o.origQty || 0) * parseFloat(o.avgPrice || o.price || 0), 0);
                      const shortLiqVal = shortLiqs.reduce((s, o) => s + parseFloat(o.origQty || 0) * parseFloat(o.avgPrice || o.price || 0), 0);
                      const total = longLiqVal + shortLiqVal;
                      const longPct = total > 0 ? (longLiqVal / total) * 100 : 50;
                      return (
                        <GlowCard delay={0.2} glowColor="rgba(251,146,60,0.12)">
                          <div className="p-4">
                            <h4 className="text-[10px] font-semibold text-text-muted mb-2 flex items-center gap-1.5">
                              <Flame className="w-3 h-3 text-orange-400" /> Liquidation Heatmap
                              {!noFutures && <span className="mr-auto text-[9px] text-text-muted font-mono">{orders.length} events / 24h</span>}
                            </h4>
                            {noFutures ? (
                              /* No futures pair — show Coinglass link */
                              <div className="text-center py-3">
                                <p className="text-[10px] text-text-muted mb-3">No perpetual futures for this pair</p>
                                <a
                                  href={`https://coinglass.com/LiquidationData`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/15 border border-orange-500/30 text-orange-400 text-[10px] font-semibold hover:bg-orange-500/25 transition-colors"
                                >
                                  <Flame className="w-3 h-3" /> View on Coinglass
                                </a>
                              </div>
                            ) : total > 0 ? (
                              <>
                                <div className="h-1.5 rounded-full overflow-hidden flex mb-3">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${longPct}%` }}
                                    transition={{ duration: 1 }}
                                    className="h-full bg-loss"
                                  />
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${100 - longPct}%` }}
                                    transition={{ duration: 1 }}
                                    className="h-full bg-profit"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                  <div className="text-center p-2 rounded-lg bg-loss/10 border border-loss/20">
                                    <p className="text-[9px] text-text-muted mb-0.5 font-mono">LONGS LIQ.</p>
                                    <p className="text-xs font-bold text-loss">{formatNum(longLiqVal)}</p>
                                    <p className="text-[9px] text-text-muted">{longLiqs.length} events</p>
                                  </div>
                                  <div className="text-center p-2 rounded-lg bg-profit/10 border border-profit/20">
                                    <p className="text-[9px] text-text-muted mb-0.5 font-mono">SHORTS LIQ.</p>
                                    <p className="text-xs font-bold text-profit">{formatNum(shortLiqVal)}</p>
                                    <p className="text-[9px] text-text-muted">{shortLiqs.length} events</p>
                                  </div>
                                </div>
                                <p className="text-[10px] text-center text-text-muted">
                                  Total <span className="text-text-secondary font-semibold">{formatNum(total)}</span>
                                  {' · '}
                                  <span className={`font-semibold ${longPct > 60 ? 'text-loss' : longPct < 40 ? 'text-profit' : 'text-amber-500'}`}>
                                    {longPct > 60 ? 'More Longs Liquidated' : longPct < 40 ? 'More Shorts Squeezed' : 'Balanced'}
                                  </span>
                                </p>
                                <a
                                  href={`https://coinglass.com/LiquidationData`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center justify-center gap-1 mt-2 text-[9px] text-text-muted hover:text-orange-400 transition-colors"
                                >
                                  Full heatmap on Coinglass ↗
                                </a>
                              </>
                            ) : (
                              /* Valid futures pair, but 0 events in 24h */
                              <div className="text-center py-3">
                                <p className="text-[10px] text-text-muted mb-1">No liquidations in the last 24h</p>
                                <p className="text-[9px] text-profit font-semibold">Low volatility environment 🟢</p>
                                <a
                                  href={`https://coinglass.com/LiquidationData`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 mt-2 text-[9px] text-text-muted hover:text-orange-400 transition-colors"
                                >
                                  Full heatmap on Coinglass ↗
                                </a>
                              </div>
                            )}
                          </div>
                        </GlowCard>
                      );
                    })()}
                  </div>
                </motion.div>
              )}

              {/* Footer timestamp */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 }}
                className="flex items-center justify-center gap-2 pt-2"
              >
                <PulseDot />
                <span className="text-[10px] font-mono text-text-muted">
                  ANALYSIS COMPLETE — {new Date().toLocaleTimeString('he-IL')}
                </span>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- Liquidation Heatmap (Canvas, Coinglass-style) ----
// Estimated resting liquidation levels: every candle "opens positions" at its
// close, weighted by its notional volume, with liquidation prices at common
// leverages. Levels persist until price trades through them (liquidity swept),
// producing the signature horizontal bands.
function heatColor(v) {
  if (v <= 0.004) return null;
  const stops = [
    [0,    [22,  12,  58]],
    [0.18, [48,  24,  110]],
    [0.38, [110, 35,  150]],
    [0.58, [200, 60,  110]],
    [0.78, [250, 140, 40]],
    [1.0,  [255, 250, 150]],
  ];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (v >= stops[i][0] && v <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break; }
  }
  const t = hi[0] === lo[0] ? 0 : (v - lo[0]) / (hi[0] - lo[0]);
  const r = Math.round(lo[1][0] + (hi[1][0] - lo[1][0]) * t);
  const g = Math.round(lo[1][1] + (hi[1][1] - lo[1][1]) * t);
  const b = Math.round(lo[1][2] + (hi[1][2] - lo[1][2]) * t);
  const a = Math.min(1, 0.18 + v * 1.45);
  return `rgba(${r},${g},${b},${a})`;
}

// Common leverage tiers and how much of the volume we attribute to each.
const LIQ_LEVERAGES = [[100, 1.0], [50, 0.85], [25, 0.6], [10, 0.4]];

const HEATMAP_PERIODS = [
  { key: '12H', label: '12 Hour', interval: '5m',  limit: 144 },
  { key: '24H', label: '24 Hour', interval: '15m', limit: 96  },
  { key: '48H', label: '48 Hour', interval: '15m', limit: 192 },
  { key: '3D',  label: '3 Day',   interval: '30m', limit: 144 },
  { key: '1W',  label: '1 Week',  interval: '1h',  limit: 168 },
  { key: '2W',  label: '2 Week',  interval: '2h',  limit: 168 },
  { key: '1M',  label: '1 Month', interval: '4h',  limit: 180 },
];

function buildHeatmap(klines, priceBuckets = 150) {
  if (!klines || klines.length < 2) return null;
  const candles = klines.map(k => ({
    time:   k[0],
    open:   parseFloat(k[1]),
    high:   parseFloat(k[2]),
    low:    parseFloat(k[3]),
    close:  parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
  // The domain must reach the far liquidation tiers — 10x positions
  // liquidate ±10% away from price, so the axis extends ~±11.5% beyond the
  // traded range (this is why Coinglass charts show price as a narrow band
  // in the middle with the big walls above and below).
  const priceMin = Math.min(...candles.map(c => c.low)) * 0.89;
  const priceMax = Math.max(...candles.map(c => c.high)) * 1.11;
  const priceRange = priceMax - priceMin;
  if (priceRange <= 0) return null;

  const binOf = (price) =>
    Math.max(0, Math.min(priceBuckets - 1, Math.floor(((price - priceMin) / priceRange) * priceBuckets)));

  const levels = new Float64Array(priceBuckets);
  const grid = [];
  // Soft vertical kernel — liq levels are zones, not single-pixel lines
  const KERNEL = [[-2, 0.12], [-1, 0.5], [0, 1], [1, 0.5], [2, 0.12]];
  const addLevel = (price, weight) => {
    const b0 = binOf(price);
    for (const [off, k] of KERNEL) {
      const b = b0 + off;
      if (b >= 0 && b < priceBuckets) levels[b] += weight * k;
    }
  };
  for (const c of candles) {
    // 1) Price traded through these bins — most resting liquidity is consumed
    //    (a faint trace survives, like the real maps)
    const loB = binOf(c.low), hiB = binOf(c.high);
    for (let b = loB; b <= hiB; b++) levels[b] *= 0.12;
    // 2) Old untouched levels fade slowly
    for (let b = 0; b < priceBuckets; b++) levels[b] *= 0.988;
    // 3) Ambient layer: a sliver of every candle's notional spread across all
    //    levels — fills the field with the low-liquidity purple wash instead
    //    of leaving pure black between bands.
    const notional = c.volume * c.close;
    const ambient = (notional * 0.06) / priceBuckets;
    for (let b = 0; b < priceBuckets; b++) levels[b] += ambient;
    // 4) New positions opened this candle leave liq zones above and below,
    //    weighted in USD (coin volume × level price) so the scale is real.
    for (const [lev, w] of LIQ_LEVERAGES) {
      const longLiq  = c.close * (1 - 1 / lev);
      const shortLiq = c.close * (1 + 1 / lev);
      if (longLiq  > priceMin) addLevel(longLiq,  c.volume * w * longLiq);
      if (shortLiq < priceMax) addLevel(shortLiq, c.volume * w * shortLiq);
    }
    grid.push(Float64Array.from(levels));
  }

  let maxVal = 0;
  for (const col of grid) for (const v of col) if (v > maxVal) maxVal = v;
  if (maxVal === 0) return null;
  // Scaled-log normalization. A plain log1p(v)/log1p(max) pushes even weak
  // levels toward 1 when max is huge (everything glowed orange); compressing
  // the RATIO keeps the background dark and the real walls bright.
  const K = 40;
  const logK = Math.log1p(K);
  const normalized = grid.map(col => Array.from(col, v => Math.log1p((v / maxVal) * K) / logK));
  return { normalized, raw: grid, maxVal, candles, priceMin, priceMax, timeBuckets: candles.length, priceBuckets };
}

function formatHeatPrice(price) {
  if (price >= 1000) return `$${Math.round(price).toLocaleString()}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(4)}`;
}

function formatLiqUsd(v) {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function LiquidityHeatmap({ pair, klines }) {
  const canvasRef = useRef(null);
  const baseRef = useRef(null); // offscreen cache of the heat layer
  const hoverRef = useRef(null);
  const cacheRef = useRef({});
  const [period, setPeriod] = useState('1W');
  const [menuOpen, setMenuOpen] = useState(false);
  const [data, setData] = useState(() => (klines ? klines.slice(-168) : null));

  // Each timeframe loads its own kline resolution (5m → 4h) via the worker
  // proxy, cached per pair+period for instant switching.
  useEffect(() => {
    const cfg = HEATMAP_PERIODS.find(p => p.key === period);
    if (!cfg) return;
    let cancelled = false;
    const key = `${pair}:${period}`;
    if (cacheRef.current[key]) { setData(cacheRef.current[key]); return; }
    if (period === '1W' && klines) {
      // default view is served from the klines we already fetched (1h)
      const sliced = klines.slice(-cfg.limit);
      cacheRef.current[key] = sliced;
      setData(sliced);
      return;
    }
    fetchKlines(pair, cfg.interval, cfg.limit)
      .then((k) => {
        if (!cancelled && Array.isArray(k) && k.length > 10) {
          cacheRef.current[key] = k;
          setData(k);
        }
      })
      .catch(() => { /* keep showing the previous timeframe */ });
    return () => { cancelled = true; };
  }, [period, pair, klines]);

  const heatData = useMemo(() => buildHeatmap(data, 150), [data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !heatData) return;

    const PL = 40, PR = 58, PT = 8, PB = 18;

    const renderBase = (W, H, dpr) => {
      const off = document.createElement('canvas');
      off.width = W * dpr;
      off.height = H * dpr;
      const ctx = off.getContext('2d');
      ctx.scale(dpr, dpr);

      const plotW = W - PR - PL;
      const plotH = H - PT - PB;
      const { normalized, maxVal, candles, priceMin, priceMax, timeBuckets, priceBuckets } = heatData;
      const priceRange = priceMax - priceMin;
      const toX = (i) => PL + ((i + 0.5) / timeBuckets) * plotW;
      const toY = (price) => PT + (1 - (price - priceMin) / priceRange) * plotH;

      // Background
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, W, H);

      // Heat cells — persisting levels render as horizontal liquidity bands.
      // Drawn on their own layer and composited through a slight blur so the
      // field reads smooth instead of pixelated strips.
      const cellW = plotW / timeBuckets;
      const cellH = plotH / priceBuckets;
      const heatLayer = document.createElement('canvas');
      heatLayer.width = W * dpr;
      heatLayer.height = H * dpr;
      const hctx = heatLayer.getContext('2d');
      hctx.scale(dpr, dpr);
      for (let t = 0; t < timeBuckets; t++) {
        for (let p = 0; p < priceBuckets; p++) {
          const c = heatColor(normalized[t][p]);
          if (!c) continue;
          hctx.fillStyle = c;
          hctx.fillRect(PL + t * cellW, PT + (priceBuckets - 1 - p) * cellH, cellW + 0.5, cellH + 0.5);
        }
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(PL, PT, plotW, plotH);
      ctx.clip();
      ctx.filter = 'blur(1.1px)';
      ctx.drawImage(heatLayer, 0, 0, W, H);
      ctx.filter = 'none';
      ctx.restore();

      // Candlestick overlay (TradingView colours)
      const bodyW = Math.max(1.5, cellW * 0.7);
      candles.forEach((c, i) => {
        const x = toX(i);
        const up = c.close >= c.open;
        const color = up ? '#26a69a' : '#ef5350';
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(0.8, bodyW * 0.2);
        ctx.beginPath();
        ctx.moveTo(x, toY(c.high));
        ctx.lineTo(x, toY(c.low));
        ctx.stroke();
        ctx.fillStyle = color;
        const bTop = toY(Math.max(c.open, c.close));
        const bBot = toY(Math.min(c.open, c.close));
        ctx.fillRect(x - bodyW / 2, bTop, bodyW, Math.max(1.5, bBot - bTop));
      });

      // Last-price dashed line
      const lastPrice = candles[candles.length - 1].close;
      const ly = toY(lastPrice);
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(PL, ly); ctx.lineTo(W - PR + 2, ly); ctx.stroke();
      ctx.setLineDash([]);

      // Price axis (right)
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(150,150,175,0.85)';
      for (let i = 0; i <= 6; i++) {
        const price = priceMin + (i / 6) * priceRange;
        const y = PT + (1 - i / 6) * plotH;
        ctx.fillText(formatHeatPrice(price), W - PR + 5, y + 3);
      }

      // Time axis (bottom)
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(150,150,175,0.7)';
      const hourly = ['12H', '24H', '48H'].includes(period);
      for (let i = 0; i <= 4; i++) {
        const idx = Math.min(timeBuckets - 1, Math.round((i / 4) * (timeBuckets - 1)));
        const d = new Date(candles[idx].time);
        const label = hourly
          ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
          : `${d.getDate()}/${d.getMonth() + 1}`;
        ctx.fillText(label, toX(idx), H - 5);
      }

      // Intensity scale (left): gradient bar + max value, like Coinglass
      ctx.textAlign = 'left';
      ctx.font = '8px monospace';
      ctx.fillStyle = 'rgba(150,150,175,0.85)';
      ctx.fillText(formatLiqUsd(maxVal), 4, PT + 8);
      const lgY = PT + 14, lgH = plotH - 20;
      const grad = ctx.createLinearGradient(0, lgY + lgH, 0, lgY);
      grad.addColorStop(0,    'rgba(10,8,34,1)');
      grad.addColorStop(0.25, 'rgba(40,20,95,1)');
      grad.addColorStop(0.5,  'rgba(110,35,150,1)');
      grad.addColorStop(0.7,  'rgba(200,60,110,1)');
      grad.addColorStop(0.85, 'rgba(250,140,40,1)');
      grad.addColorStop(1,    'rgba(255,250,150,1)');
      ctx.fillStyle = grad;
      ctx.fillRect(8, lgY, 8, lgH);
      ctx.fillStyle = 'rgba(150,150,175,0.7)';
      ctx.fillText('$0', 4, lgY + lgH + 9);

      // Current price pill (over axis)
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillRect(W - PR + 2, ly - 8, PR - 4, 15);
      ctx.fillStyle = '#0a0d16';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(formatHeatPrice(lastPrice), W - PR / 2, ly + 3.5);

      return { off };
    };

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      if (!W || !H) return;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);

      if (!baseRef.current || baseRef.current.W !== W || baseRef.current.H !== H || baseRef.current.data !== heatData) {
        baseRef.current = { ...renderBase(W, H, dpr), W, H, data: heatData };
      }
      ctx.drawImage(baseRef.current.off, 0, 0, W, H);

      // Hover crosshair + readout (price level + estimated liquidity there)
      const hover = hoverRef.current;
      if (hover) {
        const { raw, priceMin, priceMax, timeBuckets, priceBuckets } = heatData;
        const plotW = W - PR - PL, plotH = H - PT - PB;
        const x = Math.max(PL, Math.min(PL + plotW, hover.x));
        const y = Math.max(PT, Math.min(PT + plotH, hover.y));
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 0.8;
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(PL + plotW, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, PT); ctx.lineTo(x, PT + plotH); ctx.stroke();
        ctx.setLineDash([]);

        const price = priceMin + (1 - (y - PT) / plotH) * (priceMax - priceMin);
        const tIdx = Math.max(0, Math.min(timeBuckets - 1, Math.floor(((x - PL) / plotW) * timeBuckets)));
        const pIdx = Math.max(0, Math.min(priceBuckets - 1, Math.floor((1 - (y - PT) / plotH) * priceBuckets)));
        const liqHere = raw[tIdx][pIdx];

        // price pill on the axis
        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = 'rgba(20,20,35,0.95)';
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(W - PR + 2, y - 8, PR - 4, 15);
        ctx.strokeRect(W - PR + 2, y - 8, PR - 4, 15);
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.textAlign = 'left';
        ctx.fillText(formatHeatPrice(price), W - PR + 6, y + 3.5);

        // floating tooltip with the liquidity estimate
        if (liqHere > 0) {
          const tip = `≈ ${formatLiqUsd(liqHere)} liq`;
          const tw = ctx.measureText(tip).width + 12;
          const tx = Math.min(x + 10, W - PR - tw - 4);
          const ty = Math.max(PT + 4, y - 24);
          ctx.fillStyle = 'rgba(15,15,28,0.95)';
          ctx.strokeStyle = 'rgba(139,92,246,0.45)';
          ctx.fillRect(tx, ty, tw, 16);
          ctx.strokeRect(tx, ty, tw, 16);
          ctx.fillStyle = 'rgba(235,235,245,0.95)';
          ctx.fillText(tip, tx + 6, ty + 11.5);
        }
      }
    };

    draw();
    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      hoverRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      draw();
    };
    const onLeave = () => { hoverRef.current = null; draw(); };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      ro.disconnect();
    };
  }, [heatData, period]);

  const current = HEATMAP_PERIODS.find(p => p.key === period);

  return (
    <GlowCard delay={0.75} glowColor="rgba(139,92,246,0.22)">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-violet-400" /> Liquidation Heatmap
            <PulseDot color="bg-violet-400" />
          </h3>

          {/* Timeframe dropdown */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-border-primary bg-bg-tertiary/60 text-text-primary hover:border-violet-500/40 transition-colors cursor-pointer"
              dir="ltr"
            >
              {current?.label}
              <ChevronDown className={`w-3 h-3 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-20 w-28 rounded-lg border border-border-primary bg-bg-overlay shadow-xl overflow-hidden" dir="ltr">
                  {HEATMAP_PERIODS.map(p => (
                    <button
                      key={p.key}
                      onClick={() => { setPeriod(p.key); setMenuOpen(false); }}
                      className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors cursor-pointer ${
                        period === p.key
                          ? 'bg-violet-500/15 text-violet-300 font-semibold'
                          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg"
          style={{ height: '460px', background: '#000000', display: 'block', cursor: 'crosshair' }}
        />

        {/* Legend */}
        <div className="flex items-center gap-4 mt-2 justify-center">
          <div className="flex items-center gap-1.5">
            <div
              className="w-10 h-2 rounded-sm"
              style={{ background: 'linear-gradient(to right, rgba(40,20,95,1), rgba(110,35,150,1), rgba(200,60,110,1), rgba(250,140,40,1), rgba(255,250,150,1))' }}
            />
            <span className="text-[9px] text-text-muted">Low → High Liquidity</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-[2px] inline-block" style={{ backgroundColor: '#26a69a' }} />
            <span className="w-2 h-2 rounded-[2px] inline-block" style={{ backgroundColor: '#ef5350' }} />
            <span className="text-[9px] text-text-muted">Price</span>
          </div>
          <span className="text-[9px] text-text-muted/60">Estimated liq. levels (10–100x)</span>
        </div>
      </div>
    </GlowCard>
  );
}

function ChangeCard({ label, value }) {
  if (value == null) return null;
  const isPositive = value >= 0;
  return (
    <div className={`rounded-xl p-3 text-center border relative overflow-hidden h-full ${isPositive ? 'bg-profit/5 border-profit/15' : 'bg-loss/5 border-loss/15'}`}>
      <motion.div
        animate={{ opacity: [0, 0.05, 0] }}
        transition={{ duration: 3, repeat: Infinity }}
        className={`absolute inset-0 ${isPositive ? 'bg-profit' : 'bg-loss'}`}
      />
      <p className="text-[11px] text-text-muted mb-0.5 relative">{label}</p>
      <div className={`flex items-center justify-center gap-1 relative ${isPositive ? 'text-profit' : 'text-loss'}`}>
        {isPositive ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        <span className="text-base font-bold font-mono">{LRM}{isPositive ? '+' : ''}{value.toFixed(2)}%</span>
      </div>
    </div>
  );
}

function StatBox({ label, value, icon: Icon, sub, subColor, valueColor }) {
  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-3 text-center relative overflow-hidden group hover:border-accent-primary/20 transition-colors h-full">
      <motion.div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'radial-gradient(circle at center, rgba(99,102,241,0.05) 0%, transparent 70%)' }}
      />
      {Icon && <Icon className={`w-3.5 h-3.5 mx-auto mb-1 relative ${valueColor || 'text-accent-primary'}`} />}
      <p className="text-[11px] text-text-muted mb-0.5 relative">{label}</p>
      <AnimatedValue value={value} className={`text-sm font-bold relative block ${valueColor || 'text-text-primary'}`} />
      {sub && <p className={`text-[10px] mt-0.5 relative ${subColor || 'text-text-muted'}`}>{sub}</p>}
    </div>
  );
}
