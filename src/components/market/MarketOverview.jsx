import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, TrendingUp, TrendingDown, Bitcoin, DollarSign,
  PieChart, Flame, ArrowUpRight, ArrowDownRight, Layers, Rocket, Grid3X3,
  Percent, BarChart3, Zap, Sparkles, Bot,
} from 'lucide-react';
import { pageVariants, pageTransition, staggerContainer } from '../../utils/animations';
import FearGreedGauge from '../dashboard/FearGreedGauge';
import CoinAnalysis from './CoinAnalysis';
import MarketSessionsCard from './MarketSessionsCard';
import { getCachedImage, hasKnownIcon } from '../../services/coinImageCache';
import { fetchSpotTickersAsBinance, fetchLinearTickers, fetchAccountRatio } from '../../services/bybitDirect';
import CoinIcon from '../shared/CoinIcon';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || '';
const CG_PROXY = WORKER_URL + '/cg';
const CG_DIRECT = 'https://api.coingecko.com/api/v3';
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
  cap:  statAccent(56, 189, 248, '#38bdf8'),   // market cap  — sky-blue
  usdt: statAccent(38, 212, 175, '#2dd4bf'),   // USDT.D      — teal
  btc:  statAccent(251, 146, 60, '#fb923c'),   // BTC.D       — bitcoin orange
  vol:  statAccent(192, 132, 252, '#c084fc'),  // 24h volume  — violet
  alt:  statAccent(129, 140, 248, '#818cf8'),  // alt season  — indigo
};
const FUTURES_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT',
  'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT',
];
const MAJOR_COINS = new Set([
  'BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK',
  'MATIC', 'UNI', 'LTC', 'ATOM', 'APT', 'ARB', 'OP', 'SUI', 'NEAR', 'FIL',
  'PEPE', 'WIF', 'SHIB', 'TRX', 'ETC', 'INJ', 'SEI', 'TIA', 'FET', 'RENDER',
]);

function formatNum(n) {
  if (!n) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

function formatPrice(p) {
  if (!p && p !== 0) return '—';
  if (p >= 1) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${p.toFixed(6)}`;
}

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
    <motion.div
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.3 + index * 0.1, duration: 0.5, type: 'spring', stiffness: 200 }}
      className="relative"
    >
      <motion.div
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
          {isPositive ? '+' : ''}{change.toFixed(1)}%
        </span>
      </motion.div>
    </motion.div>
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
    <motion.div
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
        {change != null ? `${change >= 0 ? '+' : ''}${change.toFixed(1)}%` : '—'}
      </span>
    </motion.div>
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

function FundingRatesCard({ rates, loading }) {
  const maxAbs = rates.length ? Math.max(...rates.map(r => Math.abs(r.rate))) : 1;
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className={cardClass}
    >
      <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2 justify-center">
        <Percent className="w-4 h-4 text-accent-primary" />
        שיעורי מימון (Funding)
      </h2>
      {rates.length > 0 ? (
        <div className="space-y-1.5">
          {rates.map((r, i) => {
            const pct = (r.rate * 100).toFixed(4);
            const isNeg = r.rate < 0;
            const barW = (Math.abs(r.rate) / maxAbs) * 44;
            return (
              <motion.div
                key={r.symbol}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.04 * i, duration: 0.3 }}
                className="flex items-center gap-1.5"
                dir="ltr"
              >
                <span
                  className="text-[10px] font-semibold w-14 text-right shrink-0"
                  style={{ color: isNeg ? '#22c55e' : '#ef4444' }}
                >
                  {isNeg ? '' : '+'}{pct}%
                </span>
                <div className="flex-1 relative h-3 bg-bg-tertiary rounded-full overflow-hidden">
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-text-muted/30 z-10" />
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${barW}%` }}
                    transition={{ delay: 0.04 * i + 0.2, duration: 0.6, ease: 'easeOut' }}
                    className="absolute top-0 h-full"
                    style={isNeg
                      ? { right: '50%', borderRadius: '9999px 0 0 9999px', backgroundColor: 'rgba(34, 197, 94, 0.5)' }
                      : { left: '50%', borderRadius: '0 9999px 9999px 0', backgroundColor: 'rgba(239, 68, 68, 0.5)' }
                    }
                  />
                </div>
                <span className="text-[11px] font-bold text-text-primary w-10 shrink-0">{r.symbol}</span>
              </motion.div>
            );
          })}
          <div className="flex items-center justify-center gap-4 mt-2 pt-2 border-t border-border-primary/30">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'rgba(34, 197, 94, 0.6)' }} />
              <span className="text-[9px] text-text-muted">Shorts משלמים</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'rgba(239, 68, 68, 0.6)' }} />
              <span className="text-[9px] text-text-muted">Longs משלמים</span>
            </div>
            {rates[0] && <FundingCountdown nextTime={rates[0].nextFundingTime} />}
          </div>
        </div>
      ) : (
        <p className="text-xs text-text-muted text-center py-8">{loading ? 'טוען...' : 'לא זמין'}</p>
      )}
    </motion.div>
  );
}

function OpenInterestCard({ data, loading }) {
  const maxOiUsd = data.length ? Math.max(...data.map(d => d.oiUsd)) : 1;
  const totalOi = data.reduce((sum, d) => sum + d.oiUsd, 0);
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className={cardClass}
    >
      <h2 className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2 justify-center">
        <Activity className="w-4 h-4 text-accent-primary" />
        פוזיציות פתוחות (OI)
      </h2>
      {data.length > 0 && (
        <p className="text-center text-[11px] text-text-muted mb-3">סה״כ {formatNum(totalOi)}</p>
      )}
      {data.length > 0 ? (
        <div className="space-y-0.5">
          {data.map((d, i) => {
            const barW = (d.oiUsd / maxOiUsd) * 100;
            return (
              <motion.div
                key={d.symbol}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.04 * i, duration: 0.3 }}
                className="flex items-center gap-1.5 py-0.5"
                dir="ltr"
              >
                <span className="text-[9px] text-text-muted/40 w-3 text-center shrink-0">{i + 1}</span>
                <span className="text-[11px] font-bold text-text-primary w-10 shrink-0">{d.symbol}</span>
                <div className="flex-1 h-2.5 bg-bg-tertiary rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${barW}%` }}
                    transition={{ delay: 0.04 * i + 0.2, duration: 0.8, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{ background: 'linear-gradient(to right, #6366f1, #3b82f6, #06b6d4)' }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-text-muted w-12 text-left shrink-0">
                  {formatNum(d.oiUsd)}
                </span>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-text-muted text-center py-8">{loading ? 'טוען...' : 'לא זמין'}</p>
      )}
    </motion.div>
  );
}

function LongShortCard({ data, loading }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className={cardClass}
    >
      <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2 justify-center">
        <BarChart3 className="w-4 h-4 text-accent-primary" />
        יחס לונג / שורט
      </h2>
      {data.length > 0 ? (
        <div className="space-y-1.5">
          {data.map((d, i) => {
            const longPct = (d.longAccount * 100).toFixed(1);
            const shortPct = (d.shortAccount * 100).toFixed(1);
            return (
              <motion.div
                key={d.symbol}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.04 * i, duration: 0.3 }}
              >
                <div className="flex items-center gap-1.5" dir="ltr">
                  <span className="text-[11px] font-bold text-text-primary w-10 text-center shrink-0">{d.symbol}</span>
                  <div className="flex flex-1 h-5 rounded-md overflow-hidden bg-bg-tertiary">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${longPct}%` }}
                      transition={{ delay: 0.04 * i + 0.2, duration: 0.8, ease: 'easeOut' }}
                      className="h-full flex items-center justify-center"
                      style={{ backgroundColor: 'rgba(34, 197, 94, 0.25)', minWidth: 36 }}
                    >
                      <span className="text-[9px] font-bold text-green-400">{longPct}%</span>
                    </motion.div>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${shortPct}%` }}
                      transition={{ delay: 0.04 * i + 0.2, duration: 0.8, ease: 'easeOut' }}
                      className="h-full flex items-center justify-center"
                      style={{ backgroundColor: 'rgba(239, 68, 68, 0.25)', minWidth: 36 }}
                    >
                      <span className="text-[9px] font-bold text-red-400">{shortPct}%</span>
                    </motion.div>
                  </div>
                </div>
              </motion.div>
            );
          })}
          <div className="flex items-center justify-center gap-4 mt-2 pt-2 border-t border-border-primary/30">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'rgba(34, 197, 94, 0.6)' }} />
              <span className="text-[9px] text-text-muted">Long (קונים)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'rgba(239, 68, 68, 0.6)' }} />
              <span className="text-[9px] text-text-muted">Short (מוכרים)</span>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-text-muted text-center py-8">{loading ? 'טוען...' : 'לא זמין'}</p>
      )}
    </motion.div>
  );
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'עכשיו';
  if (diff < 60) return `לפני ${diff}s`;
  if (diff < 3600) return `לפני ${Math.floor(diff / 60)}m`;
  return `לפני ${Math.floor(diff / 3600)}h`;
}

function LiquidationsCard({ liquidations }) {
  const longs = liquidations.filter(l => l.side === 'SELL');
  const shorts = liquidations.filter(l => l.side === 'BUY');
  const totalLongUsd = longs.reduce((s, l) => s + l.usdValue, 0);
  const totalShortUsd = shorts.reduce((s, l) => s + l.usdValue, 0);
  const total = totalLongUsd + totalShortUsd;
  const longPct = total > 0 ? (totalLongUsd / total) * 100 : 50;

  return (
    <div className={cardClass}>
      <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2 justify-center">
        <Zap className="w-4 h-4 text-yellow-500" />
        חיסולים LIVE
      </h2>

      {/* Summary bar */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-medium text-red-400">
            Short {shorts.length}
          </span>
          <span className="text-[10px] font-medium text-green-400">
            {longs.length} Long
          </span>
        </div>
        <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden flex" dir="ltr">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${longPct}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full rounded-l-full"
            style={{ backgroundColor: 'rgba(34, 197, 94, 0.6)' }}
          />
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${100 - longPct}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full rounded-r-full"
            style={{ backgroundColor: 'rgba(239, 68, 68, 0.6)' }}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[9px] text-text-muted">{formatNum(totalShortUsd)}</span>
          <span className="text-[9px] text-text-muted">{formatNum(totalLongUsd)}</span>
        </div>
      </div>

      {/* Feed */}
      {liquidations.length > 0 ? (
        <div className="space-y-1 max-h-[400px] overflow-y-auto scrollbar-thin">
          {liquidations.map((liq) => {
            const isLong = liq.side === 'SELL';
            const big = liq.usdValue >= 50000;
            return (
              <motion.div
                key={liq.id}
                initial={{ opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25 }}
                className={`flex items-center justify-between py-1.5 px-2 rounded-md ${big ? 'border' : ''}`}
                style={{
                  backgroundColor: isLong ? 'rgba(239, 68, 68, 0.07)' : 'rgba(34, 197, 94, 0.07)',
                  borderColor: big ? (isLong ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)') : undefined,
                }}
              >
                <span className="text-[9px] text-text-muted shrink-0">{timeAgo(liq.time)}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold" style={{ color: isLong ? '#ef4444' : '#22c55e' }}>
                    {formatNum(liq.usdValue)}
                  </span>
                  <span className="text-[10px] text-text-muted">
                    {isLong ? 'L' : 'S'}
                  </span>
                  <span className="text-[11px] font-bold text-text-primary">{liq.symbol}</span>
                  <Zap className="w-3 h-3 shrink-0" style={{ color: isLong ? '#ef4444' : '#22c55e' }} />
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8">
          <Zap className="w-5 h-5 text-yellow-500/40 mx-auto mb-2" />
          <motion.div
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-[11px] text-text-muted"
          >
            ממתין לחיסולים...
          </motion.div>
        </div>
      )}
    </div>
  );
}

function CryptoHeatmap({ coins, loading }) {
  if (!coins.length) {
    return (
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className={cardClass}>
        <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2 justify-center">
          <Grid3X3 className="w-4 h-4 text-accent-primary" />
          מפת חום
        </h2>
        <p className="text-xs text-text-muted text-center py-8">{loading ? 'טוען...' : 'לא זמין'}</p>
      </motion.div>
    );
  }

  const top20 = coins.slice(0, 20);

  return (
    <motion.div
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
    </motion.div>
  );
}

export default function MarketOverview() {
  const [activeTab, setActiveTab] = useState('overview');
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
  const intervalRef = useRef(null);

  // Helper: fetch with timeout (AbortSignal.timeout may not exist in older Safari)
  const fetchWithTimeout = useCallback((url, ms = 8000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
  }, []);

  // Binance futures data runs independently so it's never blocked by CoinGecko
  const fetchBinance = useCallback(async () => {
    try {
      const [premiumRes, ...oiAndLsRes] = await Promise.allSettled([
        fetchWithTimeout('https://fapi.binance.com/fapi/v1/premiumIndex', 6000),
        ...FUTURES_SYMBOLS.map(s => fetchWithTimeout(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${s}`, 6000)),
        ...FUTURES_SYMBOLS.map(s => fetchWithTimeout(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${s}&period=5m&limit=1`, 6000)),
      ]);

      if (premiumRes.status === 'fulfilled' && premiumRes.value.ok) {
        const allPairs = await premiumRes.value.json();
        const usdtPairs = allPairs
          .filter(p => {
            if (!p.symbol?.endsWith('USDT')) return false;
            if (parseFloat(p.lastFundingRate) === 0) return false;
            return MAJOR_COINS.has(p.symbol.replace('USDT', ''));
          })
          .map(p => ({
            symbol: p.symbol.replace('USDT', ''),
            rate: parseFloat(p.lastFundingRate),
            markPrice: parseFloat(p.markPrice),
            nextFundingTime: p.nextFundingTime,
          }))
          .sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate))
          .slice(0, 10);
        setFundingRates(usdtPairs);

        const oiData = [];
        for (let i = 0; i < FUTURES_SYMBOLS.length; i++) {
          const res = oiAndLsRes[i];
          if (res.status === 'fulfilled' && res.value.ok) {
            const d = await res.value.json();
            const sym = FUTURES_SYMBOLS[i].replace('USDT', '');
            const markP = allPairs.find(p => p.symbol === FUTURES_SYMBOLS[i]);
            const oi = parseFloat(d.openInterest);
            const price = markP ? parseFloat(markP.markPrice) : 0;
            oiData.push({ symbol: sym, oi, oiUsd: oi * price });
          }
        }
        setOpenInterest(oiData);
      }

      const lsData = [];
      for (let i = 0; i < FUTURES_SYMBOLS.length; i++) {
        const res = oiAndLsRes[FUTURES_SYMBOLS.length + i];
        if (res.status === 'fulfilled' && res.value.ok) {
          const d = await res.value.json();
          if (d.length) {
            lsData.push({
              symbol: FUTURES_SYMBOLS[i].replace('USDT', ''),
              longAccount: parseFloat(d[0].longAccount),
              shortAccount: parseFloat(d[0].shortAccount),
              ratio: parseFloat(d[0].longShortRatio),
            });
          }
        }
      }
      if (lsData.length) setLongShortRatio(lsData);

      // ── Fallback: Bybit linear data when fapi.binance.com is unreachable
      // (geo-blocked from Israeli ISPs in the browser) ──
      const binanceFuturesOk = premiumRes.status === 'fulfilled' && premiumRes.value.ok;
      if (!binanceFuturesOk) {
        const list = await fetchLinearTickers();
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
      }
      if (!lsData.length) {
        const ratios = await Promise.allSettled(FUTURES_SYMBOLS.map((s) => fetchAccountRatio(s)));
        const out = [];
        for (let i = 0; i < FUTURES_SYMBOLS.length; i++) {
          const r = ratios[i];
          if (r.status === 'fulfilled' && r.value) {
            out.push({ symbol: FUTURES_SYMBOLS[i].replace('USDT', ''), ...r.value });
          }
        }
        if (out.length) setLongShortRatio(out);
      }
    } catch {
      // silent
    }
  }, [fetchWithTimeout]);

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

      // ── SECONDARY: CoinPaprika global (free, no key, CORS-enabled).
      // /v1/global has no stablecoin dominance, so USDT.D is computed from
      // Tether's own ticker (its market cap / total market cap). ──
      try {
        const [globalRes, tetherRes] = await Promise.allSettled([
          fetchWithTimeout('https://api.coinpaprika.com/v1/global', 6000),
          fetchWithTimeout('https://api.coinpaprika.com/v1/tickers/usdt-tether', 6000),
        ]);
        if (globalRes.status === 'fulfilled' && globalRes.value.ok) {
          const d = await globalRes.value.json();
          let usdtDominance = null;
          if (tetherRes.status === 'fulfilled' && tetherRes.value.ok) {
            try {
              const t = await tetherRes.value.json();
              const tetherCap = t?.quotes?.USD?.market_cap;
              if (tetherCap && d.market_cap_usd) usdtDominance = (tetherCap / d.market_cap_usd) * 100;
            } catch { /* silent — shows "—" */ }
          }
          setGlobal({
            total_market_cap: { usd: d.market_cap_usd },
            total_volume: { usd: d.volume_24h_usd },
            market_cap_change_percentage_24h_usd: d.market_cap_change_24h,
            market_cap_percentage: { btc: d.bitcoin_dominance_percentage, usdt: usdtDominance, eth: null },
            active_cryptocurrencies: d.cryptocurrencies_number,
          });
        }
      } catch { /* silent — shows "—" */ }

      // (categories now computed from Binance data above — no CoinGecko needed)

      // ── Altcoin Season Index ──────────────────────────────────────────────
      try {
        const proxyUrl = 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent('https://www.blockchaincenter.net/en/altcoin-season-index/');
        const proxyRes = await fetchWithTimeout(proxyUrl, 5000);
        if (proxyRes.ok) {
          const html = await proxyRes.text();
          const idx90 = html.indexOf('\\"90\\":{');
          if (idx90 !== -1) {
            const chunk = html.substring(idx90, idx90 + 100000);
            const closePattern = '},\\"';
            const closeBrace = chunk.indexOf(closePattern);
            if (closeBrace > 0) {
              const section = chunk.substring(0, closeBrace);
              const allDates = [...section.matchAll(/\\"(\d{4}-\d{2}-\d{2})\\":\\"(\d+)\\"/g)];
              if (allDates.length) {
                const lastVal = parseInt(allDates[allDates.length - 1][2], 10);
                if (lastVal >= 0 && lastVal <= 100) setRealAltSeason(lastVal);
              }
            }
          }
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
    // Run CoinGecko and Binance in parallel — Binance won't be blocked by CoinGecko timeouts
    fetchAll();
    fetchBinance();
    intervalRef.current = setInterval(() => {
      fetchAll();
      fetchBinance();
    }, 60_000);
    return () => clearInterval(intervalRef.current);
  }, [fetchAll, fetchBinance, activeTab]);

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

    // Normalize symbol: strip USDT suffix and 1000-prefix (e.g. 1000PEPEUSDT → PEPE)
    const normalizeSym = (s) => s.replace('USDT', '').replace(/^1000/, '');

    const connect = () => {
      ws = new WebSocket('wss://stream.bybit.com/v5/public/linear');
      ws.onopen = () => {
        ws.send(JSON.stringify({ op: 'subscribe', args: FUTURES_SYMBOLS.map((s) => `allLiquidation.${s}`) }));
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
      ws.onclose = () => { if (!closed) setTimeout(connect, 3000); };
      ws.onerror = () => ws.close();
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
      ws?.close();
      clearInterval(flushTimer);
      clearInterval(pingTimer);
    };
  }, []);

  // Compute gainers and losers — $30M+ volume AND must have a real icon
  const qualityCoins = allCoins.filter(c =>
    (c.total_volume || 0) >= 30_000_000 && hasKnownIcon(c.symbol)
  );
  const sorted = [...qualityCoins].sort((a, b) => (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0));
  const gainers = sorted.slice(0, 5);
  // Take the bottom 5 WITHOUT overlapping the top 5 (when fewer than 10 quality
  // coins exist, slice(-5) would otherwise repeat gainers as losers).
  const losers = sorted.slice(Math.max(5, sorted.length - 5)).reverse();

  // Altcoin Season Index: prefer real BlockchainCenter data (90d), fallback to local 30d calc
  const EXCLUDED_SYMBOLS = new Set([
    'usdt', 'usdc', 'dai', 'busd', 'tusd', 'fdusd', 'usdp', 'usdd', 'gusd', 'frax', 'lusd', 'crvusd', 'pyusd', 'usde',
    'wbtc', 'weth', 'steth', 'wsteth', 'reth', 'cbeth', 'hbtc', 'renbtc',
  ]);
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
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
      {/* Tabs */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:justify-center gap-2 mb-6">
        {[
          { key: 'overview', label: 'סקירה',      shortLabel: 'סקירה',   icon: Activity },
          { key: 'analysis', label: 'ניתוח מטבע', shortLabel: 'ניתוח',   icon: Sparkles },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === tab.key
                ? 'bg-accent-primary text-white shadow-lg shadow-accent-primary/25'
                : 'bg-bg-secondary border border-border-primary text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
            }`}
          >
            <tab.icon className="w-4 h-4 sm:w-4.5 sm:h-4.5 shrink-0" />
            <span className="sm:hidden">{tab.shortLabel}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
      {activeTab === 'overview' ? (
      <motion.div key="overview" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25 }}>

      {/* Top row: global stats — borderless, free, divider-separated (no boxes).
          Uniform typography: 11px label, 2xl number, xs sub on every cell. */}
      <motion.div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-y-6 gap-x-2 mb-7 lg:divide-x lg:divide-x-reverse lg:divide-border-primary"
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
          <motion.div key={s.key} variants={cardVariants} className="px-1 lg:px-5">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: STAT_ACCENTS[s.key].chipBg }}>
                <s.Icon className="w-3.5 h-3.5" style={{ color: STAT_ACCENTS[s.key].color }} />
              </span>
              <span className="text-[11px] text-text-muted uppercase tracking-wider">{s.label}</span>
            </div>
            <p className="text-2xl font-bold leading-none num-mono text-text-primary">{s.value}</p>
            <div className="h-4 mt-2">
              {s.delta != null ? (
                <span className={`text-xs font-semibold ${s.delta >= 0 ? 'text-profit' : 'text-loss'}`}>
                  {s.delta >= 0 ? '+' : ''}{s.delta.toFixed(2)}%
                </span>
              ) : s.sub ? (
                <span className="text-xs text-text-muted">{s.sub}</span>
              ) : null}
            </div>
          </motion.div>
        ))}

        {/* Altcoin Season — same rhythm, with the index slider as its "sub" line */}
        <motion.div variants={cardVariants} className="px-1 lg:px-5">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: STAT_ACCENTS.alt.chipBg }}>
              <ArrowUpRight className="w-3.5 h-3.5" style={{ color: STAT_ACCENTS.alt.color }} />
            </span>
            <span className="text-[11px] text-text-muted uppercase tracking-wider">Alt Season</span>
          </div>
          {altSeasonData ? (
            <>
              <p className="text-2xl font-bold leading-none num-mono text-text-primary">
                {altSeasonData.index}<span className="text-sm font-normal text-text-muted">/100</span>
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
        </motion.div>
      </motion.div>

      {/* Market Sessions — full width */}
      <MarketSessionsCard />

      {/* Middle row: Fear & Greed + Hot Categories + Gainers/Losers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Fear & Greed with history */}
        <FearGreedGauge expanded />

        {/* Hot Categories - animated bubbles */}
        <motion.div
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
            <p className="text-xs text-text-muted text-center py-8">{loading ? 'טוען...' : 'לא זמין'}</p>
          )}
        </motion.div>

        {/* Top Gainers & Losers */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className={cardClass}
        >
          <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2 justify-center">
            <Rocket className="w-4 h-4 text-profit" />
            עולים ויורדים
          </h2>
          {gainers.length > 0 ? (
            <div className="grid grid-cols-2 divide-x divide-x-reverse divide-border-primary">
              {/* עולים — right column (RTL) */}
              <div className="pl-3">
                <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold text-profit uppercase tracking-wider">
                  <TrendingUp className="w-3.5 h-3.5" /> עולים
                </div>
                <div className="space-y-0.5">
                  {gainers.slice(0, 5).map((coin) => (
                    <button
                      key={coin.id}
                      type="button"
                      onClick={() => openChart(coin.symbol)}
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
              {/* יורדים — left column (RTL) */}
              <div className="pr-3">
                <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold text-loss uppercase tracking-wider">
                  <TrendingDown className="w-3.5 h-3.5" /> יורדים
                </div>
                <div className="space-y-0.5">
                  {losers.slice(0, 5).map((coin) => (
                    <button
                      key={coin.id}
                      type="button"
                      onClick={() => openChart(coin.symbol)}
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
            <p className="text-xs text-text-muted text-center py-8">{loading ? 'טוען...' : 'לא זמין'}</p>
          )}
        </motion.div>

      </div>

      {/* Top 10 coins + Trending + Liquidations */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
        {/* Top 10 Coins */}
        <div className={`${cardClass} lg:col-span-2`}>
          <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2 justify-center">
            <TrendingUp className="w-4 h-4 text-accent-primary" />
            Top 10 מטבעות
          </h2>
          {topCoins.length > 0 ? (
            <div className="space-y-2">
              {topCoins.map((coin, i) => (
                <div key={coin.id} className="flex items-center justify-between py-1.5 border-b border-border-primary/50 last:border-0 cursor-pointer hover:bg-bg-tertiary rounded px-1 transition-colors" onClick={() => openChart(coin.symbol)}>
                  <div className="flex items-center gap-2">
                    {coin.price_change_percentage_24h >= 0 ? (
                      <ArrowUpRight className="w-3.5 h-3.5 text-profit" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5 text-loss" />
                    )}
                    <span className={`text-xs font-medium ${coin.price_change_percentage_24h >= 0 ? 'text-profit' : 'text-loss'}`}>
                      {coin.price_change_percentage_24h?.toFixed(2)}%
                    </span>
                    <span className="text-sm text-text-primary font-medium font-mono">{formatPrice(coin.current_price)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-right">
                      <span className="text-sm font-medium text-text-primary">{coin.symbol?.toUpperCase()}</span>
                      <span className="text-[10px] text-text-muted">{coin.name}</span>
                    </div>
                    <CoinIcon pair={coin.symbol} className="w-5 h-5" />
                    <span className="text-[10px] text-text-muted w-4 text-center shrink-0">{i + 1}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-muted text-center py-4">{loading ? 'טוען...' : 'לא זמין'}</p>
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
                return (
                  <motion.div
                    key={coin.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.05 * i, duration: 0.3 }}
                    className="flex items-center justify-between py-1 border-b border-border-primary/30 last:border-0 cursor-pointer hover:bg-bg-tertiary rounded px-1 transition-colors"
                    onClick={() => openChart(coin.symbol)}
                  >
                    <div className="flex items-center gap-1.5 w-16 shrink-0">
                      {chg >= 0 ? (
                        <ArrowUpRight className="w-3 h-3 text-profit" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3 text-loss" />
                      )}
                      <span className={`text-[11px] font-medium ${chg >= 0 ? 'text-profit' : 'text-loss'}`}>
                        {chg >= 0 ? '+' : ''}{chg.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">{coin.symbol?.toUpperCase()}</span>
                      <CoinIcon pair={coin.symbol} className="w-4 h-4" />
                      <span className="text-[10px] text-text-muted">#{i + 1}</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-text-muted text-center py-4">{loading ? 'טוען...' : 'לא זמין'}</p>
          )}
        </div>

        {/* Liquidations */}
        <LiquidationsCard liquidations={liquidations} />
      </div>

      {/* Futures Data */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <FundingRatesCard rates={fundingRates} loading={loading} />
        <OpenInterestCard data={openInterest} loading={loading} />
        <LongShortCard data={longShortRatio} loading={loading} />
      </div>

      {/* Heatmap */}
      <CryptoHeatmap coins={allCoins} loading={loading} />

      </motion.div>
      ) : (
      <motion.div key="analysis" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
        <CoinAnalysis />
      </motion.div>
      )}
      </AnimatePresence>
    </motion.div>
  );
}
