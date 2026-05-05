import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Sparkles, TrendingUp, TrendingDown, Minus, RotateCcw, Activity, BarChart3, Zap, Shield, ChevronDown, ChevronUp, Target, Gauge } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { searchCoins, fetchCoinDetails, fetchCoinChart } from '../../services/coingeckoApi';
import { computeRSI, computeMA, computeVolatility } from '../../utils/technicals';

function formatNum(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `$${n.toLocaleString()}`;
}

function formatPrice(p) {
  if (!p && p !== 0) return '—';
  if (p >= 1) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${p.toFixed(6)}`;
}

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

// Card with animated border glow
function GlowCard({ children, className = '', delay = 0, glowColor = 'rgba(99,102,241,0.15)' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.5, type: 'spring', stiffness: 120 }}
      className={`relative group h-full ${className}`}
    >
      {/* Animated border glow */}
      <motion.div
        className="absolute -inset-[1px] rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `linear-gradient(135deg, ${glowColor}, transparent, ${glowColor})`, filter: 'blur(4px)' }}
      />
      <div className="relative bg-bg-secondary border border-border-primary rounded-2xl overflow-hidden h-full">
        {/* Corner decorations */}
        <div className="absolute top-0 right-0 w-8 h-8 opacity-[0.07]">
          <div className="absolute top-0 right-0 w-full h-px bg-accent-primary" />
          <div className="absolute top-0 right-0 w-px h-full bg-accent-primary" />
        </div>
        <div className="absolute bottom-0 left-0 w-8 h-8 opacity-[0.07]">
          <div className="absolute bottom-0 left-0 w-full h-px bg-accent-primary" />
          <div className="absolute bottom-0 left-0 w-px h-full bg-accent-primary" />
        </div>
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
  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!query || query.length < 2 || selectedCoin) { setSuggestions([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const results = await searchCoins(query);
      setSuggestions(results);
      setShowSuggestions(true);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, selectedCoin]);

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
    setError(null);

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
    if (!chartData.length) return '#6366f1';
    return chartData[chartData.length - 1].price >= chartData[0].price ? '#22c55e' : '#ef4444';
  }, [chartData]);

  const md = coinData?.market_data;

  return (
    <div className="space-y-4">
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
                  className="absolute z-50 top-full mt-1 right-0 left-0 bg-bg-secondary border border-border-primary rounded-xl shadow-xl overflow-hidden"
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
          <button
            onClick={() => analyze()}
            disabled={!selectedCoin || analyzing}
            className="flex items-center gap-2 bg-accent-primary text-bg-primary font-bold px-5 py-3 rounded-xl hover:bg-accent-hover transition-all cursor-pointer text-sm disabled:opacity-30 disabled:cursor-not-allowed shrink-0 shadow-lg shadow-accent-primary/20"
          >
            <Sparkles className="w-4 h-4" />
            <span>Analyze</span>
          </button>
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
                  ? 'bg-accent-primary/15 text-accent-primary border-accent-primary/40 shadow-md shadow-accent-primary/10'
                  : 'bg-bg-secondary text-text-secondary border-border-primary hover:border-accent-primary/40 hover:text-accent-primary hover:shadow-md hover:shadow-accent-primary/10'
              }`}
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
                const tvSymbol = `BINANCE:${TV_SYMBOL_MAP[selectedCoin?.coingeckoId] || `${coinData.symbol?.toUpperCase()}USDT`}`;
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
                            colorTheme: 'dark',
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

              {/* Performance row */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: '24 שעות', value: md.price_change_percentage_24h },
                  { label: '7 ימים', value: md.price_change_percentage_7d },
                  { label: '30 ימים', value: md.price_change_percentage_30d },
                ].map((item, i) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: 0.2 + i * 0.08, type: 'spring', stiffness: 120 }}
                    className="h-full"
                  >
                    <ChangeCard label={item.label} value={item.value} />
                  </motion.div>
                ))}
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {[
                  { label: 'שווי שוק', value: formatNum(md.market_cap?.usd), icon: BarChart3 },
                  { label: 'נפח 24h', value: formatNum(md.total_volume?.usd), icon: Activity },
                  { label: 'ATH', value: formatPrice(md.ath?.usd), sub: md.ath_change_percentage?.usd != null ? `${md.ath_change_percentage.usd.toFixed(1)}%` : null, subColor: 'text-loss' },
                  md.fully_diluted_valuation?.usd > 0 && { label: 'FDV', value: formatNum(md.fully_diluted_valuation.usd) },
                  md.total_volume?.usd > 0 && md.market_cap?.usd > 0 && {
                    label: 'Vol/MCap', value: `${((md.total_volume.usd / md.market_cap.usd) * 100).toFixed(2)}%`,
                    sub: md.total_volume.usd / md.market_cap.usd > 0.1 ? 'נזילות גבוהה' : 'נזילות נמוכה',
                    subColor: md.total_volume.usd / md.market_cap.usd > 0.1 ? 'text-profit' : 'text-amber-500',
                  },
                  md.market_cap_change_percentage_24h != null && {
                    label: 'שינוי MCap 24h',
                    value: `${md.market_cap_change_percentage_24h >= 0 ? '+' : ''}${md.market_cap_change_percentage_24h.toFixed(2)}%`,
                    subColor: md.market_cap_change_percentage_24h >= 0 ? 'text-profit' : 'text-loss',
                  },
                ].filter(Boolean).map((item, i) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, y: 15, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: 0.25 + i * 0.06, type: 'spring', stiffness: 100 }}
                    className="h-full"
                  >
                    <StatBox {...item} />
                  </motion.div>
                ))}
              </div>

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
                              style={{ borderColor: technicals.rsi >= 70 ? '#ef4444' : technicals.rsi <= 30 ? '#22c55e' : '#6366f1' }}
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
                        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white/80">
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
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#666' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#666' }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1 ? `$${v.toLocaleString()}` : `$${v.toFixed(4)}`} width={65} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 12, fontSize: 12 }}
                            labelStyle={{ color: '#999' }}
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
        <span className="text-base font-bold font-mono">{isPositive ? '+' : ''}{value.toFixed(2)}%</span>
      </div>
    </div>
  );
}

function StatBox({ label, value, icon: Icon, sub, subColor }) {
  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-3 text-center relative overflow-hidden group hover:border-accent-primary/20 transition-colors h-full">
      <motion.div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'radial-gradient(circle at center, rgba(99,102,241,0.05) 0%, transparent 70%)' }}
      />
      {Icon && <Icon className="w-3.5 h-3.5 text-accent-primary mx-auto mb-1 relative" />}
      <p className="text-[11px] text-text-muted mb-0.5 relative">{label}</p>
      <AnimatedValue value={value} className="text-sm font-bold text-text-primary relative block" />
      {sub && <p className={`text-[10px] mt-0.5 relative ${subColor || 'text-text-muted'}`}>{sub}</p>}
    </div>
  );
}
