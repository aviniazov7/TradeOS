import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Search, X } from 'lucide-react';
import Modal from '../shared/Modal';
import ScoreRing from './ScoreRing';
import { fmtUsd, fmtPct, shortWallet } from '../../utils/polymarketScore';

const SEARCH_AT = 8;   // show the search box once the list gets long
const SORTS = [
  { key: 'added', label: 'לפי הוספה' },
  { key: 'score', label: 'ציון' },
  { key: 'pnl', label: 'רווח' },
  { key: 'roi', label: 'ROI' },
];
const SORT_VALUE = {
  score: (r) => r.smartScore ?? -1,
  pnl: (r) => r.pnl,
  roi: (r) => r.roi,
};

function Summary({ label, value, tone }) {
  const color = tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-text-primary';
  return (
    <div className="bg-bg-tertiary/50 rounded-lg px-3 py-2 min-w-0">
      <div className="text-[10px] text-text-muted">{label}</div>
      <div className={`text-sm font-extrabold num-mono mt-0.5 truncate ${color}`}>{value}</div>
    </div>
  );
}

// One compact tracked row — dense enough that a long list stays scannable.
function WatchRow({ r, onOpen, onRemove }) {
  return (
    <motion.div layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
      onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-bg-secondary border border-border-primary cursor-pointer transition-colors hover:border-accent-primary/40 outline-none focus-visible:border-accent-primary/60">
      <ScoreRing score={r.smartScore} size="md" />
      {r.profileImage
        ? <img src={r.profileImage} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" loading="lazy" />
        : <div className="w-7 h-7 rounded-full bg-bg-tertiary shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold text-text-primary truncate" dir="auto">{r.name || shortWallet(r.wallet)}</div>
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

// The tracked-wallets workspace, in a modal: summary tiles, then a searchable,
// sortable, scroll-bounded list — so 3 wallets and 50 wallets both look right.
export default function WatchedWalletsModal({ isOpen, onClose, rows, onOpen, onRemove }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('added');

  const { pnl, avgScore } = useMemo(() => {
    const scored = rows.filter((r) => r.smartScore != null);
    return {
      pnl: rows.reduce((s, r) => s + (r.pnl || 0), 0),
      avgScore: scored.length ? Math.round(scored.reduce((s, r) => s + r.smartScore, 0) / scored.length) : null,
    };
  }, [rows]);

  const view = useMemo(() => {
    let list = rows;
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((r) => (r.name || '').toLowerCase().includes(q) || r.wallet.toLowerCase().includes(q));
    if (sort === 'added') return list;                       // Firestore order
    const val = SORT_VALUE[sort] || SORT_VALUE.score;
    return [...list].sort((a, b) => val(b) - val(a));
  }, [rows, query, sort]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} ariaLabel="הארנקים שאני עוקב" maxWidth="max-w-lg"
      title={(
        <span className="inline-flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
          <span className="font-bold text-text-primary">הארנקים שאני עוקב</span>
          <span className="text-[11px] text-text-muted num-mono">({rows.length})</span>
        </span>
      )}>
      <div className="space-y-3">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Star className="w-8 h-8 text-text-muted opacity-50" />
            <p className="text-sm font-medium text-text-primary">עוד לא עוקב אחרי אף ארנק</p>
            <p className="text-[11px] text-text-muted max-w-xs leading-relaxed">
              לחץ על ⭐ ליד כל ארנק בדירוג כדי להוסיף אותו לכאן — ואז תוכל לעקוב אחריו, לראות את המהלכים שלו, ולקבל עליו תדרוך מהאנליסט.
            </p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-2">
              <Summary label="ארנקים" value={rows.length} />
              <Summary label="ציון ממוצע" value={avgScore ?? '—'} />
              <Summary label="רווח מצטבר" value={fmtUsd(pnl)} tone={pnl >= 0 ? 'profit' : 'loss'} />
            </div>

            {/* Controls — only when the list is long enough to need them */}
            {rows.length >= SEARCH_AT && (
              <div className="flex flex-wrap items-center gap-2">
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

            {/* List */}
            <div className="space-y-1.5 max-h-[52vh] overflow-y-auto pe-1">
              <AnimatePresence initial={false}>
                {view.map((r) => (
                  <WatchRow key={r.wallet} r={r} onOpen={() => { onClose(); onOpen(r); }} onRemove={onRemove} />
                ))}
              </AnimatePresence>
              {view.length === 0 && <p className="py-4 text-center text-xs text-text-muted">אין ארנק תואם בחיפוש</p>}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
