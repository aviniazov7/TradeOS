import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { Shield, Eye, EyeOff, Check, ExternalLink, RefreshCw, Download, X, Zap, HelpCircle, Pencil, Link2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { getUserSetting, setUserSetting } from '../../services/firestoreService';
import { syncExchangeTrades, syncOpenPositions, fetchExchangeBalance, storeExchangeCredentials, deleteExchangeCredentials, getConnectedExchanges } from '../../services/exchangeService';
import { useAuth } from '../../contexts/AuthContext';
import { useJournalContext } from '../../contexts/JournalContext';
import { useExchangeImport } from '../../hooks/useExchangeImport';
import { tradeExternalIds } from '../../utils/tradeIds';
import { pageVariants, pageTransition } from '../../utils/animations';
import LoadingSpinner from '../shared/LoadingSpinner';
import SelectDropdown from '../shared/SelectDropdown';

// Import-window options for the exchange sync (value in days; '0' = last 50).
const SYNC_PERIODS = [
  { value: '0', label: '50 אחרונות' },
  { value: '30', label: 'חודש אחרון' },
  { value: '90', label: '3 חודשים' },
  { value: '180', label: '6 חודשים' },
  { value: '365', label: 'שנה' },
];
import { getExchangeLogo, FREE_LIMITS } from '../../utils/constants';
import { useNavigate } from 'react-router-dom';

// ── Exchange config ───────────────────────────────────────────────────────────
// Exported so the trades-tab proposal banner (ExchangeProposals) can reuse the
// per-exchange display name / accent / canSync flag without duplicating them.
export const EXCHANGES = [
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
    extraField: { key: 'passphrase', label: 'Passphrase', placeholder: 'OKX Passphrase', required: true },
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
    extraField: { key: 'passphrase', label: 'Passphrase', placeholder: 'Bitget Passphrase', required: true },
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
        style={{ background: 'var(--color-bg-secondary)', border: `1px solid ${exchange.accent}30` }}
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
                  background: step.warn ? 'rgba(239,68,68,0.2)' : step.ok ? `${exchange.accent}30` : 'var(--color-bg-tertiary)',
                  color: step.warn ? '#ef4444' : step.ok ? exchange.accent : 'var(--color-text-muted)',
                }}>
                {step.n}
              </span>
              <p className="text-[12px] leading-snug text-right flex-1"
                style={{ color: step.warn ? '#ef4444' : step.ok ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
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

export function SyncModal({ exchange, trades, onClose, onImport, existingExternalIds = new Set(), matchExisting = null, stale = [], onRemoveStale = null }) {
  const [selected, setSelected] = useState(() => new Set(trades.map((_, i) => i)));
  const [staleRows, setStaleRows] = useState(stale);
  const [removing, setRemoving] = useState(false);
  const [importing, setImporting] = useState(false);
  const toggle = i => setSelected(p => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const toggleAll = () => setSelected(selected.size === trades.length ? new Set() : new Set(trades.map((_, i) => i)));
  const handleImport = async () => { setImporting(true); try { await onImport(trades.filter((_, i) => selected.has(i))); } finally { setImporting(false); } };
  // pnlFromExchange is GROSS (before fees); the imported journal row stores
  // net = gross - fees. Show the SAME net here so the preview matches both the
  // exchange's own P&L card and the row that will land in the journal.
  const netPnlOf = (t) => (typeof t.pnlFromExchange === 'number' ? t.pnlFromExchange - (t.fees || 0) : null);
  const totalPnl = trades.filter((t, i) => selected.has(i) && t.pnlFromExchange != null).reduce((s, t) => s + (netPnlOf(t) || 0), 0);
  const wins = trades.filter((t, i) => selected.has(i) && t.pnlFromExchange != null && netPnlOf(t) >= 0).length;
  const losses = trades.filter((t, i) => selected.has(i) && t.pnlFromExchange != null && netPnlOf(t) < 0).length;
  const allSelected = selected.size === trades.length;
  // A row is an UPDATE when ANY of its close-order ids is already journaled —
  // a Multi-TP row carries every close's id in externalIds, and only its
  // first-close externalId matches the previously imported document.
  // `matchExisting` also catches rows that reconcile to an open position by
  // identity (their ids can never overlap); the id set alone showed those as
  // new right up until the import turned them into an update.
  // Resolved ONCE per row rather than per render: matchExisting walks the whole
  // journal, and this is read twice for every row (the count and the badge), so
  // recomputing it on each checkbox toggle rescanned every trade.
  const updateFlags = useMemo(
    () => trades.map((t) => (matchExisting
      ? !!matchExisting(t)
      : tradeExternalIds(t).some((id) => existingExternalIds.has(id)))),
    [trades, matchExisting, existingExternalIds]
  );
  const updatesCount = trades.filter((_, i) => selected.has(i) && updateFlags[i]).length;
  const newCount = selected.size - updatesCount;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pb-[calc(env(safe-area-inset-bottom,0px)+84px)] sm:!pb-4"
      style={{ backdropFilter: 'blur(8px)' }}
      onClick={onClose}>
      <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className="rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[80dvh] sm:max-h-[85dvh] flex flex-col shadow-2xl"
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--glass-border)',
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
        {/* Journal rows this exchange no longer reports as open. They are the
            residue of an old import bug (the close landed as its own trade),
            so removing them is a repair — the closed trade itself is untouched. */}
        {staleRows.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-loss/10 border-b border-loss/25">
            <AlertTriangle className="w-4 h-4 text-loss shrink-0" />
            <p className="text-xs text-text-secondary flex-1 min-w-0">
              {staleRows.length} פוזיציות פתוחות ביומן כבר לא פתוחות ב{exchange}
            </p>
            <button
              onClick={async () => {
                setRemoving(true);
                try {
                  const n = await onRemoveStale?.(staleRows.map((t) => t.id));
                  setStaleRows([]);
                  if (n) toast.success(`הוסרו ${n} שורות תקועות`);
                } finally { setRemoving(false); }
              }}
              disabled={removing || !onRemoveStale}
              className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-loss/15 text-loss hover:bg-loss/25 transition-colors cursor-pointer disabled:opacity-40 shrink-0"
            >
              {removing ? 'מסיר…' : 'הסר'}
            </button>
          </div>
        )}

        {/* Trade list */}
        <div className="overflow-y-auto flex-1 divide-y divide-border-primary/30">
          {trades.map((trade, i) => {
            const sel = selected.has(i);
            // null/undefined PnL (open positions) must not satisfy >= 0 and
            // render green — show neutral until the exchange reports a number.
            let pnlClass = 'text-text-muted';
            const netVal = netPnlOf(trade);
            if (netVal !== null) {
              pnlClass = netVal >= 0 ? 'text-profit' : 'text-loss';
            }
            const isExisting = updateFlags[i];
            return (
              <button key={i} onClick={() => toggle(i)}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-bg-tertiary transition-colors cursor-pointer text-right ${!sel ? 'opacity-35' : ''}`}>
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${sel ? 'bg-accent-primary border-accent-primary' : 'border-border-primary'}`}>
                  {sel && <Check className="w-2.5 h-2.5 text-bg-primary" strokeWidth={3} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-bold font-mono ${pnlClass}`} dir="ltr">{fmtPnl(netVal)}</span>
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
  const [syncDays, setSyncDays] = useState('0'); // '0' = last 50; else import window in days
  const { id, name, tagline, accent, glow, canSync, extraField } = exchange;

  // "Connected" is now a non-secret marker — the secret itself lives encrypted
  // server-side and is never held in the browser.
  const isConnected = !!savedData?.connected;
  // Saving requires both fields freshly entered (we can't prefill the secret),
  // plus the extra field (OKX/Bitget passphrase) when the exchange requires it.
  const hasChanges = (data?.apiKey || '').length > 0 && (data?.apiSecret || '').length > 0
    && (!extraField?.required || (data?.[extraField.key] || '').trim().length > 0);
  // Key + secret typed but the required passphrase is still empty — surface a
  // dedicated hint instead of silently hiding the save button.
  const missingExtra = !!extraField?.required
    && (data?.apiKey || '').length > 0 && (data?.apiSecret || '').length > 0
    && (data?.[extraField.key] || '').trim().length === 0;

  // Pull the futures wallet balance once the exchange is connected, so the
  // card shows "Bybit: $1,234" without asking the user to type a starting value.
  // The Worker looks up the stored credentials by uid — no secret sent.
  useEffect(() => {
    if (!isConnected || !canSync) { setBalance(null); return; }
    let cancelled = false;
    setBalance(null);
    fetchExchangeBalance(id)
      .then((res) => { if (!cancelled) setBalance(res.balance); })
      .catch(() => { if (!cancelled) setBalance(false); }); // false = failed; row hidden
    return () => { cancelled = true; };
  }, [isConnected, canSync, id]);

  const startEdit = () => {
    // The secret is not held client-side, so editing starts from empty inputs.
    onUpdate('apiKey', '');
    onUpdate('apiSecret', '');
    if (extraField) onUpdate(extraField.key, '');
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
          background: 'var(--color-bg-secondary)',
          border: `1px solid ${isConnected ? `${accent}45` : 'var(--color-border-primary)'}`,
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
            {/* One compact row: balance · badge · name (no separate balance
                line stacked below). */}
            <div className="flex items-center justify-end gap-2">
              {isConnected && !editing && typeof balance === 'number' && (
                <span className="text-[11px] font-bold shrink-0" dir="ltr" style={{ color: accent }}>
                  ${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
              <AnimatePresence>
                {isConnected && !editing && (
                  <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                    style={{ background: `${accent}20`, color: accent, border: `1px solid ${accent}40` }}>
                    <motion.span animate={{ scale: [1, 1.3, 1] }} transition={{ repeat: Infinity, duration: 2 }}
                      className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: accent }} />
                    מחובר
                  </motion.span>
                )}
              </AnimatePresence>
              <span className="text-base font-bold text-text-primary truncate">{name}</span>
            </div>
            <p className="text-[11px] text-text-muted text-left" dir="ltr">{tagline}</p>
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
              { label: 'API Key', val: '••••••••••••••••••••' },
              { label: 'API Secret', val: '••••••••••••••••••••' },
              ...(extraField ? [{ label: extraField.label, val: '••••••••••••' }] : []),
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
                <Shield className="w-3 h-3 text-profit" />מומלץ: מפתח לקריאה בלבד (ללא מסחר/משיכה)
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            {isConnected && !editing && !hasChanges ? (
              // Single action row: disconnect · import-period dropdown · sync.
              // The period selector sits inline (h-full matches the buttons)
              // instead of occupying its own labeled row.
              <div className="w-full flex items-stretch gap-2">
                <motion.button onClick={onDisconnect} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  className="px-3 py-2.5 rounded-xl border border-border-primary text-xs text-text-muted hover:border-loss hover:text-loss transition-colors cursor-pointer">
                  נתק
                </motion.button>
                {canSync ? (
                  <>
                    <SelectDropdown compact value={syncDays} onChange={setSyncDays} options={SYNC_PERIODS}
                      className="w-28 shrink-0" triggerClassName="h-full rounded-xl" />
                    <button onClick={() => onSync(Number(syncDays))} disabled={syncing}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                      style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}40` }}>
                      {syncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : (
                        <>
                          <Zap className="w-4 h-4" />
                          סנכרן עסקאות
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <div className="flex-1 py-2.5 rounded-xl text-xs text-center text-text-muted border border-dashed border-border-primary flex items-center justify-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" />ייבוא CSV בלבד
                  </div>
                )}
              </div>
            ) : editing && !hasChanges ? (
              <>
                {missingExtra && (
                  <div className="flex-1 py-2.5 rounded-xl text-xs text-center text-text-muted border border-dashed border-border-primary flex items-center justify-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" />הזן {extraField.label} לחיבור {name}
                  </div>
                )}
                <motion.button onClick={() => setEditing(false)} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  className={`${missingExtra ? 'px-4' : 'flex-1'} py-2.5 rounded-xl border border-border-primary text-sm text-text-muted hover:bg-bg-tertiary transition-colors cursor-pointer`}>
                  ביטול
                </motion.button>
              </>
            ) : hasChanges ? (
              <>
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => { setEditing(false); onUpdate('apiKey', ''); onUpdate('apiSecret', ''); if (extraField) onUpdate(extraField.key, ''); }}
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
                <Link2 className="w-3.5 h-3.5" />
                {missingExtra ? `הזן ${extraField.label} לחיבור ${name}` : 'הזן API Key ו-Secret לחיבור'}
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
export default function ExchangeSettings({ journalId: propJournalId } = {}) {
  const { user, isPremium } = useAuth();
  const navigate = useNavigate();
  const { activeJournalId: contextJournalId } = useJournalContext();
  const activeJournalId = propJournalId ?? contextJournalId;
  // Shared import logic (upsert on close-order-id overlap) — the standalone
  // /exchange route used to blind-add every synced row as a NEW trade, so a
  // TP1 already imported from the journal's proposal banner got counted twice.
  const { importTrades, existingExternalIds, matchExisting, staleOpenTrades, removeTrades } = useExchangeImport(activeJournalId);
  const [exchanges, setExchanges] = useState({});
  const [savedExchanges, setSavedExchanges] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [syncing, setSyncing] = useState(null);
  const [syncModal, setSyncModal] = useState(null);

  // Load connected exchanges. Credentials live encrypted server-side, so the
  // browser only learns WHICH exchanges are connected (a non-secret marker),
  // never the keys themselves.
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [legacy, connected] = await Promise.all([
          getUserSetting(user.uid, 'exchanges').catch(() => null),
          getConnectedExchanges().catch(() => []),
        ]);
        const markers = {};
        for (const eid of connected) markers[eid] = { connected: true };

        // One-time migration of any legacy PLAINTEXT credentials still in
        // Firestore: push them to the encrypted server-side store, then strip
        // the secrets out of Firestore. Only strip if every migration succeeds
        // (e.g. the server encryption key is configured) so we never delete a
        // user's keys before they're safely re-stored.
        let hadPlaintext = false, anyFailed = false;
        if (legacy && typeof legacy === 'object') {
          for (const [eid, conf] of Object.entries(legacy)) {
            if (conf?.connected) markers[eid] = { connected: true };
            if (conf?.apiKey && conf?.apiSecret) {
              hadPlaintext = true;
              // Always re-store (idempotent) so the encrypted KV blob is written
              // even for users who were already "connected" via push — otherwise
              // their KV creds would stay plaintext while Firestore got stripped.
              try {
                const extraKey = EXCHANGES.find(e => e.id === eid)?.extraField?.key;
                await storeExchangeCredentials(eid, { apiKey: conf.apiKey, apiSecret: conf.apiSecret, passphrase: extraKey ? conf[extraKey] : undefined });
                markers[eid] = { connected: true };
              } catch { anyFailed = true; }
            }
          }
        }
        setSavedExchanges(markers);
        if (hadPlaintext && !anyFailed) {
          try { await setUserSetting(user.uid, 'exchanges', markers, false); } catch { /* ignore */ }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const updateField = (id, field, value) =>
    setExchanges(p => ({ ...p, [id]: { ...p[id], [field]: value } }));

  const handleSave = async (id) => {
    // Free tier caps how many exchanges can be connected at once.
    const alreadyConnected = !!savedExchanges[id]?.connected;
    const connectedNow = Object.values(savedExchanges).filter((e) => e?.connected).length;
    if (!isPremium && !alreadyConnected && connectedNow >= FREE_LIMITS.exchanges) {
      toast.error(`במסלול החינמי אפשר לחבר בורסה אחת. שדרג ל-Premium לחיבורים ללא הגבלה.`);
      navigate('/premium');
      return;
    }
    const conf = exchanges[id] || {};
    const exDef = EXCHANGES.find(e => e.id === id);
    const extraKey = exDef?.extraField?.key;
    // Second gate behind the button's hasChanges check: never store OKX/Bitget
    // credentials without the passphrase — every later sync would fail auth.
    if (exDef?.extraField?.required && !(conf[extraKey] || '').trim()) {
      toast.error(`חסר ${exDef.extraField.label} — חובה לחיבור ${exDef.name}`);
      return;
    }
    setSaving(id);
    try {
      // Send the secret to the encrypted server-side store exactly once.
      await storeExchangeCredentials(id, { apiKey: conf.apiKey, apiSecret: conf.apiSecret, passphrase: extraKey ? conf[extraKey] : undefined });
      // Persist only a non-secret marker; merge:false replaces the doc so no
      // plaintext key can linger.
      const newMarkers = { ...savedExchanges, [id]: { connected: true } };
      await setUserSetting(user.uid, 'exchanges', newMarkers, false);
      setSavedExchanges(newMarkers);
      // Drop the typed secret from React state immediately.
      setExchanges(p => ({ ...p, [id]: {} }));
      toast.success('המפתחות נשמרו ✓');
    } catch (e) { toast.error(e.message || 'שגיאה בשמירה'); } finally { setSaving(null); }
  };

  const handleDisconnect = async (id) => {
    const newMarkers = { ...savedExchanges };
    delete newMarkers[id];
    try {
      await deleteExchangeCredentials(id);
      await setUserSetting(user.uid, 'exchanges', newMarkers, false);
      setSavedExchanges(newMarkers);
      setExchanges(p => ({ ...p, [id]: {} }));
      toast.success('הבורסה נותקה');
    } catch { toast.error('שגיאה בניתוק'); }
  };

  const handleSync = async (id, days = 0) => {
    // One-time diagnostic: set localStorage.tradeos_sync_debug='1' to log the
    // raw upstream rows to the console (helps map missing fields like SL/TP).
    const debug = typeof localStorage !== 'undefined' && localStorage.getItem('tradeos_sync_debug') === '1';
    setSyncing(id);
    try {
      const [tradesResult, openResult] = await Promise.allSettled([
        syncExchangeTrades(id, { days, debug }),
        syncOpenPositions(id),
      ]);
      const closedTrades = tradesResult.status === 'fulfilled' ? tradesResult.value : [];
      const openPos = openResult.status === 'fulfilled' ? openResult.value : [];
      const taggedOpen = openPos.map(p => ({ ...p, _isOpen: true, pnlFromExchange: null }));
      const merged = [...taggedOpen, ...closedTrades];
      // Only a SUCCEEDED open-positions call can prove a journal row is stale;
      // a failed one returns [] and would flag every live position.
      const stale = openResult.status === 'fulfilled' ? staleOpenTrades(openPos, id) : [];
      if (!merged.length && !stale.length) { toast('לא נמצאו עסקאות', { icon: 'ℹ️' }); return; }
      setSyncModal({ exchange: EXCHANGES.find(e => e.id === id)?.name || id, trades: merged, stale });
    } catch (err) { toast.error(`שגיאת סנכרון: ${err.message}`); } finally { setSyncing(null); }
  };

  const handleImport = async (trades) => {
    if (!activeJournalId) {
      toast.error('בחר יומן לפני הייבוא');
      return;
    }
    const results = await importTrades(trades);
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

  const connectedCount = EXCHANGES.filter(e => savedExchanges[e.id]?.connected).length;

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
              onSync={(days) => handleSync(exchange.id, days)} />
          ))}
        </div>

        {/* Security footer */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
          className="mt-6 flex items-center justify-center gap-2 text-[11px] text-text-muted">
          <Shield className="w-3.5 h-3.5 text-profit" />
          המפתחות נשמרים בחשבונך האישי בלבד (מוגנים בהרשאות גישה). מומלץ ליצור מפתח API לקריאה בלבד — ללא הרשאות מסחר או משיכה.
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {syncModal && (
          <SyncModal exchange={syncModal.exchange} trades={syncModal.trades}
            onClose={() => setSyncModal(null)} onImport={handleImport}
            stale={syncModal.stale} onRemoveStale={removeTrades}
            existingExternalIds={existingExternalIds} matchExisting={matchExisting} />
        )}
      </AnimatePresence>
    </>
  );
}
