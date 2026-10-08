import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Gem, AlertCircle, RefreshCw, Users, Layers, TrendingUp, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSmartConsensus } from '../../hooks/useSmartConsensus';
import { fmtUsd, shortWallet } from '../../utils/polymarketScore';
import { downloadCsv, stampedName } from '../../utils/csv';
import { staggerContainer, staggerItem } from '../../utils/animations';

const SORTS = [
  { key: 'value', label: 'לפי כסף', val: (c) => c.valueUsd },
  { key: 'holders', label: 'לפי מס׳ ארנקים', val: (c) => c.holders },
  { key: 'pnl', label: 'לפי רווח', val: (c) => c.pnlUsd },
];

function ConsensusRow({ c, rank, onOpen }) {
  const up = c.pnlUsd >= 0;
  return (
    <div onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-bg-secondary border border-border-primary text-right cursor-pointer transition-colors hover:border-accent-primary/40 outline-none focus-visible:border-accent-primary/60">
      <span className="w-5 text-center text-xs font-bold text-text-muted num-mono shrink-0">{rank}</span>
      {c.icon
        ? <img src={c.icon} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" loading="lazy" />
        : <div className="w-9 h-9 rounded-lg bg-bg-tertiary shrink-0" />}

      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-text-primary truncate" dir="auto">{c.title}</div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent-primary/10 text-accent-primary">{c.outcome}</span>
          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-text-secondary num-mono">
            <Users className="w-2.5 h-2.5" />{c.holders} ארנקים
          </span>
          {c.curPrice > 0 && <span className="text-[10px] text-text-muted num-mono">{Math.round(c.curPrice * 100)}¢</span>}
          {/* who exactly — the faces behind the consensus */}
          <span className="flex -space-x-1.5 rtl:space-x-reverse">
            {c.wallets.slice(0, 4).map((w) => (
              w.profileImage
                ? <img key={w.wallet} src={w.profileImage} alt="" title={w.name || shortWallet(w.wallet)} className="w-4 h-4 rounded-full object-cover ring-1 ring-bg-secondary" loading="lazy" />
                : <span key={w.wallet} title={shortWallet(w.wallet)} className="w-4 h-4 rounded-full bg-bg-tertiary ring-1 ring-bg-secondary" />
            ))}
          </span>
        </div>
      </div>

      <div className="text-left shrink-0">
        <div className="text-sm font-extrabold num-mono text-text-primary">{fmtUsd(c.valueUsd)}</div>
        <div className={`text-[10px] font-bold num-mono ${up ? 'text-profit' : 'text-loss'}`}>{fmtUsd(c.pnlUsd)}</div>
      </div>
    </div>
  );
}

// "לאן הכסף החכם זורם" — one picture built from the open books of the top
// smart-money wallets: which market+outcome they are crowding into, how much
// capital is behind it, and who exactly is in.
export default function SmartConsensus() {
  const navigate = useNavigate();
  const { consensus, cohortSize, loading, error, refetch } = useSmartConsensus();
  const [sort, setSort] = useState('value');

  const view = useMemo(() => {
    const f = SORTS.find((s) => s.key === sort)?.val || SORTS[0].val;
    return [...consensus].sort((a, b) => f(b) - f(a)).slice(0, 40);
  }, [consensus, sort]);

  const totals = useMemo(() => ({
    markets: consensus.length,
    capital: consensus.reduce((s, c) => s + c.valueUsd, 0),
  }), [consensus]);

  const exportCsv = () => {
    downloadCsv(
      stampedName('polymarket_smart_money'),
      ['שוק', 'תוצאה', 'מס׳ ארנקים', 'שווי מצטבר ($)', 'רווח ($)', 'מחיר (¢)', 'ארנקים'],
      view.map((c) => [
        c.title, c.outcome, c.holders, Math.round(c.valueUsd), Math.round(c.pnlUsd),
        Math.round((c.curPrice || 0) * 100),
        c.wallets.map((w) => w.name || shortWallet(w.wallet)).join(' | '),
      ]),
    );
    toast.success('הקובץ הורד');
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5 min-w-0">
          <Gem className="w-3.5 h-3.5 text-accent-primary shrink-0" />
          <h2 className="text-sm font-bold text-text-primary shrink-0">לאן הכסף החכם זורם</h2>
          <span className="text-[11px] text-text-muted truncate">— התיקים של {cohortSize} הארנקים המובילים, מאוחדים לתמונה אחת</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex bg-bg-secondary border border-border-primary rounded-lg p-0.5 gap-0.5">
            {SORTS.map((s) => (
              <button key={s.key} onClick={() => setSort(s.key)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${sort === s.key ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary'}`}>
                {s.label}
              </button>
            ))}
          </div>
          <button onClick={exportCsv} disabled={consensus.length === 0} title="ייצוא ל-CSV"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-border-primary text-text-muted hover:text-accent-primary transition-colors cursor-pointer disabled:opacity-40">
            <Download className="w-3 h-3" /> CSV
          </button>
        </div>
      </div>

      {/* Totals */}
      {!loading && consensus.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="rounded-xl bg-bg-secondary border border-border-primary px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-accent-primary shrink-0" />
              <span className="text-base font-extrabold num-mono text-text-primary leading-none">{totals.markets}</span>
            </div>
            <div className="text-[10px] text-text-muted mt-1.5">פוזיציות בקונסנזוס (2+ ארנקים)</div>
          </div>
          <div className="rounded-xl bg-bg-secondary border border-border-primary px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-profit shrink-0" />
              <span className="text-base font-extrabold num-mono text-profit leading-none">{fmtUsd(totals.capital)}</span>
            </div>
            <div className="text-[10px] text-text-muted mt-1.5">הון מצטבר מאחוריהן</div>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <>
          <p className="text-[11px] text-text-muted mb-2">קורא את התיקים של הארנקים המובילים…</p>
          <div className="space-y-2">{Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-bg-secondary animate-pulse" />)}</div>
        </>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 py-10 rounded-2xl border border-loss/25 bg-loss/5 text-center">
          <AlertCircle className="w-6 h-6 text-loss" />
          <p className="text-sm text-text-secondary max-w-xs">{error}</p>
          <button onClick={refetch} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-tertiary text-xs font-semibold text-text-primary hover:text-accent-primary transition-colors cursor-pointer">
            <RefreshCw className="w-3.5 h-3.5" /> נסה שוב
          </button>
        </div>
      ) : view.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 rounded-2xl border border-dashed border-border-primary text-text-muted text-center px-6">
          <Gem className="w-7 h-7 opacity-60" />
          <span className="text-sm font-medium">אין כרגע פוזיציה שיותר מארנק חכם אחד מחזיק</span>
          <span className="text-[11px] max-w-sm leading-relaxed">זה קורה כשהמובילים מפוזרים על שווקים שונים — סימן שאין כרגע הימור משותף ברור.</span>
        </div>
      ) : (
        <motion.div className="space-y-2" variants={staggerContainer} initial="initial" animate="animate">
          {view.map((c, i) => (
            <motion.div key={`${c.conditionId}-${c.outcome}`} variants={staggerItem}>
              <ConsensusRow c={c} rank={i + 1} onOpen={() => navigate(`/polymarket/market/${c.conditionId}`, { state: { from: '/market?tab=polymarket&pm=consensus' } })} />
            </motion.div>
          ))}
        </motion.div>
      )}

      <p className="text-[11px] text-text-muted leading-relaxed mt-4 px-1">
        מחושב מהפוזיציות הפתוחות של {cohortSize} הארנקים הרווחיים ביותר (30 יום). פוזיציה נכנסת לרשימה כששני ארנקים או יותר מחזיקים אותה תוצאה — ריכוז של כסף חכם, לא המלצה.
      </p>
    </div>
  );
}
