import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import {
  Shield, Eye, EyeOff, Check, ExternalLink,
  RefreshCw, Download, X, Zap, HelpCircle, Pencil, Link2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getUserSetting, setUserSetting, addToUserCollection } from '../../services/firestoreService';
import { syncExchangeTrades, syncOpenPositions, fetchExchangeBalance } from '../../services/exchangeService';
import { useAuth } from '../../contexts/AuthContext';
import { useJournalContext } from '../../contexts/JournalContext';
import { pageVariants, pageTransition } from '../../utils/animations';
import LoadingSpinner from '../shared/LoadingSpinner';
import { getExchangeLogo } from '../../utils/constants';
import { Timestamp } from 'firebase/firestore';

// ── Exchange config ───────────────────────────────────────────────────────────
const EXCHANGES = [
  {
    id: 'bybit',   name: 'Bybit',   tagline: 'Derivatives Exchange',
    accent: '#F7A600', glow: 'rgba(247,166,0,0.35)',
    apiUrl: 'https://www.bybit.com/app/user/api-management', canSync: true,
    steps: [
      { text: 'Account → API Management → Create New Key', n: '1' },
      { text: 'בחר "System-generated API Keys"', n: '2' },
      { text: 'שם: "TradeOS"', n: '3' },
      { text: 'Permissions → Read-Only בלבד ✓', n: '4', ok: true },
      { text: 'אל תסמן Trade / Withdraw / Transfer', n: '!', warn: true },
      { text: 'Submit → 2FA → העתק מפתחות', n: '5' },
    ],
  },
  {
    id: 'mexc',    name: 'MEXC',    tagline: 'Global Crypto Exchange',
    accent: '#2B78FF', glow: 'rgba(43,120,255,0.35)',
    apiUrl: 'https://www.mexc.com/user/openapi', canSync: true,
    steps: [
      { text: 'Profile → API Management → Create API Key', n: '1' },
      { text: 'שם: "TradeOS"', n: '2' },
      { text: 'Futures → Account: View Account Details ✓', n: '3', ok: true },
      { text: 'Futures → Trade: View Order Details ✓', n: '4', ok: true },
      { text: 'אל תסמן Order Placing / Withdraw / Trade', n: '!', warn: true },
      { text: 'Create → 2FA → העתק מפתחות', n: '5' },
    ],
  },
  {
    id: 'okx',     name: 'OKX',     tagline: 'Advanced Trading Platform',
    accent: '#0AC18E', glow: 'rgba(10,193,142,0.35)',
    apiUrl: 'https://www.okx.com/account/my-api', canSync: true,
    steps: [
      { text: 'Profile → API → Create API', n: '1' },
      { text: 'שם: "TradeOS" → קבע Passphrase', n: '2' },
      { text: 'Permissions → Read ✓ בלבד', n: '3', ok: true },
      { text: 'אל תסמן Trade / Withdraw', n: '!', warn: true },
      { text: 'Confirm → 2FA → העתק Key + Secret + Passphrase', n: '4' },
    ],
    extraField: { key: 'passphrase', label: 'Passphrase', placeholder: 'OKX Passphrase' },
  },
  {
    id: 'bitget',  name: 'Bitget',  tagline: 'Copy Trading & Futures',
    accent: '#00C580', glow: 'rgba(0,197,128,0.35)',
    apiUrl: 'https://www.bitget.com/account/newapi', canSync: true,
    steps: [
      { text: 'Account → API Management → Create API', n: '1' },
      { text: 'שם: "TradeOS" → קבע Passphrase', n: '2' },
      { text: 'Permissions → Read Only ✓', n: '3', ok: true },
      { text: 'אל תסמן Trade / Withdrawal', n: '!', warn: true },
      { text: 'Confirm → 2FA → העתק Key + Secret + Passphrase', n: '4' },
    ],
    extraField: { key: 'passphrase', label: 'Passphrase', placeholder: 'Bitget Passphrase' },
  },
  {
    id: 'binance', name: 'Binance', tagline: "World's Largest Exchange",
    accent: '#F0B90B', glow: 'rgba(240,185,11,0.35)',
    apiUrl: 'https://www.binance.com/en/my/settings/api-management', canSync: false,
    steps: [
      { text: 'Profile → API Management → Create API', n: '1' },
      { text: 'בחר "System Generated" → שם: "TradeOS"', n: '2' },
      { text: 'Restrictions → Enable Reading בלבד ✓', n: '3', ok: true },
      { text: 'אל תסמן Spot Trading / Futures / Withdrawals', n: '!', warn: true },
      { text: 'שמור API Key + Secret Key', n: '4' },
    ],
  },
  {
    id: 'mt5',     name: 'MetaTrader 5', tagline: 'Forex & CFD Platform',
    accent: '#7B5EA7', glow: 'rgba(123,94,167,0.35)',
    apiUrl: '', canSync: false, csvOnly: true,
    steps: [
      { text: 'פתח MT5 → Toolbox → לשונית History', n: '1' },
      { text: 'לחץ ימני על הרשימה → בחר טווח תאריכים', n: '2' },
      { text: 'לחץ ימני → Report → Save as CSV', n: '3', ok: true },
      { text: 'ודא שיש עמודות Symbol, Type, Open/Close Price, Profit', n: '!', warn: true },
      { text: 'ב-TradeOS → ייבוא → בחר קובץ CSV (המיפוי אוטומטי)', n: '5', ok: true },
    ],
  },
];

function maskKey(k) {
  if (!k || k.length < 8) return '••••••••••••••••';
  return k.slice(0, 5) + '••••••••••••' + k.slice(-4);
}

// ── Floating orb background ───────────────────────────────────────────────────
function FloatingOrb({ color, style }) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{ background: `radial-gradient(circle, ${color} 0%, transparent 70%)`, ...style }}
      animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.65, 0.4] }}
      transition={{ duration: 4 + Math.random() * 2, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

// ── Real logo with fallback ───────────────────────────────────────────────────
function ExLogo({ id, size = 48, accent }) {
  const [err, setErr] = useState(false);
  const url = getExchangeLogo(id);
  if (!err && url) return (
    <div className="rounded-xl overflow-hidden flex items-center justify-center"
      style={{ width: size, height: size, background: `${accent}22`, border: `1px solid ${accent}40` }}>
      <img src={url} alt={id} width={size * 0.65} height={size * 0.65}
        className="rounded object-contain" onError={() => setErr(true)} />
    </div>
  );
  return (
    <div className="rounded-xl flex items-center justify-center font-black text-white text-sm"
      style={{ width: size, height: size, background: accent }}>
      {id[0].toUpperCase()}
    </div>
  );
}

// ── Guide modal ───────────────────────────────────────────────────────────────
function GuideModal({ exchange, onClose }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      style={{ backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }} transition={{ type: 'spring', damping: 22, stiffness: 320 }}
        className="relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--bg-secondary)', border: `1px solid ${exchange.accent}30` }}
        onClick={e => e.stopPropagation()}>
        {/* Glow top */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-20 pointer-events-none"
          style={{ background: `radial-gradient(ellipse, ${exchange.glow} 0%, transparent 70%)` }} />
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 relative">
          {/* Logo + title on RIGHT (first in DOM = right in RTL) */}
          <div className="flex items-center gap-3">
            <ExLogo id={exchange.id} size={36} accent={exchange.accent} />
            <div>
              <p className="text-sm font-bold text-text-primary">איך מחברים {exchange.name}?</p>
              <a href={exchange.apiUrl} target="_blank" rel="noopener noreferrer"
                className="text-[11px] flex items-center gap-1 hover:opacity-80 transition-opacity"
                style={{ color: exchange.accent }}>
                פתח דף API <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
          {/* X on LEFT (last in DOM = left in RTL) */}
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer">
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>
        {/* Steps */}
        <div className="px-4 pb-2 space-y-1">
          {exchange.steps.map((step, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className="flex items-start gap-3 rounded-xl px-3 py-2.5"
              style={{
                background: step.warn ? 'rgba(239,68,68,0.07)' : step.ok ? `${exchange.accent}12` : 'transparent',
              }}>
              <span className="text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                style={{
                  background: step.warn ? 'rgba(239,68,68,0.2)' : step.ok ? `${exchange.accent}30` : 'var(--bg-tertiary)',
                  color: step.warn ? '#ef4444' : step.ok ? exchange.accent : 'var(--text-muted)',
                }}>
                {step.n}
              </span>
              <p className="text-[12px] leading-snug text-right flex-1"
                style={{ color: step.warn ? '#ef4444' : step.ok ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {step.text}
              </p>
            </motion.div>
          ))}
        </div>
        <div className="px-5 py-4 flex items-center justify-center gap-2 text-[11px] text-text-muted border-t border-white/5 mt-2">
          <Shield className="w-3.5 h-3.5 text-profit" />
          Read-Only בלבד · לא ניתן לבצע פעולות מסחר
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Sync modal ────────────────────────────────────────────────────────────────
function fmtPnl(v) {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)}`;
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function fmtPrice(p) {
  if (!p) return '—';
  if (p >= 1000) return `$${p.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  return `$${p.toFixed(4)}`;
}

function SyncModal({ exchange, trades, onClose, onImport, existingExternalIds = new Set() }) {
  const [selected, setSelected] = useState(() => new Set(trades.map((_, i) => i)));
  const [importing, setImporting] = useState(false);
  const toggle = i => setSelected(p => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const toggleAll = () => setSelected(selected.size === trades.length ? new Set() : new Set(trades.map((_, i) => i)));
  const handleImport = async () => { setImporting(true); try { await onImport(trades.filter((_, i) => selected.has(i))); } finally { setImporting(false); } };
  const totalPnl = trades.filter((t, i) => selected.has(i) && t.pnlFromExchange != null).reduce((s, t) => s + (t.pnlFromExchange || 0), 0);
  const wins = trades.filter((t, i) => selected.has(i) && t.pnlFromExchange != null && t.pnlFromExchange >= 0).length;
  const losses = trades.filter((t, i) => selected.has(i) && t.pnlFromExchange != null && t.pnlFromExchange < 0).length;
  const allSelected = selected.size === trades.length;
  const updatesCount = trades.filter((t, i) => selected.has(i) && existingExternalIds.has(t.externalId)).length;
  const newCount = selected.size - updatesCount;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pb-[calc(env(safe-area-inset-bottom,0px)+84px)] sm:!pb-4"
      style={{ backdropFilter: 'blur(8px)' }}
      onClick={onClose}>
      <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className="rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[80vh] sm:max-h-[85vh] flex flex-col shadow-2xl"
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid rgba(0,191,255,0.22)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset',
        }}
        onClick={e => e.stopPropagation()}>
        {/* Header — single row, RTL: title+stats on right, X+toggle on left */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-primary">
          {/* First in DOM → RIGHT in RTL: title + stats */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-text-primary">עסקאות מ-{exchange}</p>
              <p className="text-xs text-text-muted">{trades.length} נמצאו — בחר מה לייבא</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0" dir="ltr">
              <span className="text-xs text-text-muted">{selected.size}/{trades.length}</span>
              <span className="text-xs font-semibold text-profit">{wins}W</span>
              <span className="text-xs font-semibold text-loss">{losses}L</span>
              <span className={`text-sm font-bold font-mono ${totalPnl >= 0 ? 'text-profit' : 'text-loss'}`}>{fmtPnl(totalPnl)}</span>
            </div>
          </div>
          {/* Last in DOM → LEFT in RTL: toggle + X */}
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={toggleAll} className="text-xs text-accent-primary hover:underline cursor-pointer whitespace-nowrap">
              {allSelected ? 'בטל הכל' : 'בחר הכל'}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-tertiary cursor-pointer">
              <X className="w-4 h-4 text-text-muted" />
            </button>
          </div>
        </div>
        {/* Trade list */}
        <div className="overflow-y-auto flex-1 divide-y divide-border-primary/30">
          {trades.map((trade, i) => {
            const sel = selected.has(i);
            const win = trade.pnlFromExchange >= 0;
            const isExisting = existingExternalIds.has(trade.externalId);
            return (
              <button key={i} onClick={() => toggle(i)}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-bg-tertiary transition-colors cursor-pointer text-right ${!sel ? 'opacity-35' : ''}`}>
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${sel ? 'bg-accent-primary border-accent-primary' : 'border-border-primary'}`}>
                  {sel && <Check className="w-2.5 h-2.5 text-bg-primary" strokeWidth={3} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-bold font-mono ${win ? 'text-profit' : 'text-loss'}`} dir="ltr">{fmtPnl(trade.pnlFromExchange)}</span>
                    <div className="flex items-center gap-1.5">
                      {isExisting && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-accent-primary/15 text-accent-primary border border-accent-primary/30">עדכון</span>
                      )}
                      {trade._isOpen && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-profit/15 text-profit border border-profit/30">פתוח</span>
                      )}
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${trade.direction === 'long' ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'}`}>
                        {trade.direction === 'long' ? 'Long ↗' : 'Short ↘'}
                      </span>
                      <span className="text-sm font-bold text-text-primary">{trade.pair}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <div className="flex items-center gap-1.5" dir="ltr">
                      {trade.leverage > 1 && (
                        <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-bg-tertiary text-text-muted border border-border-primary">{trade.leverage}x</span>
                      )}
                      <span className="text-[10px] text-text-muted font-mono">
                        {trade._isOpen ? fmtPrice(trade.entryPrice) : `${fmtPrice(trade.entryPrice)} → ${fmtPrice(trade.exitPrice)}`}
                      </span>
                    </div>
                    <span className="text-[10px] text-text-muted">{fmtDate(trade.entryDate)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-border-primary">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-border-primary text-sm text-text-secondary hover:bg-bg-tertiary transition-colors cursor-pointer">ביטול</button>
          <button onClick={handleImport} disabled={selected.size === 0 || importing}
            className="flex-1 py-2.5 rounded-xl bg-accent-primary text-bg-primary text-sm font-bold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-40 flex items-center justify-center gap-2">
            {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : (
              <><Download className="w-4 h-4" />
              {updatesCount > 0 && newCount === 0 ? `עדכן ${updatesCount} עסקאות` :
               updatesCount > 0 ? `ייבא ${newCount} + עדכן ${updatesCount}` :
               `ייבא ${selected.size} עסקאות`}
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Exchange card ─────────────────────────────────────────────────────────────
function ExchangeCard({ exchange, data, savedData, syncing, saving, onUpdate, onSave, onDisconnect, onSync, index }) {
  const [showSecret, setShowSecret] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const [editing, setEditing] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [balance, setBalance] = useState(null);
  const { id, name, tagline, accent, glow, canSync, extraField } = exchange;

  const isConnected = !!(savedData?.apiKey && savedData?.apiSecret);
  const hasChanges = (data?.apiKey || '') !== (savedData?.apiKey || '') ||
    (data?.apiSecret || '') !== (savedData?.apiSecret || '') ||
    (extraField ? (data?.[extraField.key] || '') !== (savedData?.[extraField.key] || '') : false);

  // Pull the futures wallet balance once the exchange is connected, so the
  // card shows "Bybit: $1,234" without asking the user to type a starting value.
  useEffect(() => {
    if (!isConnected || !canSync) { setBalance(null); return; }
    let cancelled = false;
    setBalance(null);
    fetchExchangeBalance(id, savedData.apiKey, savedData.apiSecret, extraField ? savedData[extraField.key] : undefined)
      .then((res) => { if (!cancelled) setBalance(res.balance); })
      .catch(() => { if (!cancelled) setBalance(false); }); // false = failed; row hidden
    return () => { cancelled = true; };
  }, [isConnected, canSync, id, savedData?.apiKey, savedData?.apiSecret, extraField, savedData]);

  const startEdit = () => {
    onUpdate('apiKey', savedData?.apiKey || '');
    onUpdate('apiSecret', savedData?.apiSecret || '');
    if (extraField) onUpdate(extraField.key, savedData?.[extraField.key] || '');
    setEditing(true);
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1, type: 'spring', damping: 22, stiffness: 260 }}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: 'var(--bg-secondary)',
          border: `1px solid ${isConnected ? `${accent}45` : 'var(--border-primary)'}`,
          transition: 'border-color 0.3s, box-shadow 0.3s',
          boxShadow: hovered || isConnected ? `0 0 30px -8px ${glow}` : 'none',
        }}>

        {/* Ambient glow when connected */}
        <AnimatePresence>
          {isConnected && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 pointer-events-none"
              style={{ background: `radial-gradient(ellipse at 50% 0%, ${accent}12 0%, transparent 65%)` }} />
          )}
        </AnimatePresence>

        {/* Top bar */}
        <motion.div className="h-0.5 w-full"
          animate={{ background: isConnected ? `linear-gradient(90deg, transparent, ${accent}, transparent)` : 'transparent' }}
          transition={{ duration: 0.5 }} />

        {/* Header */}
        <div className="px-5 pt-4 pb-3 flex items-center gap-3 relative">
          <motion.div whileHover={{ scale: 1.08 }} transition={{ type: 'spring', stiffness: 400 }}>
            <ExLogo id={id} size={44} accent={accent} />
          </motion.div>
          <div className="flex-1 min-w-0 text-right">
            <div className="flex items-center justify-end gap-2">
              <AnimatePresence>
                {isConnected && !editing && (
                  <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: `${accent}20`, color: accent, border: `1px solid ${accent}40` }}>
                    <motion.span animate={{ scale: [1, 1.3, 1] }} transition={{ repeat: Infinity, duration: 2 }}
                      className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: accent }} />
                    מחובר
                  </motion.span>
                )}
              </AnimatePresence>
              <span className="text-base font-bold text-text-primary">{name}</span>
            </div>
            <p className="text-[11px] text-text-muted text-left" dir="ltr">{tagline}</p>
            {isConnected && !editing && typeof balance === 'number' && (
              <p className="text-[11px] font-bold text-left mt-0.5" dir="ltr" style={{ color: accent }}>
                ${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            )}
          </div>
          <motion.button onClick={() => setGuideOpen(true)} whileHover={{ scale: 1.15, rotate: 15 }}
            whileTap={{ scale: 0.9 }} transition={{ type: 'spring', stiffness: 400 }}
            className="p-1.5 rounded-lg hover:bg-bg-tertiary transition-colors cursor-pointer shrink-0">
            <HelpCircle className="w-4 h-4 text-text-muted" />
          </motion.button>
        </div>

        <div className="h-px mx-5" style={{ background: `linear-gradient(90deg, transparent, ${accent}25, transparent)` }} />

        {/* Body */}
        <div className="px-5 py-4 space-y-3 relative">
          {isConnected && !editing ? (
            /* Connected view — masked */
            <div className="space-y-2">
              {[
              { label: 'API Key', val: maskKey(savedData?.apiKey) },
              { label: 'API Secret', val: '••••••••••••••••••••' },
              ...(extraField ? [{ label: extraField.label, val: maskKey(savedData?.[extraField.key]) }] : []),
            ].map(({ label, val }) => (
                <div key={label} className="flex items-center gap-2 px-3 py-2.5 rounded-xl transition-colors" dir="ltr"
                  style={{ background: `${accent}08`, border: `1px solid ${accent}20` }}>
                  <div className="flex-1">
                    <p className="text-[10px] mb-0.5" style={{ color: accent }}>{label}</p>
                    <p className="text-xs font-mono text-text-primary tracking-wider">{val}</p>
                  </div>
                  <motion.button onClick={startEdit} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                    className="text-text-muted hover:text-text-primary transition-colors cursor-pointer shrink-0">
                    <Pencil className="w-3.5 h-3.5" />
                  </motion.button>
                </div>
              ))}
            </div>
          ) : (
            /* Input fields */
            <div className="space-y-2">
              {editing && <p className="text-[11px] text-text-muted text-right">עדכן את המפתחות</p>}
              <input value={data?.apiKey || ''} onChange={e => onUpdate('apiKey', e.target.value)}
                className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-3 py-2.5 text-sm text-text-primary outline-none transition-all placeholder-text-muted font-mono"
                style={{ '--tw-ring-color': accent }}
                onFocus={e => { e.target.style.borderColor = accent; e.target.style.boxShadow = `0 0 0 2px ${accent}25`; }}
                onBlur={e => { e.target.style.borderColor = ''; e.target.style.boxShadow = ''; }}
                placeholder="API Key" dir="ltr" />
              <div className="relative">
                <input type={showSecret ? 'text' : 'password'} value={data?.apiSecret || ''}
                  onChange={e => onUpdate('apiSecret', e.target.value)}
                  className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-3 py-2.5 pr-10 text-sm text-text-primary outline-none transition-all placeholder-text-muted font-mono"
                  onFocus={e => { e.target.style.borderColor = accent; e.target.style.boxShadow = `0 0 0 2px ${accent}25`; }}
                  onBlur={e => { e.target.style.borderColor = ''; e.target.style.boxShadow = ''; }}
                  placeholder="API Secret" dir="ltr" />
                <button type="button" onClick={() => setShowSecret(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer transition-colors">
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {extraField && (
                <div className="relative">
                  <input type={showExtra ? 'text' : 'password'} value={data?.[extraField.key] || ''}
                    onChange={e => onUpdate(extraField.key, e.target.value)}
                    className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-3 py-2.5 pr-10 text-sm text-text-primary outline-none transition-all placeholder-text-muted font-mono"
                    onFocus={e => { e.target.style.borderColor = accent; e.target.style.boxShadow = `0 0 0 2px ${accent}25`; }}
                    onBlur={e => { e.target.style.borderColor = ''; e.target.style.boxShadow = ''; }}
                    placeholder={extraField.placeholder || extraField.label} dir="ltr" />
                  <button type="button" onClick={() => setShowExtra(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer transition-colors">
                    {showExtra ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              )}
              <div className="flex items-center justify-end gap-1.5 text-[10px] text-text-muted">
                <Shield className="w-3 h-3 text-profit" />Read-Only · מוגן בהרשאות Firebase
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            {isConnected && !editing && !hasChanges ? (
              <>
                <motion.button onClick={onDisconnect} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  className="px-3 py-2.5 rounded-xl border border-border-primary text-xs text-text-muted hover:border-loss hover:text-loss transition-colors cursor-pointer">
                  נתק
                </motion.button>
                {canSync ? (
                  <button onClick={onSync} disabled={syncing}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                    style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}40` }}>
                    {syncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : (
                      <>
                        <Zap className="w-4 h-4" />
                        סנכרן עסקאות
                      </>
                    )}
                  </button>
                ) : (
                  <div className="flex-1 py-2.5 rounded-xl text-xs text-center text-text-muted border border-dashed border-border-primary flex items-center justify-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" />ייבוא CSV בלבד
                  </div>
                )}
              </>
            ) : editing && !hasChanges ? (
              <motion.button onClick={() => setEditing(false)} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                className="flex-1 py-2.5 rounded-xl border border-border-primary text-sm text-text-muted hover:bg-bg-tertiary transition-colors cursor-pointer">
                ביטול
              </motion.button>
            ) : hasChanges ? (
              <>
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => { setEditing(false); onUpdate('apiKey', savedData?.apiKey || ''); onUpdate('apiSecret', savedData?.apiSecret || ''); }}
                  className="px-3 py-2.5 rounded-xl border border-border-primary text-xs text-text-muted hover:bg-bg-tertiary transition-colors cursor-pointer">
                  ביטול
                </motion.button>
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={async () => { await onSave(); setEditing(false); }} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, color: '#000', boxShadow: `0 4px 20px ${glow}` }}>
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'שמור מפתחות'}
                </motion.button>
              </>
            ) : (
              <div className="flex-1 py-2.5 rounded-xl text-xs text-center text-text-muted border border-dashed border-border-primary flex items-center justify-center gap-1.5">
                <Link2 className="w-3.5 h-3.5" />הזן API Key ו-Secret לחיבור
              </div>
            )}
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {guideOpen && <GuideModal exchange={exchange} onClose={() => setGuideOpen(false)} />}
      </AnimatePresence>
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ExchangeSettings({ journalId: propJournalId, onImportTrade, existingExternalIds = new Set() } = {}) {
  const { user } = useAuth();
  const { activeJournalId: contextJournalId } = useJournalContext();
  const activeJournalId = propJournalId ?? contextJournalId;
  const [exchanges, setExchanges] = useState({});
  const [savedExchanges, setSavedExchanges] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [syncing, setSyncing] = useState(null);
  const [syncModal, setSyncModal] = useState(null);

  useEffect(() => {
    if (!user) return;
    getUserSetting(user.uid, 'exchanges').then(data => {
      if (data) { setExchanges(data); setSavedExchanges(data); }
      setLoading(false);
    });
  }, [user]);

  const updateField = (id, field, value) =>
    setExchanges(p => ({ ...p, [id]: { ...p[id], [field]: value } }));

  const handleSave = async (id) => {
    setSaving(id);
    try {
      await setUserSetting(user.uid, 'exchanges', exchanges, true);
      setSavedExchanges({ ...exchanges });
      toast.success('המפתחות נשמרו ✓');
    } catch { toast.error('שגיאה בשמירה'); } finally { setSaving(null); }
  };

  const handleDisconnect = async (id) => {
    const updated = { ...exchanges, [id]: { apiKey: '', apiSecret: '' } };
    setExchanges(updated);
    try {
      await setUserSetting(user.uid, 'exchanges', updated, true);
      setSavedExchanges({ ...updated });
      toast.success('הבורסה נותקה');
    } catch { toast.error('שגיאה בניתוק'); }
  };

  const handleSync = async (id) => {
    const saved = savedExchanges[id] || {};
    const exchConf = EXCHANGES.find(e => e.id === id);
    const extraKey = exchConf?.extraField?.key;
    setSyncing(id);
    try {
      const [tradesResult, openResult] = await Promise.allSettled([
        syncExchangeTrades(id, saved.apiKey, saved.apiSecret, extraKey ? saved[extraKey] : undefined),
        syncOpenPositions(id, saved.apiKey, saved.apiSecret),
      ]);
      const closedTrades = tradesResult.status === 'fulfilled' ? tradesResult.value : [];
      const openPos = openResult.status === 'fulfilled' ? openResult.value : [];
      const taggedOpen = openPos.map(p => ({ ...p, _isOpen: true, pnlFromExchange: null }));
      const merged = [...taggedOpen, ...closedTrades];
      if (!merged.length) { toast('לא נמצאו עסקאות', { icon: 'ℹ️' }); return; }
      setSyncModal({ exchange: exchConf?.name || id, trades: merged });
    } catch (err) { toast.error(`שגיאת סנכרון: ${err.message}`); } finally { setSyncing(null); }
  };

  const handleImport = async (trades) => {
    if (!activeJournalId) {
      toast.error('בחר יומן לפני הייבוא');
      return;
    }
    const results = await Promise.allSettled(
      trades.map(t => {
        if (onImportTrade) return onImportTrade(t);
        if (t._isOpen) {
          const { _isOpen, pnlFromExchange, ...pos } = t;
          return addToUserCollection(user.uid, 'trades', {
            ...pos,
            entryDate: Timestamp.fromDate(new Date(pos.entryDate)),
            importedAt: Timestamp.now(),
            journalId: activeJournalId || null,
          });
        }
        const pnl = t.pnlFromExchange || 0;
        // Preserve every field the worker provided (stopLoss, tps, fees,
        // exitDate, pnlFromExchange, …) instead of hand-picking a few — that
        // dropped SL/TP whenever the upstream endpoint did include them.
        const { _isOpen: _o, entryDate, exitDate, ...rest } = t;
        return addToUserCollection(user.uid, 'trades', {
          ...rest,
          status: 'closed',
          orderType: 'market',
          entryDate: Timestamp.fromDate(new Date(entryDate)),
          ...(exitDate ? { exitDate: Timestamp.fromDate(new Date(exitDate)) } : {}),
          pnl,
          pnlPercent: t.entryPrice > 0 && t.quantity > 0 ? (pnl / (t.entryPrice * t.quantity)) * 100 : 0,
          result: pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'breakeven',
          importedAt: Timestamp.now(),
          journalId: activeJournalId || null,
        });
      })
    );
    const imported = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected');
    setSyncModal(null);
    if (failed.length > 0) {
      const firstErr = failed[0]?.reason?.message || 'שגיאה לא ידועה';
      if (imported > 0) toast.success(`יובאו ${imported} עסקאות ✓`);
      toast.error(`נכשלו ${failed.length}: ${firstErr}`);
    } else {
      toast.success(`🎉 יובאו ${imported} עסקאות בהצלחה!`);
    }
  };

  if (loading) return <LoadingSpinner />;

  const connectedCount = EXCHANGES.filter(e => savedExchanges[e.id]?.apiKey && savedExchanges[e.id]?.apiSecret).length;

  return (
    <>
      <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}
        className="relative">

        {/* Ambient background orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: -1 }}>
          <FloatingOrb color="rgba(247,166,0,0.12)" style={{ width: 300, height: 300, top: -80, right: -60 }} />
          <FloatingOrb color="rgba(43,120,255,0.1)" style={{ width: 250, height: 250, bottom: 0, left: -40 }} />
          <FloatingOrb color="rgba(99,102,241,0.08)" style={{ width: 200, height: 200, top: '40%', left: '50%' }} />
        </div>

        {/* Page header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 text-right">
          <h1 className="text-2xl font-bold text-text-primary">חיבור בורסה</h1>
          <div className="flex items-center justify-start gap-3 mt-1">
            <p className="text-sm text-text-muted">חבר את הבורסה שלך וייבא עסקאות ישירות ליומן</p>
            {connectedCount > 0 && (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.3 }}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-profit/10 text-profit border border-profit/20">
                {connectedCount} מחובר{connectedCount > 1 ? 'ות' : 'ת'}
              </motion.span>
            )}
          </div>
        </motion.div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {EXCHANGES.map((exchange, i) => (
            <ExchangeCard key={exchange.id} exchange={exchange} index={i}
              data={exchanges[exchange.id]} savedData={savedExchanges[exchange.id]}
              syncing={syncing === exchange.id} saving={saving === exchange.id}
              onUpdate={(field, val) => updateField(exchange.id, field, val)}
              onSave={() => handleSave(exchange.id)}
              onDisconnect={() => handleDisconnect(exchange.id)}
              onSync={() => handleSync(exchange.id)} />
          ))}
        </div>

        {/* Security footer */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
          className="mt-6 flex items-center justify-center gap-2 text-[11px] text-text-muted">
          <Shield className="w-3.5 h-3.5 text-profit" />
          המפתחות מוצפנים ומשמשים לקריאה בלבד — TradeOS לא יכול לבצע פעולות מסחר
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {syncModal && (
          <SyncModal exchange={syncModal.exchange} trades={syncModal.trades}
            onClose={() => setSyncModal(null)} onImport={handleImport}
            existingExternalIds={existingExternalIds} />
        )}
      </AnimatePresence>
    </>
  );
}
