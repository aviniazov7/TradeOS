import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, ChevronDown, Search, X } from 'lucide-react';
import ScoreRing from './ScoreRing';
import { fmtUsd, fmtPct, shortWallet } from '../../utils/polymarketScore';

const PREVIEW = 3;        // rows shown while collapsed
const SEARCH_AT = 8;      // show the search box once the list gets long
const SORTS = [
  { key: 'added', label: 'לפי הוספה' },
  { key: 'score', label: 'ציון' },
  { key: 'pnl', label: 'רווח' },
  { key: 'roi', label: 'ROI' },
];

// One compact tracked row — denser than the leaderboard row so a long list
// stays scannable.
function WatchRow({ r, onOpen, onRemove }) {
  return (
    <motion.div layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
      onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="group flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-bg-secondary border border-border-primary cursor-pointer transition-colors hover:border-accent-primary/40 outline-none focus-visible:border-accent-primary/60">
      <ScoreRing score={r.smartScore} size="md" />
      {r.profileImage
        ? <img src={r.profileImage} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" loading="lazy" />
        : <div className="w-7 h-7 rounded-full bg-bg-tertiary shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold text-text-primary truncate">{r.name || shortWallet(r.wallet)}</div>
        <div className="text-[10px] text-text-muted num-mono truncate" dir="ltr">{shortWallet(r.wallet)}</div>
      </div>
      <div className="text-left shrink-0">
        <div className={`text-xs font-extrabold num-mono ${r.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>{fmtUsd(r.pnl)}</div>
        <div className="text-[10px] num-mono text-text-muted">ROI {fmtPct(r.roi)}</div>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onRemove(r); }} title="הסר מהמעקב"
        className="p-1 rounded-md text-amber-400 hover:text-loss hover:bg-bg-tertiary transition-colors cursor-pointer shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

// The tracked-wallets panel: a collapsed summary strip that expands into a
// searchable, sortable, scroll-bounded list — so 3 wallets and 50 wallets both
// look right.
export default function WatchedWallets({ rows, onOpen, onRemove }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('added');

  const totals = useMemo(() => ({
    pnl: rows.reduce((s, r) => s + (r.pnl || 0), 0),
    scored: rows.filter((r) => r.smartScore != null),
  }), [rows]);
  const avgScore = totals.scored.length
    ? Math.round(totals.scored.reduce((s, r) => s + r.smartScore, 0) / totals.scored.length)
    : null;

  const view = useMemo(() => {
    let list = rows;
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((r) => (r.name || '').toLowerCase().includes(q) || r.wallet.toLowerCase().includes(q));
    if (sort === 'added') return list;                       // Firestore order
    const val = (r) => (sort === 'score' ? (r.smartScore ?? -1) : sort === 'pnl' ? r.pnl : r.roi);
    return [...list].sort((a, b) => val(b) - val(a));
  }, [rows, query, sort]);

  if (rows.length === 0) return null;
  const shown = open ? view : view.slice(0, PREVIEW);

  return (
    <section className="mb-4 rounded-2xl border border-border-primary bg-bg-secondary/40 overflow-hidden">
      {/* Header — always a one-line summary, click to expand */}
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-right cursor-pointer hover:bg-bg-tertiary/40 transition-colors">
        <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
        <span className="text-sm font-bold text-text-primary shrink-0">הארנקים שאני עוקב</span>
        <span className="text-[11px] text-text-muted num-mono shrink-0">({rows.length})</span>
        <span className="hidden sm:flex items-center gap-2 text-[11px] num-mono text-text-muted ms-2 min-w-0">
          {avgScore != null && <span>ציון ממוצע {avgScore}</span>}
          <span className={totals.pnl >= 0 ? 'text-profit' : 'text-loss'}>· {fmtUsd(totals.pnl)} מצטבר</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-text-muted ms-auto shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Controls appear only when the list is long enough to need them */}
      {open && rows.length >= SEARCH_AT && (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
          <div className="flex items-center gap-2 bg-bg-secondary border border-border-primary rounded-lg px-2.5 py-1.5 flex-1 min-w-[140px] focus-within:border-accent-primary/50 transition-colors">
            <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חפש במעקב…"
              className="bg-transparent text-xs text-text-primary placeholder-text-muted outline-none w-full" />
          </div>
          <div className="inline-flex bg-bg-secondary border border-border-primary rounded-lg p-0.5 gap-0.5 overflow-x-auto">
            {SORTS.map((s) => (
              <button key={s.key} onClick={() => setSort(s.key)}
                className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${sort === s.key ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary'}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* List — scroll-bounded so even 50 wallets don't push the board away */}
      <div className={`px-2.5 pb-2.5 space-y-1.5 ${open ? 'max-h-[46vh] overflow-y-auto' : ''}`}>
        <AnimatePresence initial={false}>
          {shown.map((r) => <WatchRow key={r.wallet} r={r} onOpen={() => onOpen(r)} onRemove={onRemove} />)}
        </AnimatePresence>
        {open && view.length === 0 && (
          <p className="py-4 text-center text-xs text-text-muted">אין ארנק תואם בחיפוש</p>
        )}
      </div>

      {/* Collapsed hint */}
      {!open && rows.length > PREVIEW && (
        <button onClick={() => setOpen(true)}
          className="w-full py-1.5 text-[11px] font-semibold text-accent-primary hover:text-accent-hover transition-colors cursor-pointer border-t border-border-primary">
          הצג את כל {rows.length} הארנקים
        </button>
      )}
    </section>
  );
}
