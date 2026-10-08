import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GraduationCap, Plus, Pencil, Trash2, ExternalLink, TrendingUp, TrendingDown, Check, X, Target } from 'lucide-react';
import CoinIcon from '../shared/CoinIcon';
import ConfirmDialog from '../shared/ConfirmDialog';
import MarkSetupModal from './MarkSetupModal';
import { safeHttpUrl } from '../../utils/urls';
import { confidenceBucket } from '../../utils/wyckoff';

const BUCKET_ORDER = ['90–95', '75–89', '60–74'];

function setupTime(s) {
  const d = s.at?.toDate ? s.at.toDate() : s.at ? new Date(s.at)
    : s.createdAt?.toDate ? s.createdAt.toDate() : null;
  return d && !Number.isNaN(d.getTime()) ? d.getTime() : 0;
}

function fmtDate(ts) {
  const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function Stat({ label, value, tone }) {
  const color = tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-text-primary';
  return (
    <div className="flex flex-col items-center px-3 py-1.5 rounded-lg bg-bg-secondary border border-border-primary min-w-[64px]">
      <span className={`text-base font-extrabold num-mono leading-none ${color}`}>{value}</span>
      <span className="text-[10px] text-text-muted mt-1">{label}</span>
    </div>
  );
}

// Compact segmented filter.
function Seg({ value, onChange, options }) {
  return (
    <div className="inline-flex bg-bg-secondary border border-border-primary rounded-lg p-0.5 gap-0.5">
      {options.map((o) => (
        <button
          key={o.v} type="button" onClick={() => onChange(o.v)}
          className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
            value === o.v ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// One labeled setup row — reads like a ledger line: coin, direction, verdict,
// levels, when, and where it came from (owner-marked vs scanner-detected).
function SetupRow({ s, onEdit, onDelete }) {
  const isLong = s.direction === 'long';
  const isValid = s.label !== 'invalid';
  const chart = safeHttpUrl(s.chartUrl);
  const date = fmtDate(s.at) || fmtDate(s.createdAt);
  return (
    <motion.div
      layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
      className="group flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-bg-secondary border border-border-primary hover:border-accent-primary/30 transition-colors"
    >
      <CoinIcon pair={s.pair} className="w-7 h-7 shrink-0" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-bold text-text-primary" dir="ltr">{s.pair}</span>
          <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${isLong ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'}`}>
            {isLong ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}{isLong ? 'LPS' : 'LPSY'}
          </span>
          <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${isValid ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'}`}>
            {isValid ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}{isValid ? 'תקין' : 'לא תקין'}
          </span>
          {s.source === 'scanner' && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent-primary/10 text-accent-primary">
              סורק{s.confidence != null ? ` · ${s.confidence}` : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-text-muted num-mono">
          <span>{s.timeframe || '30m'}</span>
          {s.entry != null && <span dir="ltr">כניסה {s.entry}</span>}
          {s.stop != null && <span dir="ltr">סטופ {s.stop}</span>}
          {date && <span>· {date}</span>}
        </div>
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        {chart && (
          <a href={chart} target="_blank" rel="noopener noreferrer" title="פתח צ׳ארט"
            className="p-1.5 rounded-lg text-text-muted hover:text-accent-primary hover:bg-bg-tertiary transition-colors">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        <button onClick={() => onEdit(s)} title="עריכה"
          className="p-1.5 rounded-lg text-text-muted hover:text-accent-primary hover:bg-bg-tertiary transition-colors cursor-pointer">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onDelete(s)} title="מחיקה"
          className="p-1.5 rounded-lg text-text-muted hover:text-loss hover:bg-bg-tertiary transition-colors cursor-pointer">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

// The ground-truth training DB: the owner's real LPS/LPSY setups labeled
// valid/invalid. This is what the scanner is measured against — the precision
// panel shows how often the scanner's own detections matched a "valid" verdict,
// bucketed by the confidence it fired at (so the owner can see where to set the
// threshold). Controlled by SignalsPage (single wyckoffSetups source).
export default function SetupsDatabase({ setups = [], loading, onAdd, onUpdate, onDelete }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [fDir, setFDir] = useState('all');
  const [fLabel, setFLabel] = useState('all');
  const [fSource, setFSource] = useState('all');

  const stats = useMemo(() => {
    const scanner = setups.filter((s) => s.source === 'scanner');
    const scannerValid = scanner.filter((s) => s.label !== 'invalid').length;
    const scannerInvalid = scanner.filter((s) => s.label === 'invalid').length;
    const judged = scannerValid + scannerInvalid;
    const buckets = {};
    for (const s of scanner) {
      const b = confidenceBucket(s.confidence);
      if (!b) continue;
      buckets[b] = buckets[b] || { valid: 0, total: 0 };
      buckets[b].total++;
      if (s.label !== 'invalid') buckets[b].valid++;
    }
    return {
      total: setups.length,
      valid: setups.filter((s) => s.label !== 'invalid').length,
      invalid: setups.filter((s) => s.label === 'invalid').length,
      scannerValid, judged, buckets,
      precision: judged ? Math.round((scannerValid / judged) * 100) : null,
    };
  }, [setups]);

  const filtered = useMemo(() => setups.filter((s) =>
    (fDir === 'all' || s.direction === fDir)
    && (fLabel === 'all' || (fLabel === 'valid' ? s.label !== 'invalid' : s.label === 'invalid'))
    && (fSource === 'all' || (s.source || 'manual') === fSource)
  ), [setups, fDir, fLabel, fSource]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => setupTime(b) - setupTime(a)), [filtered]);

  const handleSave = async (data) => {
    if (editing) await onUpdate(editing.id, data);
    else await onAdd(data);
  };

  return (
    <section className="rounded-2xl border border-border-primary bg-bg-secondary">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border-primary">
        <div className="flex items-center gap-2.5 min-w-0">
          <GraduationCap className="w-4 h-4 text-accent-primary shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-text-primary">מאגר האימון</h2>
            <p className="text-[11px] text-text-muted truncate">סטאפים מסומנים שמכיילים את המנוע</p>
          </div>
        </div>
        <button
          onClick={() => { setEditing(null); setModalOpen(true); }}
          className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-accent-muted hover:bg-accent-primary text-white text-sm font-bold transition-colors cursor-pointer"
          title="סמן סטאפ לאימון"
          aria-label="סמן סטאפ לאימון"
        >
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">סמן לאימון</span>
        </button>
      </div>

      <div className="p-3 md:p-4">
      {/* Scanner precision — how often the engine's detections matched a "valid" verdict */}
      {stats.judged > 0 && (
        <div className="mb-3 rounded-xl border border-accent-primary/20 bg-accent-primary/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <Target className="w-3.5 h-3.5 text-accent-primary" /> דיוק המנוע
            </div>
            <span className="text-lg font-extrabold num-mono text-accent-primary leading-none">{stats.precision}%</span>
          </div>
          <div className="text-[10px] text-text-muted mt-0.5">{stats.scannerValid} תקינים מתוך {stats.judged} סטאפים שהמנוע אותר וסימנת</div>
          {BUCKET_ORDER.some((b) => stats.buckets[b]) && (
            <div className="mt-2 space-y-1">
              {BUCKET_ORDER.filter((b) => stats.buckets[b]).map((b) => {
                const { valid, total } = stats.buckets[b];
                const pct = Math.round((valid / total) * 100);
                return (
                  <div key={b} className="flex items-center gap-2 text-[10px]">
                    <span className="w-12 text-text-muted num-mono shrink-0">{b}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                      <div className="h-full rounded-full bg-accent-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="num-mono text-text-secondary w-16 text-left shrink-0">{pct}% ({valid}/{total})</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Stats strip */}
      {stats.total > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Stat label="סה״כ" value={stats.total} />
          <Stat label="תקינים" value={stats.valid} tone="profit" />
          <Stat label="לא תקינים" value={stats.invalid} tone="loss" />
        </div>
      )}

      {/* Filters */}
      {stats.total > 2 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3">
          <span className="inline-flex items-center gap-1.5 text-[10px] text-text-muted">כיוון<Seg value={fDir} onChange={setFDir} options={[{ v: 'all', label: 'הכל' }, { v: 'long', label: 'LPS' }, { v: 'short', label: 'LPSY' }]} /></span>
          <span className="inline-flex items-center gap-1.5 text-[10px] text-text-muted">תיוג<Seg value={fLabel} onChange={setFLabel} options={[{ v: 'all', label: 'הכל' }, { v: 'valid', label: 'תקין' }, { v: 'invalid', label: 'לא תקין' }]} /></span>
          <span className="inline-flex items-center gap-1.5 text-[10px] text-text-muted">מקור<Seg value={fSource} onChange={setFSource} options={[{ v: 'all', label: 'הכל' }, { v: 'scanner', label: 'סורק' }, { v: 'manual', label: 'ידני' }]} /></span>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-bg-secondary animate-pulse" />)}
        </div>
      ) : stats.total === 0 ? (
        <button
          onClick={() => { setEditing(null); setModalOpen(true); }}
          className="w-full flex flex-col items-center justify-center gap-2 px-4 py-8 text-center rounded-xl border border-dashed border-border-primary text-text-muted hover:text-accent-primary hover:border-accent-primary/40 transition-colors cursor-pointer"
        >
          <GraduationCap className="w-7 h-7 opacity-60" />
          <span className="text-sm font-medium">המאגר ריק</span>
          <span className="text-[11px] max-w-sm">סמן סטאפ אמיתי (LPS / LPSY), או סמן תקין / לא תקין על סטאפ שהמנוע איתר.</span>
        </button>
      ) : sorted.length === 0 ? (
        <div className="py-8 text-center text-sm text-text-muted">אין סטאפים בסינון הזה</div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {sorted.map((s) => (
              <SetupRow key={s.id} s={s} onEdit={(x) => { setEditing(x); setModalOpen(true); }} onDelete={setDeleteTarget} />
            ))}
          </AnimatePresence>
        </div>
      )}

      </div>

      <MarkSetupModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
        setup={editing}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => { await onDelete(deleteTarget.id); setDeleteTarget(null); }}
        title="מחיקת סטאפ מהמאגר"
        message="למחוק את הסטאפ מהמאגר? לא ניתן לבטל."
      />
    </section>
  );
}
