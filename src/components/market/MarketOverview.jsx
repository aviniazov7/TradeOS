import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import { lazyWithChunkReload as lazy } from '../../utils/chunkReload';
import { useSearchParams } from 'react-router-dom';
import { m, AnimatePresence } from 'framer-motion';
import { formatCompactUsd as formatNum, formatCoinPrice as formatPrice, LRM } from '../../utils/formatters';
import { fetchGlobalMarket } from '../../services/globalMarket';
import {
  Activity, TrendingUp, TrendingDown, Bitcoin, DollarSign,
  PieChart, Flame, ArrowUpRight, ArrowDownRight, Layers, Rocket, Grid3X3,
  Percent, BarChart3, Zap, Sparkles, Bot, RefreshCw,
} from 'lucide-react';
import { pageVariants, pageTransition, staggerContainer } from '../../utils/animations';
import PageHeader from '../shared/PageHeader';
import FearGreedGauge from '../dashboard/FearGreedGauge';
import CoinAnalysis from './CoinAnalysis';
import MarketSessionsCard from './MarketSessionsCard';
import WhalesPage from '../whales/WhalesPage';
import ErrorBoundary from '../shared/ErrorBoundary';
import LoadingSpinner from '../shared/LoadingSpinner';
import { getCachedImage, hasKnownIcon } from '../../services/coinImageCache';
import { fetchSpotTickersAsBinance, fetchLinearTickers, fetchAccountRatio } from '../../services/bybitDirect';
import CoinIcon from '../shared/CoinIcon';
import Reveal from '../shared/Reveal';
import RollingNumber from '../shared/RollingNumber';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || '';
const CG_PROXY = WORKER_URL + '/cg';
const CG_DIRECT = 'https://api.coingecko.com/api/v3';

// Stablecoins + wrapped/staked derivatives excluded from the Altcoin-Season
// calc. Module scope so it isn't re-allocated on every render.
const EXCLUDED_SYMBOLS = new Set([
  'usdt', 'usdc', 'dai', 'busd', 'tusd', 'fdusd', 'usdp', 'usdd', 'gusd', 'frax', 'lusd', 'crvusd', 'pyusd', 'usde',
  'wbtc', 'weth', 'steth', 'wsteth', 'reth', 'cbeth', 'hbtc', 'renbtc',
]);
const CG = CG_PROXY || CG_DIRECT;
const BNB_URL = WORKER_URL ? `${WORKER_URL}/bnb` : 'https://api.binance.com/api/v3';

// Ordered list of top trading pairs for Binance-based coin data
// Stablecoins to exclude from top-10 and gainers/losers
const STABLECOINS = new Set([
  'USDC','TUSD','BUSD','FDUSD','DAI','USDP','GUSD','SUSD','USDD','FRAX','USDJ',
  'AEUR','EURI','EUR','RLUSD','USD1','USDX','USDE','PYUSD','CRVUSD','LUSD',
  'BUIDL','USTC','EURS','XAUT','PAXG','EURT',
]);

// Map symbol → display name
const COIN_NAMES = {
  BTC:'Bitcoin',ETH:'Ethereum',SOL:'Solana',XRP:'Ripple',BNB:'BNB',
  ADA:'Cardano',DOGE:'Dogecoin',AVAX:'Avalanche',DOT:'Polkadot',LINK:'Chainlink',
  SUI:'Sui',NEAR:'NEAR',APT:'Aptos',TRX:'TRON',INJ:'Injective',
  UNI:'Uniswap',ATOM:'Cosmos',ARB:'Arbitrum',OP:'Optimism',SHIB:'Shiba Inu',
  PEPE:'Pepe',WIF:'dogwifhat',BONK:'Bonk',FLOKI:'Floki',FTM:'Fantom',
  AAVE:'Aave',STRK:'Starknet',MATIC:'Polygon',LTC:'Litecoin',TIA:'Celestia',
  FET:'Fetch.ai',RENDER:'Render',WLD:'Worldcoin',JUP:'Jupiter',NOT:'Notcoin',
  SEI:'Sei',TAO:'Bittensor',TRUMP:'Official Trump',PENGU:'Pudgy Penguins',IMX:'Immutable',
  EIGEN:'EigenLayer',GRT:'The Graph',FIL:'Filecoin',SAND:'The Sandbox',AXS:'Axie Infinity',
};

// Category definitions for Binance-based category computation (no emojis — icons handled in UI)
const CATEGORY_COINS = {
  'DeFi':    ['AAVE','UNI','COMP','CRV','MKR','SNX','SUSHI','YFI','BAL','DYDX','PERP','1INCH','KNC','BAND'],
  'Layer 2': ['ARB','OP','IMX','STRK','ZK','MANTA','LRC','SKL'],
  'AI':      ['FET','AGIX','OCEAN','RENDER','RNDR','TAO','KAITO','IO','GRT'],
  'Memes':   ['DOGE','SHIB','PEPE','WIF','BONK','FLOKI','DOGS','POPCAT','NEIRO','BRETT','TURBO','MOG'],
  'GameFi':  ['AXS','SAND','MANA','GALA','IMX','ALICE','TLM','ENJ','CHZ','MAGIC','ROSE'],
  'Layer 1': ['SOL','BNB','ADA','AVAX','DOT','NEAR','APT','SUI','ATOM','TRX','TON','ALGO','EGLD','ONE','KAVA','FLOW'],
  'NFT':     ['APE','BLUR','IMX','MAGIC','GALA','SAND','MANA'],
  'Infra':   ['LINK','DOT','ATOM','HBAR','ICP','AR','HNT','ANKR','CKB','STORJ','NMR','BAND'],
};

function computeBinanceCategories(allCoins) {
  const bySymbol = {};
  allCoins.forEach(c => { bySymbol[c.symbol?.toUpperCase()] = c.price_change_percentage_24h || 0; });
  return Object.entries(CATEGORY_COINS).map(([name, symbols]) => {
    const changes = symbols.map(s => bySymbol[s]).filter(v => v != null);
    if (changes.length === 0) return null;
    const avg = changes.reduce((a, b) => a + b, 0) / changes.length;
    return { name, market_cap_change_24h: avg, count: changes.length };
  }).filter(Boolean).sort((a, b) => Math.abs(b.market_cap_change_24h) - Math.abs(a.market_cap_change_24h));
}

const cardVariants = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };
const cardClass = 'bento-card p-3';

// Stat cards stay neutral; each metric keeps its colour identity only in the
// small icon chip, so the row reads calm without being uniform.
const statAccent = (r, g, b, color) => ({
  color,
  chipBg: `rgba(${r},${g},${b},0.12)`,
});
const STAT_ACCENTS = {
  cap:  statAccent(139, 92, 246, '#8b5cf6'),  // market cap  — violet (app accent)
  usdt: statAccent(38, 212, 175, '#2dd4bf'),   // USDT.D      — teal
  btc:  statAccent(251, 146, 60, '#fb923c'),   // BTC.D       — bitcoin orange
  vol:  statAccent(192, 132, 252, '#c084fc'),  // 24h volume  — violet
  alt:  statAccent(129, 140, 248, '#818cf8'),  // alt season  — indigo
  volch: statAccent(14, 165, 233, '#0ea5e9'),  // 24h vol change — sky
};

// 21st-style global-stat card: glass surface + a soft accent corner glow + a
// faint accent hairline along the top. Designed (not a plain box, not bare text).
function MarketStatCard({ accentKey, Icon, label, children }) {
  const a = STAT_ACCENTS[accentKey] || STAT_ACCENTS.cap;
  return (
    <m.div
      variants={cardVariants}
      whileHover={{ y: -2 }}
      className="relative overflow-hidden rounded-2xl p-4 min-h-[104px] bg-bg-secondary border border-border-primary"
    >
      <div className="absolute -top-12 -left-12 w-32 h-32 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${a.chipBg} 0%, transparent 70%)` }} />
      <div className="absolute top-0 inset-x-6 h-px pointer-events-none"
        style={{ background: `linear-gradient(to right, transparent, ${a.color}66, transparent)` }} />
      <div className="relative">
        <div className="flex items-center gap-2 mb-2.5">
          <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: a.chipBg }}>
            <Icon className="w-3.5 h-3.5" style={{ color: a.color }} />
          </span>
          <span className="text-[11px] text-text-muted uppercase tracking-wider">{label}</span>
        </div>
        {children}
      </div>
    </m.div>
  );
}
const FUTURES_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT',
  'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT',
];
// Wider symbol set for the live liquidation feed — 10 majors alone liquidate
// rarely, so the feed looked frozen. More symbols = a steady stream of events.
const LIQ_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT', 'DOGEUSDT', 'ADAUSDT',
  'AVAXUSDT', 'DOTUSDT', 'LINKUSDT', '1000PEPEUSDT', '1000SHIBUSDT', 'WIFUSDT',
  'SUIUSDT', 'NEARUSDT', 'APTUSDT', 'ARBUSDT', 'OPUSDT', 'INJUSDT', 'TIAUSDT',
  'SEIUSDT', 'FILUSDT', 'LTCUSDT', 'TRXUSDT', 'WLDUSDT', 'FETUSDT',
];
const MAJOR_COINS = new Set([
  'BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK',
  'MATIC', 'UNI', 'LTC', 'ATOM', 'APT', 'ARB', 'OP', 'SUI', 'NEAR', 'FIL',
  'PEPE', 'WIF', 'SHIB', 'TRX', 'ETC', 'INJ', 'SEI', 'TIA', 'FET', 'RENDER',
]);

const CAT_ICON_MAP = {
  'DeFi':    Activity,
  'Layer 2': Zap,
  'AI':      Bot,
  'Memes':   Flame,
  'GameFi':  Rocket,
  'Layer 1': Layers,
  'NFT':     Sparkles,
  'Infra':   BarChart3,
};

// Animated floating bubble for categories
function CategoryBubble({ name, change, index }) {
  const isPositive = change >= 0;
  const absChange = Math.abs(change);
  const size = Math.max(64, Math.min(110, 64 + absChange * 4));
  const floatDelay = index * 0.15;
  const IconComp = CAT_ICON_MAP[name] || Activity;
  const iconColor = isPositive ? '#22c55e' : '#ef4444';

  return (
    <m.div
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.3 + index * 0.1, duration: 0.5, type: 'spring', stiffness: 200 }}
      className="relative"
    >
      <m.div
        animate={{ y: [0, -6, 0, 4, 0], x: [0, 3, -2, 1, 0] }}
        transition={{ duration: 4 + index * 0.5, repeat: Infinity, ease: 'easeInOut', delay: floatDelay }}
        className="rounded-full flex flex-col items-center justify-center cursor-default"
        style={{
          width: size,
          height: size,
          backgroundColor: isPositive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          border: `1.5px solid ${isPositive ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
        }}
      >
        <IconComp style={{ color: iconColor, width: size * 0.28, height: size * 0.28, marginBottom: 2 }} />
        <span className="text-[10px] text-text-primary font-medium text-center leading-tight px-1.5">
          {name}
        </span>
        <span className="text-[11px] font-bold mt-0.5" style={{ color: iconColor }}>
          {LRM}{isPositive ? '+' : ''}{change.toFixed(1)}%
        </span>
      </m.div>
    </m.div>
  );
}

function getHeatColor(change) {
  if (change == null) return 'rgba(100, 100, 100, 0.3)';
  const clamped = Math.max(-10, Math.min(10, change));
  if (clamped >= 0) {
    const t = clamped / 10;
    const r = Math.round(30 + (34 - 30) * t);
    const g = Math.round(30 + (197 - 30) * t);
    const b = Math.round(30 + (94 - 30) * t);
    return `rgba(${r}, ${g}, ${b}, ${0.25 + t * 0.45})`;
  } else {
    const t = Math.abs(clamped) / 10;
    const r = Math.round(30 + (239 - 30) * t);
    const g = Math.round(30 + (68 - 30) * t);
    const b = Math.round(30 + (68 - 30) * t);
    return `rgba(${r}, ${g}, ${b}, ${0.25 + t * 0.45})`;
  }
}

function tvSymbol(symbol) {
  const s = (symbol || '').toUpperCase().replace(/USDT$/i, '');
  return `BINANCE:${s}USDT.P`;
}

function tvUrl(symbol) {
  // Try Binance perp first; TradingView will show error if not listed there
  return `https://www.tradingview.com/chart/?symbol=${tvSymbol(symbol)}`;
}

// Open the coin chart. The TradingView desktop app can't deep-link to a
// specific symbol (the tradingview:// scheme only wakes the app on whatever was
// last open), so on desktop we open the web chart on the correct coin. On
// mobile a top-level navigation to the tradingview.com URL lets the OS route to
// the TradingView app at the right symbol via universal links, falling back to
// the web chart when the app isn't installed.
function openChart(symbol) {
  const webUrl = tvUrl(symbol);
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  if (isMobile) {
    window.location.href = webUrl;
  } else {
    window.open(webUrl, '_blank', 'noopener');
  }
}

function HeatmapCell({ coin, index, sizeClass }) {
  const change = coin.price_change_percentage_24h;
  return (
    <m.div
      key={coin.id}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.05 * index, duration: 0.3 }}
      whileHover={{ scale: 1.02, transition: { duration: 0.15 } }}
      className={`${sizeClass} rounded-lg flex flex-col items-center justify-center border border-border-primary cursor-pointer transition-all hover:border-border-hover hover:brightness-125`}
      style={{ backgroundColor: getHeatColor(change) }}
      onClick={() => openChart(coin.symbol)}
    >
      <div className="flex items-center gap-1">
        <CoinIcon pair={coin.symbol} className="w-3.5 h-3.5" />
        <span className="text-xs font-bold text-text-primary">{coin.symbol?.toUpperCase()}</span>
      </div>
      <span className={`text-[11px] font-semibold mt-0.5 ${change >= 0 ? 'text-green-300' : 'text-red-300'}`}>
        {change != null ? `${LRM}${change >= 0 ? '+' : ''}${change.toFixed(1)}%` : '—'}
      </span>
    </m.div>
  );
}

function FundingCountdown({ nextTime }) {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    const tick = () => {
      const diff = nextTime - Date.now();
      if (diff <= 0) { setRemaining('עכשיו'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setRemaining(`${h}h ${m}m`);
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [nextTime]);
  return <span className="text-[9px] text-text-muted">{remaining}</span>;
}

// Shared modern card header: left-aligned accent icon chip + title + optional
// right-side node (total / countdown). 21st-style, replaces the old centered h2.
function MarketCardHeader({ Icon, title, accent = '#8b5cf6', right }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-4">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}1f` }}>
          <Icon className="w-4 h-4" style={{ color: accent }} />
        </span>
        <h2 className="text-sm font-semibold text-text-primary truncate">{title}</h2>
      </div>
      {right}
    </div>
  );
}

// A small coin label (icon + ticker) reused by the derivative cards.
function CoinTag({ symbol, className = '' }) {
  return (
    <span className={`flex items-center gap-1.5 min-w-0 ${className}`}>
      <CoinIcon pair={symbol} className="w-4 h-4 shrink-0" />
      <span className="text-[11px] font-bold text-text-primary truncate">{symbol}</span>
    </span>
  );
}

// Empty-panel line: "loading…" while the first fetch runs, then "unavailable"
// with a retry — so a failed source is never a silent dead end.
function PanelStatus({ loading, onRetry, compact = false }) {
  return (
    <div className={`flex items-center justify-center gap-2 ${compact ? 'py-4' : 'py-8'}`} role="status">
      <span className="text-xs text-text-muted">{loading ? 'טוען...' : 'לא זמין כרגע'}</span>
      {!loading && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 px-2 h-6 rounded-md text-xs text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" aria-hidden /> נסה שוב
        </button>
      )}
    </div>
  );
}

function FundingRatesCard({ rates, loading, onRetry }) {
  const maxAbs = rates.length ? Math.max(...rates.map(r => Math.abs(r.rate))) : 1;
  return (
    <m.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className={cardClass}
    >
      <MarketCardHeader
        Icon={Percent} title="שיעורי מימון" accent="#fbbf24"
        right={rates[0] ? <span className="text-[10px] text-text-muted num-mono shrink-0"><FundingCountdown nextTime={rates[0].nextFundingTime} /></span> : null}
      />
      {rates.length > 0 ? (
        <div className="space-y-0.5">
          {rates.map((r, i) => {
            const pct = (r.rate * 100).toFixed(4);
            const isNeg = r.rate < 0;
            const barW = (Math.abs(r.rate) / maxAbs) * 50;
            const col = isNeg ? 'var(--color-profit)' : 'var(--color-loss)';
            return (
              <m.div
                key={r.symbol}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.03 * i, duration: 0.3 }}
                className="flex items-center gap-2 py-1 px-1 rounded-lg hover:bg-bg-tertiary/60 transition-colors"
                dir="ltr"
              >
                <span className="text-[11px] font-semibold w-20 text-right shrink-0 num-mono" style={{ color: col }}>
                  {isNeg ? '' : '+'}{pct}%
                </span>
                <div className="flex-1 relative h-2 bg-bg-tertiary rounded-full overflow-hidden">
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border-primary z-10" />
                  <m.div
                    initial={{ width: 0 }}
                    animate={{ width: `${barW}%` }}
                    transition={{ delay: 0.03 * i + 0.2, duration: 0.6, ease: 'easeOut' }}
                    className="absolute top-0 h-full"
                    style={isNeg
                      ? { right: '50%', borderRadius: '9999px 0 0 9999px', background: col }
                      : { left: '50%', borderRadius: '0 9999px 9999px 0', background: col }}
                  />
                </div>
                <CoinTag symbol={r.symbol} className="w-16 shrink-0" />
              </m.div>
            );
          })}
          <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-border-primary/40">
            <span className="flex items-center gap-1 text-[9px] text-text-muted"><span className="w-2 h-2 rounded-full bg-profit" /> Shorts משלמים</span>
            <span className="flex items-center gap-1 text-[9px] text-text-muted"><span className="w-2 h-2 rounded-full bg-loss" /> Longs משלמים</span>
          </div>
        </div>
      ) : (
        <PanelStatus loading={loading} onRetry={onRetry} />
      )}
    </m.div>
  );
}

function OpenInterestCard({ data, loading, onRetry }) {
  const maxOiUsd = data.length ? Math.max(...data.map(d => d.oiUsd)) : 1;
  const totalOi = data.reduce((sum, d) => sum + d.oiUsd, 0);
  return (
    <m.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className={cardClass}
    >
      <MarketCardHeader
        Icon={Activity} title="פוזיציות פתוחות (OI)" accent="#8b5cf6"
        right={data.length > 0 ? <span className="text-[11px] font-semibold text-text-secondary num-mono shrink-0">{formatNum(totalOi)}</span> : null}
      />
      {data.length > 0 ? (
        <div className="space-y-0.5">
          {data.map((d, i) => {
            const barW = (d.oiUsd / maxOiUsd) * 100;
            return (
              <m.div
                key={d.symbol}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.03 * i, duration: 0.3 }}
                className="flex items-center gap-2 py-1 px-1 rounded-lg hover:bg-bg-tertiary/60 transition-colors"
                dir="ltr"
              >
                <span className="text-[10px] font-semibold text-text-muted/50 w-4 text-center shrink-0 num-mono">{i + 1}</span>
                <CoinTag symbol={d.symbol} className="w-16 shrink-0" />
                <div className="flex-1 h-2 bg-bg-tertiary rounded-full overflow-hidden">
                  <m.div
                    initial={{ width: 0 }}
                    animate={{ width: `${barW}%` }}
                    transition={{ delay: 0.03 * i + 0.2, duration: 0.8, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{ background: 'linear-gradient(to right, #6366f1, #06b6d4)' }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-text-secondary w-12 text-left shrink-0 num-mono">
                  {formatNum(d.oiUsd)}
                </span>
              </m.div>
            );
          })}
        </div>
      ) : (
        <PanelStatus loading={loading} onRetry={onRetry} />
      )}
    </m.div>
  );
}

function LongShortCard({ data, loading, onRetry }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className={cardClass}
    >
      <MarketCardHeader Icon={BarChart3} title="יחס לונג / שורט" accent="#8b5cf6" />
      {data.length > 0 ? (
        <div className="space-y-1">
          {data.map((d, i) => {
            const longPct = (d.longAccount * 100).toFixed(1);
            const shortPct = (d.shortAccount * 100).toFixed(1);
            return (
              <m.div
                key={d.symbol}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.03 * i, duration: 0.3 }}
                className="flex items-center gap-2 py-1 px-1 rounded-lg hover:bg-bg-tertiary/60 transition-colors"
                dir="ltr"
              >
                <CoinTag symbol={d.symbol} className="w-16 shrink-0" />
                {/* Track is bg-bg-primary (distinct from the row's hover tint) so
                    the hover highlight frames the bar instead of bleeding into it.
                    The percentages sit OUTSIDE the bar, so they're always fully
                    visible however narrow a side gets (phones). */}
                <span className="w-10 shrink-0 text-[11px] font-bold num-mono text-profit text-right">{longPct}%</span>
                <div className="flex flex-1 min-w-0 h-5 rounded-lg overflow-hidden bg-bg-primary border border-border-primary">
                  <m.div
                    initial={{ width: 0 }}
                    animate={{ width: `${longPct}%` }}
                    transition={{ delay: 0.03 * i + 0.2, duration: 0.8, ease: 'easeOut' }}
                    className="h-full flex items-center justify-center overflow-hidden"
                    style={{ backgroundColor: 'rgba(34, 197, 94, 0.3)' }}
                  >
                  </m.div>
                  <m.div
                    initial={{ width: 0 }}
                    animate={{ width: `${shortPct}%` }}
                    transition={{ delay: 0.03 * i + 0.2, duration: 0.8, ease: 'easeOut' }}
                    className="h-full flex items-center justify-center overflow-hidden"
                    style={{ backgroundColor: 'rgba(239, 68, 68, 0.3)' }}
                  >
                  </m.div>
                </div>
                <span className="w-10 shrink-0 text-[11px] font-bold num-mono text-loss">{shortPct}%</span>
              </m.div>
            );
          })}
          <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-border-primary/40">
            <span className="flex items-center gap-1 text-[9px] text-text-muted"><span className="w-2 h-2 rounded-full bg-profit" /> Long (קונים)</span>
            <span className="flex items-center gap-1 text-[9px] text-text-muted"><span className="w-2 h-2 rounded-full bg-loss" /> Short (מוכרים)</span>
          </div>
        </div>
      ) : (
        <PanelStatus loading={loading} onRetry={onRetry} />
      )}
    </m.div>
  );
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'עכשיו';
  if (diff < 60) return `לפני ${diff}s`;
  if (diff < 3600) return `לפני ${Math.floor(diff / 60)}m`;
  return `לפני ${Math.floor(diff / 3600)}h`;
}

function LiquidationsCard({ liquidations, connected = false }) {
  const longs = liquidations.filter(l => l.side === 'SELL');
  const shorts = liquidations.filter(l => l.side === 'BUY');
  const totalLongUsd = longs.reduce((s, l) => s + l.usdValue, 0);
  const totalShortUsd = shorts.reduce((s, l) => s + l.usdValue, 0);
  const total = totalLongUsd + totalShortUsd;
  const longPct = total > 0 ? (totalLongUsd / total) * 100 : 50;
  const newestId = liquidations[0]?.id;

  return (
    <div className={cardClass}>
      <MarketCardHeader
        Icon={Zap} title="חיסולים" accent="#eab308"
        right={
          <span
            className="flex items-center gap-1.5 text-[9px] font-bold tracking-wide shrink-0 px-1.5 py-0.5 rounded-full"
            style={{
              color: connected ? 'var(--color-loss)' : 'var(--color-text-muted)',
              backgroundColor: connected ? 'rgba(239,68,68,0.12)' : 'var(--color-bg-tertiary)',
            }}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-loss animate-pulse' : 'bg-text-muted'}`}
            />
            {connected ? 'LIVE' : 'מתחבר…'}
          </span>
        }
      />

      {/* Hero total liquidated */}
      <div className="mb-3 flex items-end justify-between" dir="ltr">
        <div>
          <p className="text-[9px] uppercase tracking-wider text-text-muted mb-0.5">Total Liquidated</p>
          <m.p
            key={Math.round(total)}
            initial={{ opacity: 0.4 }} animate={{ opacity: 1 }}
            className="text-xl font-bold num-mono leading-none"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {total > 0 ? `$${formatNum(total)}` : '—'}
          </m.p>
        </div>
        <span className="text-[10px] text-text-muted num-mono">{liquidations.length} events</span>
      </div>

      {/* Summary split bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1 text-[10px] font-semibold" dir="ltr">
          <span className="text-profit">Long {longs.length} · {formatNum(totalLongUsd)}</span>
          <span className="text-loss">{formatNum(totalShortUsd)} · {shorts.length} Short</span>
        </div>
        <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden flex" dir="ltr">
          <m.div animate={{ width: `${longPct}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} className="h-full" style={{ background: 'var(--color-profit)' }} />
          <m.div animate={{ width: `${100 - longPct}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} className="h-full" style={{ background: 'var(--color-loss)' }} />
        </div>
      </div>

      {/* Live drop-feed — new liquidations fall in from the top, size bar behind */}
      {liquidations.length > 0 ? (
        <div className="space-y-1 max-h-[360px] overflow-y-auto scrollbar-thin pe-0.5" dir="ltr">
          <AnimatePresence initial={false}>
            {liquidations.map((liq) => {
              const isLong = liq.side === 'SELL';
              const big = liq.usdValue >= 50000;
              const whale = liq.usdValue >= 250000;
              const isNewest = liq.id === newestId;
              const col = isLong ? 'var(--color-loss)' : 'var(--color-profit)';
              const barW = Math.min(100, (liq.usdValue / 100000) * 100);
              return (
                <m.div
                  key={liq.id}
                  initial={{ opacity: 0, y: -14, scale: 0.96 }}
                  animate={{
                    opacity: 1, y: 0, scale: 1,
                    boxShadow: isNewest
                      ? [`0 0 0px 0px ${isLong ? 'rgba(239,68,68,0.0)' : 'rgba(34,197,94,0.0)'}`,
                         `0 0 14px 1px ${isLong ? 'rgba(239,68,68,0.45)' : 'rgba(34,197,94,0.45)'}`,
                         '0 0 0px 0px rgba(0,0,0,0)']
                      : (whale ? `0 0 12px 0px ${isLong ? 'rgba(239,68,68,0.35)' : 'rgba(34,197,94,0.35)'}` : '0 0 0px 0px rgba(0,0,0,0)'),
                  }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  transition={{ duration: 0.4, ease: 'easeOut', boxShadow: { duration: 0.9 } }}
                  className="relative flex items-center justify-between py-2 px-2.5 rounded-lg overflow-hidden border"
                  style={{
                    background: isLong ? 'rgba(239,68,68,0.07)' : 'rgba(34,197,94,0.07)',
                    borderColor: big ? (isLong ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)') : 'transparent',
                  }}
                >
                  {/* intensity bar (bigger liq = wider) */}
                  <div className="absolute inset-y-0 left-0 pointer-events-none" style={{ width: `${barW}%`, background: `linear-gradient(to right, ${isLong ? 'rgba(239,68,68,0.18)' : 'rgba(34,197,94,0.18)'}, transparent)` }} />
                  <div className="relative flex items-center gap-2 min-w-0">
                    <Zap className="w-3.5 h-3.5 shrink-0" style={{ color: col }} />
                    <CoinIcon pair={liq.symbol} className="w-4 h-4 shrink-0" />
                    <span className="text-[11px] font-bold text-text-primary">{liq.symbol}</span>
                    <span className="text-[8px] font-bold px-1 py-0.5 rounded shrink-0" style={{ color: col, backgroundColor: isLong ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)' }}>
                      {isLong ? 'LONG' : 'SHORT'}
                    </span>
                    {whale && (
                      <span className="text-[8px] shrink-0" title="ליקווידציה גדולה">🐋</span>
                    )}
                  </div>
                  <div className="relative flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-bold num-mono" style={{ color: col }}>{formatNum(liq.usdValue)}</span>
                    <span className="text-[9px] text-text-muted">{timeAgo(liq.time)}</span>
                  </div>
                </m.div>
              );
            })}
          </AnimatePresence>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-10">
          {/* Radar sweep — reads as "actively listening" rather than frozen */}
          <div className="relative w-16 h-16 mb-3">
            <span className="absolute inset-0 rounded-full border border-yellow-500/20" />
            <span className="absolute inset-[22%] rounded-full border border-yellow-500/15" />
            <m.span
              className="absolute inset-0 rounded-full"
              style={{ background: 'conic-gradient(from 0deg, rgba(234,179,8,0.0) 0deg, rgba(234,179,8,0.28) 50deg, rgba(234,179,8,0.0) 60deg)' }}
              animate={{ rotate: 360 }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
            />
            <Zap className="absolute inset-0 m-auto w-5 h-5 text-yellow-500/70" />
          </div>
          <span className="text-[11px] text-text-muted">
            {connected ? 'מחובר · ממתין לחיסולים…' : 'מתחבר לזרם החיסולים…'}
          </span>
        </div>
      )}
    </div>
  );
}

function CryptoHeatmap({ coins, loading, onRetry }) {
  if (!coins.length) {
    return (
      <m.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className={cardClass}>
        <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2 justify-center">
          <Grid3X3 className="w-4 h-4 text-accent-primary" />
          מפת חום
        </h2>
        <PanelStatus loading={loading} onRetry={onRetry} />
      </m.div>
    );
  }

  const top20 = coins.slice(0, 20);

  return (
    <m.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className={cardClass}
    >
      <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2 justify-center">
        <Grid3X3 className="w-4 h-4 text-accent-primary" />
        מפת חום - Top 20
      </h2>
      <div className="flex flex-wrap gap-1.5">
        {top20.map((coin, i) => {
          // Desktop: tiered sizing, Mobile: simpler 2-column grid
          let sizeClass;
          if (i < 2) sizeClass = 'w-[calc(50%-3px)] h-16 md:h-20';
          else if (i < 5) sizeClass = 'w-[calc(50%-3px)] md:w-[calc(33.33%-4px)] h-14 md:h-16';
          else if (i < 10) sizeClass = 'w-[calc(50%-3px)] md:w-[calc(20%-5px)] h-12 md:h-14';
          else sizeClass = 'w-[calc(50%-3px)] md:w-[calc(20%-5px)] h-11 md:h-12';

          return <HeatmapCell key={coin.id} coin={coin} index={i} sizeClass={sizeClass} />;
        })}
      </div>
      {/* Legend */}
      <div className="flex items-center justify-center gap-3 mt-3">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(239, 68, 68, 0.6)' }} />
          <span className="text-[10px] text-text-muted">ירידה</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(100, 100, 100, 0.3)' }} />
          <span className="text-[10px] text-text-muted">ניטרלי</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(34, 197, 94, 0.6)' }} />
          <span className="text-[10px] text-text-muted">עלייה</span>
        </div>
      </div>
    </m.div>
  );
}


// Polymarket is its own heavy chunk (live third-party feeds) — loaded only
// when its tab is opened.
const PolymarketPage = lazy(() => import('../polymarket/PolymarketPage'));

// The page's views, switched by the shared tab strip. Polymarket stays visible
// to everyone; the board itself shows a locked teaser to non-premium users.
const MARKET_TABS = [
  { id: 'overview', label: 'סקירה' },
  { id: 'analysis', label: 'ניתוח מטבע' },
  { id: 'whales', label: 'מעקב לווייתנים', mobileLabel: 'לווייתנים' },
  { id: 'polymarket', label: 'Polymarket' },
];
export default function MarketOverview() {
  // The tab lives in the URL (?tab=analysis / ?tab=whales / ?tab=polymarket)
  // so links and the back button land on the right view.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = MARKET_TABS.some((t) => t.id === searchParams.get('tab')) ? searchParams.get('tab') : 'overview';
  const setActiveTab = (id) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    if (id === 'overview') next.delete('tab'); else next.set('tab', id);
    // `pm` is the Polymarket board's own sub-tab — drop it when leaving.
    if (id !== 'polymarket') next.delete('pm');
    return next;
  }, { replace: true });
  const [global, setGlobal] = useState(null);
  const [trending, setTrending] = useState([]);
  const [topCoins, setTopCoins] = useState([]);
  const [allCoins, setAllCoins] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [realAltSeason, setRealAltSeason] = useState(null);
  const [fundingRates, setFundingRates] = useState([]);
  const [openInterest, setOpenInterest] = useState([]);
  const [longShortRatio, setLongShortRatio] = useState([]);
  const [liquidations, setLiquidations] = useState([]);
  const [liqConnected, setLiqConnected] = useState(false);
  // The futures cards load from their own source, so they track their own state.
  const [derivLoading, setDerivLoading] = useState(true);
  const intervalRef = useRef(null);

  // Helper: fetch with timeout (AbortSignal.timeout may not exist in older Safari)
  const fetchWithTimeout = useCallback((url, ms = 8000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
  }, []);

  // Futures data (funding, open interest, long/short) comes from Bybit's public
  // API. It used to try fapi.binance.com first, but that is geo-blocked from
  // Israeli browsers: every load cost 1+2N failed 403 requests and a 6s wait
  // before the Bybit fallback. Runs independently of the spot fetch.
  const fetchDerivatives = useCallback(async () => {
    try {
      const [list, ...ratios] = await Promise.all([
        fetchLinearTickers(),
        ...FUTURES_SYMBOLS.map((s) => fetchAccountRatio(s).catch(() => null)),
      ]);
      if (list) {
        const rates = list
          .filter((t) => {
            if (!t.symbol?.endsWith('USDT')) return false;
            if (!parseFloat(t.fundingRate)) return false;
            return MAJOR_COINS.has(t.symbol.replace('USDT', ''));
          })
          .map((t) => ({
            symbol: t.symbol.replace('USDT', ''),
            rate: parseFloat(t.fundingRate),
            markPrice: parseFloat(t.markPrice),
            nextFundingTime: Number(t.nextFundingTime),
          }))
          .sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate))
          .slice(0, 10);
        if (rates.length) setFundingRates(rates);

        const oiData = FUTURES_SYMBOLS.map((s) => {
          const t = list.find((x) => x.symbol === s);
          if (!t) return null;
          const oi = parseFloat(t.openInterest);
          const oiUsd = parseFloat(t.openInterestValue) || oi * parseFloat(t.markPrice);
          return Number.isFinite(oiUsd) && oiUsd > 0 ? { symbol: s.replace('USDT', ''), oi, oiUsd } : null;
        }).filter(Boolean);
        if (oiData.length) setOpenInterest(oiData);
      }
      const lsData = FUTURES_SYMBOLS
        .map((s, i) => (ratios[i] ? { symbol: s.replace('USDT', ''), ...ratios[i] } : null))
        .filter(Boolean);
      if (lsData.length) setLongShortRatio(lsData);
    } catch {
      // keep whatever was shown; the cards offer a retry when empty
    } finally {
      setDerivLoading(false);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      // ── PRIMARY: ALL Binance USDT tickers (short URL → cacheable, no invalid-symbol risk).
      // If the Worker route fails (its egress gets blocked by upstreams from time
      // to time), fall back to Bybit directly from the browser — same shape. ──
      let allTickers = null;
      try {
        const bnbRes = await fetchWithTimeout(`${BNB_URL}/ticker/24hr`, 10000);
        if (bnbRes.ok) {
          const json = await bnbRes.json();
          if (Array.isArray(json) && json.length) allTickers = json;
        }
      } catch { /* fall through to direct Bybit */ }
      if (!allTickers) allTickers = await fetchSpotTickersAsBinance();
      if (allTickers) {
        // Keep only real USDT spot pairs (filter leveraged tokens, stablecoins, micro-caps)
        const usdtPairs = allTickers.filter((t) => {
          if (!t.symbol.endsWith('USDT')) return false;
          if (t.symbol.endsWith('DOWNUSDT') || t.symbol.endsWith('UPUSDT')) return false;
          const sym = t.symbol.replace('USDT', '');
          if (STABLECOINS.has(sym)) return false;
          if (parseFloat(t.count) < 1000) return false; // filter dead/micro pairs
          if (parseFloat(t.quoteVolume) < 1_000_000) return false; // min $1M daily volume
          return true;
        });
        const toBinanceCoin = (t) => {
          const sym = t.symbol.replace('USDT', '');
          return {
            id: sym.toLowerCase(),
            symbol: sym.toLowerCase(),
            name: COIN_NAMES[sym] || sym,
            image: getCachedImage(sym) || '',
            current_price: parseFloat(t.lastPrice),
            price_change_percentage_24h: parseFloat(t.priceChangePercent),
            total_volume: parseFloat(t.quoteVolume),
            market_cap: 0,
          };
        };
        // Top 10 by volume — only coins with known icons
        const byVolume = [...usdtPairs]
          .filter(t => hasKnownIcon(t.symbol.replace('USDT', '')))
          .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));
        setTopCoins(byVolume.slice(0, 10).map(toBinanceCoin));
        setAllCoins(usdtPairs.map(toBinanceCoin));

        // ── Trending: volume × |change|, only coins with known icons ──
        const trendingCoins = [...usdtPairs]
          .filter(t => parseFloat(t.quoteVolume) >= 5_000_000 && hasKnownIcon(t.symbol.replace('USDT', '')))
          .sort((a, b) => {
            const sA = parseFloat(a.quoteVolume) * Math.abs(parseFloat(a.priceChangePercent));
            const sB = parseFloat(b.quoteVolume) * Math.abs(parseFloat(b.priceChangePercent));
            return sB - sA;
          })
          .slice(0, 10)
          .map(toBinanceCoin);
        setTrending(trendingCoins);

        // ── Categories: computed from Binance data (no CoinGecko needed) ──────
        const binanceCats = computeBinanceCategories(usdtPairs.map(toBinanceCoin));
        if (binanceCats.length > 0) setCategories(binanceCats.slice(0, 6));
      }

      // Same source as the home "השוק עכשיו" card (CoinPaprika, then the
      // worker's CoinGecko proxy). A direct paprika fetch used to fail here
      // and leave שווי שוק on "—" while home already showed $2.93T.
      try {
        const [marketRes, tetherRes] = await Promise.allSettled([
          fetchGlobalMarket(),
          fetchWithTimeout('https://api.coinpaprika.com/v1/tickers/usdt-tether', 6000),
        ]);
        if (marketRes.status === 'fulfilled' && marketRes.value?.total_market_cap?.usd) {
          const base = marketRes.value;
          let usdtDominance = base.market_cap_percentage?.usdt ?? null;
          const cap = base.total_market_cap.usd;
          if (usdtDominance == null && tetherRes.status === 'fulfilled' && tetherRes.value.ok) {
            try {
              const t = await tetherRes.value.json();
              const tetherCap = t?.quotes?.USD?.market_cap;
              if (tetherCap && cap) usdtDominance = (tetherCap / cap) * 100;
            } catch { /* silent — USDT.D stays "—" */ }
          }
          setGlobal({
            ...base,
            market_cap_percentage: { ...base.market_cap_percentage, usdt: usdtDominance, eth: base.market_cap_percentage?.eth ?? null },
          });
        }
      } catch { /* silent — shows "—" */ }

      // (categories now computed from Binance data above — no CoinGecko needed)

      // ── Altcoin Season Index (Worker fetches the fixed host) ─────────────
      try {
        const workerBase = import.meta.env.VITE_WORKER_URL || 'https://trade-os.tradeos.workers.dev';
        const seasonRes = await fetchWithTimeout(`${workerBase}/market/altcoin-season`, 5000);
        if (seasonRes.ok) {
          const data = await seasonRes.json();
          const lastVal = Number(data?.value);
          if (lastVal >= 0 && lastVal <= 100) setRealAltSeason(lastVal);
        }
      } catch { /* silent */ }

    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, [fetchWithTimeout]);

  useEffect(() => {
    if (activeTab !== 'overview') {
      clearInterval(intervalRef.current);
      return;
    }
    // Spot and futures load in parallel — neither waits on the other's timeouts.
    fetchAll();
    fetchDerivatives();
    intervalRef.current = setInterval(() => {
      fetchAll();
      fetchDerivatives();
    }, 60_000);
    return () => clearInterval(intervalRef.current);
  }, [fetchAll, fetchDerivatives, activeTab]);

  // "Try again" on an empty panel: show loading and refetch everything now.
  const refresh = useCallback(() => {
    setLoading(true);
    setDerivLoading(true);
    fetchAll();
    fetchDerivatives();
  }, [fetchAll, fetchDerivatives]);

  // Liquidations: live stream via Bybit WebSocket. The old Binance pair is
  // dead for our users — fstream.binance.com is geo-blocked from Israeli
  // browsers, and the allForceOrders REST seed was removed by Binance, so
  // the card sat on "ממתין לחיסולים…" forever.
  useEffect(() => {
    let ws;
    let closed = false;
    const buffer = [];
    let flushTimer;
    let pingTimer;
    let reconnectTimer;

    // Normalize symbol: strip USDT suffix and 1000-prefix (e.g. 1000PEPEUSDT → PEPE)
    const normalizeSym = (s) => s.replace('USDT', '').replace(/^1000/, '');

    const connect = () => {
      ws = new WebSocket('wss://stream.bybit.com/v5/public/linear');
      ws.onopen = () => {
        setLiqConnected(true);
        ws.send(JSON.stringify({ op: 'subscribe', args: LIQ_SYMBOLS.map((s) => `allLiquidation.${s}`) }));
      };
      ws.onmessage = (event) => {
        let data;
        try { data = JSON.parse(event.data); } catch { return; } // ignore non-JSON frames
        if (!data.topic?.startsWith('allLiquidation.')) return;
        for (const item of data.data || []) {
          const sym = normalizeSym(item.s || '');
          const usdValue = parseFloat(item.v) * parseFloat(item.p);
          if (!Number.isFinite(usdValue) || usdValue < 50) continue;
          buffer.push({
            id: `${item.s}-${item.T}-${Math.random()}`,
            symbol: sym,
            // Bybit side: Buy = a short got liquidated (forced buy-back),
            // Sell = a long got liquidated — same semantics as Binance.
            side: item.S === 'Buy' ? 'BUY' : 'SELL',
            qty: parseFloat(item.v),
            price: parseFloat(item.p),
            usdValue,
            time: Number(item.T),
          });
        }
      };
      ws.onclose = () => { setLiqConnected(false); if (!closed) reconnectTimer = setTimeout(connect, 3000); };
      ws.onerror = () => { setLiqConnected(false); ws.close(); };
    };

    connect();
    // Bybit drops idle connections — keep-alive ping every 20s
    pingTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 'ping' }));
    }, 20000);
    flushTimer = setInterval(() => {
      if (buffer.length > 0) {
        const items = buffer.splice(0);
        setLiquidations(prev => [...items, ...prev].slice(0, 50));
      }
    }, 1000);

    return () => {
      closed = true;
      clearTimeout(reconnectTimer); // a pending reconnect would open a socket nobody closes
      ws?.close();
      clearInterval(flushTimer);
      clearInterval(pingTimer);
    };
  }, []);

  // Gainers / losers. allCoins is already icon-filtered at the source, so a
  // lower 10M volume floor keeps a healthy pool. Split by SIGN so losers are
  // genuinely down-coins (never overlap gainers, never empty just because the
  // pool is small).
  // Memoized so this full-pool sort doesn't re-run on every ~1s liquidation
  // flush — only when the coin list itself changes.
  const { gainers, losers } = useMemo(() => {
    const qualityCoins = allCoins.filter(c => (c.total_volume || 0) >= 10_000_000);
    const sorted = [...qualityCoins].sort((a, b) => (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0));
    return {
      gainers: sorted.filter(c => (c.price_change_percentage_24h || 0) > 0).slice(0, 8),
      losers: sorted.filter(c => (c.price_change_percentage_24h || 0) < 0).slice(-8).reverse(),
    };
  }, [allCoins]);

  // Altcoin Season Index: prefer real BlockchainCenter data (90d), fallback to local 30d calc
  const altSeasonData = useMemo(() => {
    // Use real BlockchainCenter 90d data if available
    let index;
    if (realAltSeason != null) {
      index = realAltSeason;
    } else {
      if (!allCoins.length) return null;
      const btc = allCoins.find(c => c.symbol === 'btc');
      if (!btc) return null;
      const btcChange = btc.price_change_percentage_30d_in_currency ?? btc.price_change_percentage_24h ?? 0;
      const alts = allCoins.filter(c => !EXCLUDED_SYMBOLS.has(c.symbol?.toLowerCase()));
      if (!alts.length) return null;
      const outperforming = alts.filter(c => {
        const change = c.price_change_percentage_30d_in_currency ?? c.price_change_percentage_24h ?? 0;
        return change > btcChange;
      });
      index = Math.round((outperforming.length / alts.length) * 100);
    }
    let label, color;
    if (index >= 75) { label = 'עונת אלטקוינים'; color = '#22c55e'; }
    else if (index <= 25) { label = 'עונת ביטקוין'; color = '#f7931a'; }
    else { label = 'ניטרלי'; color = '#eab308'; }
    return { index, label, color };
  }, [allCoins, realAltSeason]);

  return (
    <m.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
      {/* Shared page header; the views switch with its tab strip. */}
      <PageHeader
        icon={Activity}
        title="סקירת שוק"
        subtitle="מצב השוק, מטבעות חמים, לווייתנים, ניתוח מטבע ו-Polymarket — במקום אחד"
        tabs={{ tabs: MARKET_TABS, value: activeTab, onChange: setActiveTab, layoutKey: 'market-tab' }}
      />

      <AnimatePresence mode="wait">
      {activeTab === 'overview' ? (
      <m.div key="overview" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25 }}>

      {/* Top row: global stats — borderless, free, divider-separated (no boxes).
          Uniform typography: 11px label, 2xl number, xs sub on every cell. */}
      <m.div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5"
        variants={staggerContainer} initial="initial" animate="animate"
      >
        {[
          {
            key: 'cap', Icon: DollarSign, label: 'שווי שוק',
            value: global ? formatNum(global.total_market_cap?.usd) : '—',
            delta: global?.market_cap_change_percentage_24h_usd ?? null,
          },
          {
            key: 'btc', Icon: Bitcoin, label: 'BTC.D',
            value: global?.market_cap_percentage?.btc ? `${global.market_cap_percentage.btc.toFixed(1)}%` : '—',
            sub: global?.market_cap_percentage?.eth ? `ETH ${global.market_cap_percentage.eth.toFixed(1)}%` : null,
          },
          {
            key: 'vol', Icon: PieChart, label: 'נפח 24h',
            value: global ? formatNum(global.total_volume?.usd) : '—',
            sub: global?.active_cryptocurrencies ? `${global.active_cryptocurrencies.toLocaleString()} coins` : null,
          },
          {
            key: 'usdt', Icon: DollarSign, label: 'USDT.D',
            value: global?.market_cap_percentage?.usdt ? `${global.market_cap_percentage.usdt.toFixed(1)}%` : '—',
            sub: 'Stablecoin dominance',
          },
        ].map((s) => (
          <MarketStatCard key={s.key} accentKey={s.key} Icon={s.Icon} label={s.label}>
            <p className="text-2xl font-bold leading-none num-mono text-text-primary"><RollingNumber value={s.value} /></p>
            <div className="h-4 mt-2">
              {s.delta != null ? (
                <span className={`text-xs font-semibold ${s.delta >= 0 ? 'text-profit' : 'text-loss'}`}>
                  {LRM}{s.delta >= 0 ? '+' : ''}{s.delta.toFixed(2)}%
                </span>
              ) : s.sub ? (
                <span className="text-xs text-text-muted">{s.sub}</span>
              ) : null}
            </div>
          </MarketStatCard>
        ))}

        {/* 24h trading-volume change — same card shape as above, value coloured by direction */}
        <MarketStatCard accentKey="volch" Icon={Activity} label="שינוי נפח">
          {global?.volume_24h_change_pct != null ? (
            <>
              <p className={`text-2xl font-bold leading-none num-mono ${global.volume_24h_change_pct >= 0 ? 'text-profit' : 'text-loss'}`}>
                <RollingNumber value={`${LRM}${global.volume_24h_change_pct >= 0 ? '+' : ''}${global.volume_24h_change_pct.toFixed(1)}%`} />
              </p>
              <div className="h-4 mt-2">
                <span className="text-xs text-text-muted">מול אתמול</span>
              </div>
            </>
          ) : (
            <p className="text-2xl font-bold text-text-muted num-mono">—</p>
          )}
        </MarketStatCard>

        {/* Altcoin Season — same card, with the index slider as its "sub" line */}
        <MarketStatCard accentKey="alt" Icon={ArrowUpRight} label="Alt Season">
          {altSeasonData ? (
            <>
              <p className="text-2xl font-bold leading-none num-mono text-text-primary">
                <RollingNumber value={String(altSeasonData.index)} /><span className="text-sm font-normal text-text-muted">/100</span>
              </p>
              <div className="mt-2">
                <div className="relative h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                  <div className="absolute inset-y-0 left-0 w-[40%] rounded-full" style={{ background: 'linear-gradient(to right, #f7931a, #c47818)' }} />
                  <div className="absolute inset-y-0 right-0 w-[40%] rounded-full" style={{ background: 'linear-gradient(to left, #6366f1, #818cf8)' }} />
                  <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 bg-text-primary"
                    style={{ left: `calc(${altSeasonData.index}% - 6px)`, borderColor: altSeasonData.color }} />
                </div>
                <span className="text-[10px] font-semibold" style={{ color: altSeasonData.color }}>{altSeasonData.label}</span>
              </div>
            </>
          ) : (
            <p className="text-2xl font-bold text-text-muted num-mono">—</p>
          )}
        </MarketStatCard>
      </m.div>

      {/* Market Sessions — full width */}
      <Reveal>
      <MarketSessionsCard />
      </Reveal>

      {/* Middle row: Fear & Greed + Hot Categories + Gainers/Losers */}
      <Reveal>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Fear & Greed with history */}
        <FearGreedGauge expanded />

        {/* Hot Categories - animated bubbles */}
        <m.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className={cardClass}
        >
          <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2 justify-center">
            <Layers className="w-4 h-4 text-accent-primary" />
            קטגוריות חמות
          </h2>
          {categories.length > 0 ? (
            <div className="flex flex-wrap gap-3 justify-center items-center min-h-[140px] py-2">
              {categories.map((cat, i) => (
                <CategoryBubble
                  key={cat.id || cat.name}
                  name={cat.name}
                  change={cat.market_cap_change_24h}
                  index={i}
                />
              ))}
            </div>
          ) : (
            <PanelStatus loading={loading} onRetry={refresh} />
          )}
        </m.div>

        {/* Top Gainers & Losers */}
        <m.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className={cardClass}
        >
          {gainers.length > 0 || losers.length > 0 ? (
            <div className="grid grid-cols-2">
              {/* עולים — right column (RTL), centered header, no card title */}
              <div className="pe-3">
                <div className="flex items-center justify-center gap-1.5 mb-3 text-xs font-bold text-profit">
                  <TrendingUp className="w-4 h-4" /> עולים
                </div>
                <div className="space-y-0.5">
                  {gainers.slice(0, 8).map((coin) => (
                    <button
                      key={coin.id}
                      type="button"
                      onClick={() => openChart(coin.symbol)}
                      dir="ltr"
                      className="w-full flex items-center justify-between py-1.5 px-1.5 rounded-lg hover:bg-bg-tertiary transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <CoinIcon pair={coin.symbol} className="w-4 h-4 shrink-0" />
                        <span className="text-xs font-medium text-text-primary truncate">{coin.symbol?.toUpperCase()}</span>
                      </div>
                      <span className="text-xs font-bold text-profit num-mono shrink-0">+{(coin.price_change_percentage_24h ?? 0).toFixed(1)}%</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* יורדים — left column (RTL); single centre divider via border-s */}
              <div className="ps-3 border-s border-border-primary">
                <div className="flex items-center justify-center gap-1.5 mb-3 text-xs font-bold text-loss">
                  <TrendingDown className="w-4 h-4" /> יורדים
                </div>
                <div className="space-y-0.5">
                  {losers.slice(0, 8).map((coin) => (
                    <button
                      key={coin.id}
                      type="button"
                      onClick={() => openChart(coin.symbol)}
                      dir="ltr"
                      className="w-full flex items-center justify-between py-1.5 px-1.5 rounded-lg hover:bg-bg-tertiary transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <CoinIcon pair={coin.symbol} className="w-4 h-4 shrink-0" />
                        <span className="text-xs font-medium text-text-primary truncate">{coin.symbol?.toUpperCase()}</span>
                      </div>
                      <span className="text-xs font-bold text-loss num-mono shrink-0">{(coin.price_change_percentage_24h ?? 0).toFixed(1)}%</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <PanelStatus loading={loading} onRetry={refresh} />
          )}
        </m.div>

      </div>

      </Reveal>

      {/* Top 10 coins + Trending + Liquidations */}
      <Reveal>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
        {/* Top 10 Coins */}
        <div className={`${cardClass} lg:col-span-2`}>
          <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2 justify-center">
            <TrendingUp className="w-4 h-4 text-accent-primary" />
            Top 10 מטבעות
          </h2>
          {topCoins.length > 0 ? (
            <div className="space-y-2">
              {topCoins.map((coin, i) => {
                const up = (coin.price_change_percentage_24h ?? 0) >= 0;
                return (
                <div key={coin.id} dir="ltr" className="flex items-center justify-between gap-2 py-1.5 border-b border-border-primary/50 last:border-0 cursor-pointer hover:bg-bg-tertiary rounded px-1 transition-colors" onClick={() => openChart(coin.symbol)}>
                  {/* Far-left: rank + icon + name grouped together */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] text-text-muted w-4 text-center shrink-0">{i + 1}</span>
                    <CoinIcon pair={coin.symbol} className="w-5 h-5 shrink-0" />
                    <span className="text-sm font-medium text-text-primary shrink-0">{coin.symbol?.toUpperCase()}</span>
                    <span className="text-[10px] text-text-muted truncate">{coin.name}</span>
                  </div>
                  {/* Far-right: price + 24h change */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm text-text-primary font-medium font-mono"><RollingNumber value={formatPrice(coin.current_price)} /></span>
                    <span className={`flex items-center gap-0.5 text-xs font-medium ${up ? 'text-profit' : 'text-loss'}`}>
                      {up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                      {coin.price_change_percentage_24h?.toFixed(2)}%
                    </span>
                  </div>
                </div>
                );
              })}
            </div>
          ) : (
            <PanelStatus loading={loading} onRetry={refresh} compact />
          )}
        </div>

        {/* Trending */}
        <div className={cardClass}>
          <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2 justify-center">
            <Flame className="w-4 h-4 text-orange-500" />
            טרנדינג
          </h2>
          {trending.length > 0 ? (
            <div className="space-y-2">
              {trending.map((coin, i) => {
                const chg = coin.price_change_percentage_24h ?? 0;
                const up = chg >= 0;
                return (
                  <m.div
                    key={coin.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.05 * i, duration: 0.3 }}
                    dir="ltr"
                    className="flex items-center justify-between gap-2 py-1 border-b border-border-primary/30 last:border-0 cursor-pointer hover:bg-bg-tertiary rounded px-1 transition-colors"
                    onClick={() => openChart(coin.symbol)}
                  >
                    {/* Far-left: rank + icon + symbol grouped together */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-text-muted w-5 text-center shrink-0">#{i + 1}</span>
                      <CoinIcon pair={coin.symbol} className="w-4 h-4 shrink-0" />
                      <span className="text-sm font-medium text-text-primary truncate">{coin.symbol?.toUpperCase()}</span>
                    </div>
                    {/* Far-right: 24h change */}
                    <span className={`flex items-center gap-0.5 text-[11px] font-medium shrink-0 ${up ? 'text-profit' : 'text-loss'}`}>
                      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {LRM}{up ? '+' : ''}{chg.toFixed(1)}%
                    </span>
                  </m.div>
                );
              })}
            </div>
          ) : (
            <PanelStatus loading={loading} onRetry={refresh} compact />
          )}
        </div>

        {/* Liquidations */}
        <LiquidationsCard liquidations={liquidations} connected={liqConnected} />
      </div>

      </Reveal>

      {/* Futures Data */}
      <Reveal>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <FundingRatesCard rates={fundingRates} loading={derivLoading} onRetry={refresh} />
        <OpenInterestCard data={openInterest} loading={derivLoading} onRetry={refresh} />
        <LongShortCard data={longShortRatio} loading={derivLoading} onRetry={refresh} />
      </div>

      </Reveal>

      {/* Heatmap */}
      <Reveal>
      <CryptoHeatmap coins={allCoins} loading={loading} onRetry={refresh} />
      </Reveal>

      </m.div>
      ) : activeTab === 'analysis' ? (
      <m.div key="analysis" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
        <CoinAnalysis />
      </m.div>
      ) : activeTab === 'polymarket' ? (
      // Own boundary: this tab streams live third-party data, so a throw here
      // should degrade the tab, not blank the whole page.
      <m.div key="polymarket" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
        <ErrorBoundary>
          <Suspense fallback={<LoadingSpinner />}>
            <PolymarketPage />
          </Suspense>
        </ErrorBoundary>
      </m.div>
      ) : (
      // Whale tracking — live big trades & liquidations, its own tab next to
      // the coin analysis.
      <m.div key="whales" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
        <WhalesPage embedded />
      </m.div>
      )}
      </AnimatePresence>
    </m.div>
  );
}
