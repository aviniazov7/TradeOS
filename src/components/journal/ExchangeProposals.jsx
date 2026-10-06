import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, RefreshCw, X, Sparkles, ChevronLeft, CheckCircle2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { EXCHANGES } from '../exchange/exchangeConfig';
import { SyncModal } from '../exchange/SyncModal';
import { getExchangeLogo } from '../../utils/constants';
import { useExchangeProposals } from '../../hooks/useExchangeProposals';
import { tradeExternalIds } from '../../utils/tradeIds';

// A stable dedup key: closed trades key off the exchange's externalId; open
// positions (whose externalId can change between syncs) key off pair+direction
// so an already-tracked open position isn't proposed again on every sync.
function keyOf(t) {
  if (!t) return '';
  if (t._isOpen || t.status === 'open') return `open|${(t.pair || '').toUpperCase()}|${t.direction}`;
  return t.externalId || '';
}

// Small exchange logo with a graceful fallback to the accent-colored initial.
function ExLogo({ id, name, accent, size = 40 }) {
  const [err, setErr] = useState(false);
  const url = getExchangeLogo(id);
  if (!err && url) {
    return (
      <div className="rounded-xl overflow-hidden flex items-center justify-center shrink-0"
        style={{ width: size, height: size, background: `${accent}22`, border: `1px solid ${accent}40` }}>
        <img src={url} alt={name} width={size * 0.62} height={size * 0.62}
          className="rounded object-contain" onError={() => setErr(true)} />
      </div>
    );
  }
  return (
    <div className="rounded-xl flex items-center justify-center font-black text-white text-sm shrink-0"
      style={{ width: size, height: size, background: accent }}>
      {(name || id || '?').slice(0, 2).toUpperCase()}
    </div>
  );
}

// Trades-tab banner that proactively proposes new exchange trades for import,
// so the user no longer has to open the exchange tab and click sync manually.
// `trades` is the journal's current trades (used to dedup already-logged rows);
// `onImportTrade` is the single-trade import handler shared with ExchangeSettings.
export default function ExchangeProposals({ exchange, trades, onImportTrade, enabled = true }) {
  const meta = useMemo(() => EXCHANGES.find((e) => e.id === exchange), [exchange]);
  const { rows, loading, error, refresh, active, lastSyncedAt } = useExchangeProposals(exchange, { enabled });

  const [dismissedKeys, setDismissedKeys] = useState(() => new Set());
  const [collapsed, setCollapsed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTrades, setModalTrades] = useState([]);
  const [importing, setImporting] = useState(false);

  // Keys already present in the journal — open-position keys plus EVERY
  // close-order id (externalId + the merged row's externalIds array).
  const existingKeys = useMemo(() => {
    const s = new Set();
    for (const t of trades || []) {
      if (t.status === 'open') s.add(keyOf(t));
      for (const id of tradeExternalIds(t)) s.add(id);
    }
    return s;
  }, [trades]);

  const proposals = useMemo(() => {
    return (rows || []).filter((t) => {
      const k = keyOf(t);
      if (!k || dismissedKeys.has(k)) return false;
      if (t._isOpen || t.status === 'open') return !existingKeys.has(k);
      // Closed rows: only when EVERY close-order id is already journaled is
      // there nothing new. A partial overlap means the position gained closes
      // since the last import (e.g. TP1 imported Monday, stop-out Wednesday) —
      // it must be re-proposed as an update, not filtered as "already logged",
      // which silently dropped the loss and froze the trade as a win.
      const ids = tradeExternalIds(t);
      return ids.length > 0 && !ids.every((id) => existingKeys.has(id));
    });
  }, [rows, existingKeys, dismissedKeys]);

  const existingExternalIds = useMemo(() => {
    const s = new Set();
    for (const t of trades || []) for (const id of tradeExternalIds(t)) s.add(id);
    return s;
  }, [trades]);

  if (!active || !meta) return null;

  const accent = meta.accent;
  const name = meta.name;

  const handleImport = async (selected) => {
    if (!selected.length) return;
    setImporting(true);
    try {
      const results = await Promise.allSettled(selected.map((t) => onImportTrade(t)));
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - ok;
      // Optimistically hide ONLY the rows that imported successfully so the
      // banner updates instantly without waiting for the Firestore realtime
      // round-trip. Failed rows stay in the list so a refresh re-surfaces them
      // for retry instead of vanishing silently.
      setDismissedKeys((prev) => {
        const n = new Set(prev);
        results.forEach((r, i) => {
          if (r.status === 'fulfilled') { const k = keyOf(selected[i]); if (k) n.add(k); }
        });
        return n;
      });
      setModalOpen(false);
      if (ok > 0) toast.success(`🎉 נוספו ${ok} עסקאות ליומן`);
      if (failed > 0) toast.error(`נכשלו ${failed} עסקאות — נסה שוב`);
    } finally {
      setImporting(false);
    }
  };

  // Snapshot the proposals when the modal opens so SyncModal's index-based
  // selection can't misalign if the live list reindexes (a background refresh
  // or a Firestore trades update) while the user is choosing.
  const openReview = () => { setModalTrades(proposals); setModalOpen(true); };

  // ── Collapsed / nothing-to-propose states ─────────────────────────────────
  const nothingNew = !loading && !error && proposals.length === 0;

  // Fully hide once the user dismisses the banner, or (subtle) show a slim
  // "all synced" confirmation once a sync has completed with no new trades.
  if (collapsed) return null;

  return (
    <>
      <AnimatePresence mode="wait">
        {loading && proposals.length === 0 ? (
          <motion.div key="loading" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mb-3 flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-border-primary bg-bg-secondary/60 text-text-muted text-xs">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ color: accent }} />
            בודק עסקאות חדשות ב-{name}…
          </motion.div>
        ) : error && proposals.length === 0 ? (
          <motion.div key="error" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mb-3 flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border border-border-primary bg-bg-secondary/60 text-xs">
            <span className="flex items-center gap-2 text-text-muted">
              <AlertTriangle className="w-3.5 h-3.5 text-loss" />
              בדיקת העסקאות מ-{name} נכשלה
            </span>
            <button onClick={refresh} className="text-accent-primary hover:underline cursor-pointer whitespace-nowrap">
              נסה שוב
            </button>
          </motion.div>
        ) : nothingNew ? (
          lastSyncedAt ? (
            <motion.div key="synced" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="mb-3 flex items-center justify-between gap-2 px-4 py-2 rounded-xl border border-border-primary/60 bg-bg-secondary/40 text-[11px] text-text-muted">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-profit" />
                כל העסקאות מ-{name} מסונכרנות
              </span>
              <button onClick={refresh} disabled={loading}
                className="flex items-center gap-1 text-text-muted hover:text-text-primary cursor-pointer disabled:opacity-50">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                בדוק שוב
              </button>
            </motion.div>
          ) : null
        ) : (
          <motion.div key="proposals" initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="mb-3 relative rounded-xl overflow-hidden"
            style={{
              background: 'var(--color-bg-secondary)',
              border: `1px solid ${accent}45`,
              boxShadow: `0 0 24px -12px ${meta.glow || accent + '55'}`,
            }}>
            {/* Ambient accent glow */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: `radial-gradient(ellipse at 100% 0%, ${accent}12 0%, transparent 55%)` }} />

            {/* Slim single-line banner: logo + title hug the right edge (RTL
                start), actions pushed to the far left with ms-auto. */}
            <div className="relative flex items-center gap-2.5 ps-3 pe-2 py-2 text-right">
              <ExLogo id={exchange} name={name} accent={accent} size={28} />
              <p className="text-[13px] font-bold text-text-primary flex items-center gap-1.5 min-w-0">
                <Sparkles className="w-4 h-4 shrink-0" style={{ color: accent }} />
                <span className="truncate">עסקאות חדשות מ-{name}</span>
                <motion.span
                  animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 2.2 }}
                  className="text-[10px] font-black px-1.5 py-px rounded-full shrink-0"
                  style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}45` }}>
                  {proposals.length}
                </motion.span>
              </p>

              <div className="ms-auto flex items-center gap-1 shrink-0">
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                  onClick={openReview}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                  style={{ background: accent, color: '#000' }}>
                  <Zap className="w-3.5 h-3.5" />
                  סקירה והוספה
                  <ChevronLeft className="w-3.5 h-3.5 -ms-0.5" />
                </motion.button>
                <button onClick={refresh} disabled={loading} title="רענן"
                  className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary cursor-pointer transition-colors disabled:opacity-50">
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={() => setCollapsed(true)} title="הסתר"
                  className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary cursor-pointer transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {modalOpen && (
          <SyncModal
            exchange={name}
            trades={modalTrades}
            existingExternalIds={existingExternalIds}
            onClose={() => !importing && setModalOpen(false)}
            onImport={handleImport}
          />
        )}
      </AnimatePresence>
    </>
  );
}
