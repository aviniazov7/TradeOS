import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, RefreshCw, X, Sparkles, ChevronLeft, CheckCircle2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { EXCHANGES, SyncModal } from '../exchange/ExchangeSettings';
import { getExchangeLogo } from '../../utils/constants';
import { useExchangeProposals } from '../../hooks/useExchangeProposals';

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
export default function ExchangeProposals({ exchange, trades, onImportTrade }) {
  const meta = useMemo(() => EXCHANGES.find((e) => e.id === exchange), [exchange]);
  const { rows, loading, error, refresh, active, lastSyncedAt } = useExchangeProposals(exchange);

  const [dismissedKeys, setDismissedKeys] = useState(() => new Set());
  const [collapsed, setCollapsed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  // Keys already present in the journal — the row is only a proposal if it's
  // neither already logged nor locally dismissed/imported this session.
  const existingKeys = useMemo(() => {
    const s = new Set();
    for (const t of trades || []) { const k = keyOf(t); if (k) s.add(k); }
    return s;
  }, [trades]);

  const proposals = useMemo(() => {
    return (rows || []).filter((t) => {
      const k = keyOf(t);
      return k && !existingKeys.has(k) && !dismissedKeys.has(k);
    });
  }, [rows, existingKeys, dismissedKeys]);

  const existingExternalIds = useMemo(
    () => new Set((trades || []).filter((t) => t.externalId).map((t) => t.externalId)),
    [trades]
  );

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
      // Hide everything we attempted so the banner updates instantly, without
      // waiting for the Firestore realtime round-trip.
      setDismissedKeys((prev) => {
        const n = new Set(prev);
        for (const t of selected) { const k = keyOf(t); if (k) n.add(k); }
        return n;
      });
      setModalOpen(false);
      if (ok > 0) toast.success(`🎉 נוספו ${ok} עסקאות ליומן`);
      if (failed > 0) toast.error(`נכשלו ${failed} עסקאות`);
    } finally {
      setImporting(false);
    }
  };

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
          <motion.div key="proposals" initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }}
            transition={{ type: 'spring', damping: 24, stiffness: 300 }}
            className="mb-4 relative rounded-2xl overflow-hidden"
            style={{
              background: 'var(--color-bg-secondary)',
              border: `1px solid ${accent}45`,
              boxShadow: `0 0 30px -10px ${meta.glow || accent + '55'}`,
            }}>
            {/* Ambient accent glow */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: `radial-gradient(ellipse at 100% 0%, ${accent}14 0%, transparent 60%)` }} />

            <div className="relative flex items-center gap-3 p-4">
              {/* RIGHT (RTL first): logo + copy */}
              <ExLogo id={exchange} name={name} accent={accent} size={44} />
              <div className="flex-1 min-w-0 text-right">
                <div className="flex items-center justify-end gap-2">
                  <motion.span
                    animate={{ scale: [1, 1.12, 1] }} transition={{ repeat: Infinity, duration: 2.2 }}
                    className="text-[11px] font-black px-2 py-0.5 rounded-full"
                    style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}45` }}>
                    {proposals.length}
                  </motion.span>
                  <p className="text-sm font-bold text-text-primary flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" style={{ color: accent }} />
                    עסקאות חדשות מ-{name}
                  </p>
                </div>
                <p className="text-[11px] text-text-muted mt-0.5">
                  מוכנות להוספה ליומן — בלי ללכת לדף הסנכרון
                </p>
              </div>

              {/* LEFT (RTL last): actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }}
                  onClick={() => setModalOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold cursor-pointer transition-colors"
                  style={{ background: accent, color: '#000' }}>
                  <Zap className="w-4 h-4" />
                  סקירה והוספה
                  <ChevronLeft className="w-4 h-4 -mr-1" />
                </motion.button>
                <button onClick={refresh} disabled={loading} title="רענן"
                  className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary cursor-pointer transition-colors disabled:opacity-50">
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={() => setCollapsed(true)} title="הסתר"
                  className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary cursor-pointer transition-colors">
                  <X className="w-4 h-4" />
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
            trades={proposals}
            existingExternalIds={existingExternalIds}
            onClose={() => !importing && setModalOpen(false)}
            onImport={handleImport}
          />
        )}
      </AnimatePresence>
    </>
  );
}
