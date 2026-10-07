import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, Plus, RefreshCw, Trash2, Copy, X, ExternalLink, ShieldCheck, HelpCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { getUserSetting, setUserSetting } from '../../services/firestoreService';
import { fetchWalletData } from '../../services/walletService';
import { formatCurrency } from '../../utils/formatters';
import Card from '../shared/Card';
import BlockchainAnimation from '../shared/BlockchainAnimation';
import { FREE_LIMITS } from '../../utils/constants';
import { pageVariants, pageTransition } from '../../utils/animations';

const CHAIN_LABELS = {
  eth: 'Ethereum', bsc: 'BNB Chain', polygon: 'Polygon', arbitrum: 'Arbitrum',
  base: 'Base', optimism: 'Optimism', avalanche: 'Avalanche', fantom: 'Fantom',
  solana: 'Solana', bitcoin: 'Bitcoin',
};
// DefiLlama hosts free chain icons under their canonical slug. Map our worker's
// chain keys to those slugs so we can render a 16-20px logo next to the label.
const CHAIN_ICON_SLUG = {
  eth: 'ethereum', bsc: 'bsc', polygon: 'polygon', arbitrum: 'arbitrum',
  base: 'base', optimism: 'optimism', avalanche: 'avalanche', fantom: 'fantom',
  solana: 'solana', bitcoin: 'bitcoin',
};
const chainLabel = (c) => CHAIN_LABELS[c] || c;
const chainIcon = (c) => {
  const slug = CHAIN_ICON_SLUG[c];
  return slug ? `https://icons.llamao.fi/icons/chains/rsz_${slug}?w=24&h=24` : null;
};
const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');

function ChainBadge({ chain, usd }) {
  const icon = chainIcon(chain);
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full bg-bg-tertiary text-text-secondary border border-border-primary">
      {icon
        ? <img src={icon} alt="" className="w-3.5 h-3.5 rounded-full" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        : <span className="w-3.5 h-3.5 rounded-full bg-border-primary" />}
      <span dir="ltr">{chainLabel(chain)}{usd != null ? ` · ${formatCurrency(usd)}` : ''}</span>
    </span>
  );
}

// EVM (0x…), Bitcoin (bc1…/1…/3…), or Solana (base58) address.
const EVM_RE = /^0x[a-fA-F0-9]{40}$/;
const BTC_RE = /^(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/;
const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{40,44}$/;
const isValidAddress = (a) => EVM_RE.test(a) || BTC_RE.test(a) || SOL_RE.test(a);

export default function WalletsPage() {
  const { user, isPremium } = useAuth();
  const navigate = useNavigate();
  const [wallets, setWallets] = useState([]);      // [{ id, address, label }]
  const [data, setData] = useState({});            // address -> { totalUsd, chains, tokens } | { error }
  const [loadingAddr, setLoadingAddr] = useState({});
  const [adding, setAdding] = useState(false);
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const load = useCallback(async (addr) => {
    setLoadingAddr((s) => ({ ...s, [addr]: true }));
    try {
      const res = await fetchWalletData(addr);
      setData((s) => ({ ...s, [addr]: res }));
    } catch (e) {
      setData((s) => ({ ...s, [addr]: { error: e.message } }));
    } finally {
      setLoadingAddr((s) => ({ ...s, [addr]: false }));
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    getUserSetting(user.uid, 'wallets').then((d) => {
      const list = Array.isArray(d?.list) ? d.list : [];
      setWallets(list);
      setLoaded(true);
      list.forEach((w) => load(w.address));
    });
  }, [user, load]);

  const persist = async (list) => {
    setWallets(list);
    await setUserSetting(user.uid, 'wallets', { list }, true);
  };

  const addWallet = async () => {
    const addr = address.trim();
    if (!isValidAddress(addr)) {
      toast.error('כתובת ארנק לא תקינה (EVM / Solana / Bitcoin)');
      return;
    }
    if (wallets.some((w) => w.address.toLowerCase() === addr.toLowerCase())) {
      toast.error('הארנק כבר קיים');
      return;
    }
    if (!isPremium && wallets.length >= FREE_LIMITS.wallets) {
      toast.error(`במסלול החינמי אפשר עד ${FREE_LIMITS.wallets} ארנקים. שדרג ל-Premium לארנקים ללא הגבלה.`);
      navigate('/premium');
      return;
    }
    const w = { id: Date.now().toString(36), address: addr, label: label.trim() };
    await persist([...wallets, w]);
    setAddress(''); setLabel(''); setAdding(false);
    load(addr);
  };

  const removeWallet = async (id, addr) => {
    await persist(wallets.filter((w) => w.id !== id));
    setData((s) => { const n = { ...s }; delete n[addr]; return n; });
  };

  const copy = (addr) => { navigator.clipboard.writeText(addr); toast.success('הכתובת הועתקה'); };

  const grandTotal = wallets.reduce((sum, w) => sum + (data[w.address]?.totalUsd || 0), 0);

  // Portfolio allocation BY COIN — aggregate every wallet's tokens by symbol.
  const allocation = useMemo(() => {
    const bySym = {};
    for (const w of wallets) {
      for (const t of data[w.address]?.tokens || []) {
        if (t?.symbol && t.usd > 0) bySym[t.symbol] = (bySym[t.symbol] || 0) + t.usd;
      }
    }
    const sorted = Object.entries(bySym).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((s, [, v]) => s + v, 0);
    const rows = sorted.slice(0, 5).map(([sym, val]) => ({ sym, pct: total > 0 ? (val / total) * 100 : 0 }));
    const otherVal = sorted.slice(5).reduce((s, [, v]) => s + v, 0);
    if (otherVal > 0) rows.push({ sym: 'אחר', pct: total > 0 ? (otherVal / total) * 100 : 0 });
    return { rows, total };
  }, [wallets, data]);
  const ALLOC_COLORS = ['#f7931a', '#627eea', '#14f195', '#26a17b', '#e84142', '#8b95a8'];

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}
      className="px-4 py-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header — compact on mobile; the explanation lives behind a "?" */}
        <Card className="relative overflow-hidden p-4 md:p-6">
          <div aria-hidden className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(80% 140% at 100% 0%, rgba(37,99,235,0.14) 0%, transparent 60%)' }} />
          {/* Same title treatment as the shared PageHeader (icon medallion +
              title); this header keeps its own "?" explainer and animation. */}
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-text-primary min-w-0">
              <span className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-accent-primary/12 border border-accent-primary/20 grid place-items-center shrink-0">
                <Wallet className="w-5 h-5 text-accent-primary" />
              </span>
              <h1 className="text-xl md:text-2xl font-bold">ארנקים</h1>
              <motion.button
                onClick={() => setShowInfo((v) => !v)}
                whileTap={{ scale: 0.9 }}
                aria-label="מה זה?"
                className={`p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${showInfo ? 'text-accent-primary bg-accent-primary/10' : 'text-text-muted hover:bg-bg-tertiary'}`}
              >
                <HelpCircle className="w-4 h-4" />
              </motion.button>
            </div>
            <div className="text-left shrink-0">
              <div className="text-[11px] text-text-muted">שווי כולל</div>
              <div className="num-mono text-xl md:text-2xl font-bold text-text-primary" dir="ltr">{formatCurrency(grandTotal)}</div>
            </div>
          </div>

          {/* Explanation — revealed on tapping "?" */}
          <AnimatePresence initial={false}>
            {showInfo && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="relative overflow-hidden"
              >
                <p className="text-sm text-text-secondary mt-3 leading-relaxed">
                  עקוב אחר שווי הארנקים שלך בכל הרשתות — <span className="font-semibold text-text-primary">EVM, Solana ו-Bitcoin</span> במקום אחד. מזין כתובת ציבורית ורואה יתרות, אחזקות ושווי מעודכן.
                </p>
                <div className="flex items-center gap-1.5 mt-2 text-[11px] text-text-muted">
                  <ShieldCheck className="w-3.5 h-3.5 text-profit shrink-0" />
                  קריאה בלבד · בלי מפתחות פרטיים · הכתובת נשמרת רק אצלך
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* On-chain blockchain animation */}
          <BlockchainAnimation className="relative mt-3 h-14 w-full opacity-90" />
        </Card>

        {/* Portfolio allocation — by coin, aggregated across all wallets */}
        {allocation.total > 0 && (
          <div className="bg-bg-secondary border border-border-primary rounded-2xl p-5">
            <div className="text-sm font-bold text-text-primary mb-3">הקצאת התיק</div>
            <div className="h-3 rounded-full overflow-hidden flex bg-bg-tertiary mb-3" dir="ltr">
              {allocation.rows.map((r, i) => (
                <div key={r.sym} className="h-full transition-all duration-700" style={{ width: `${r.pct}%`, background: ALLOC_COLORS[i % ALLOC_COLORS.length] }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {allocation.rows.map((r, i) => (
                <span key={r.sym} className="flex items-center gap-1.5 text-xs">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: ALLOC_COLORS[i % ALLOC_COLORS.length] }} />
                  <span className="font-bold text-text-primary">{r.sym}</span>
                  <span className="text-text-muted num-mono" dir="ltr">{r.pct.toFixed(0)}%</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Add wallet */}
        {adding ? (
          <div className="bg-bg-secondary border border-border-primary rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-text-primary">הוספת ארנק</span>
              <button onClick={() => { setAdding(false); setAddress(''); setLabel(''); }} className="text-text-muted hover:text-text-primary cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="כתובת ארנק — EVM / Solana / Bitcoin" dir="rtl"
              className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors font-mono text-right" />
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="כינוי (לא חובה) — לדוגמה: ארנק קר" dir="rtl"
              className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors text-right" />
            <button onClick={addWallet}
              className="w-full py-2.5 rounded-lg bg-accent-primary text-bg-primary text-sm font-bold hover:bg-accent-hover transition-colors cursor-pointer">
              הוסף ארנק
            </button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)}
            className="w-full py-3 rounded-2xl border border-dashed border-border-primary text-sm text-text-secondary hover:text-text-primary hover:border-accent-primary transition-colors cursor-pointer flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> הוסף ארנק
          </button>
        )}

        {/* Empty state */}
        {loaded && wallets.length === 0 && !adding && (
          <div className="text-center text-sm text-text-muted py-10">
            עדיין אין ארנקים. הוסף כתובת ארנק כדי לראות את השווי והאחזקות.
          </div>
        )}

        {/* Wallet cards */}
        {wallets.map((w) => {
          const d = data[w.address];
          const busy = loadingAddr[w.address];
          return (
            <div key={w.id} className="bg-bg-secondary border border-border-primary rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text-primary truncate">{w.label || 'ארנק'}</div>
                  <button onClick={() => copy(w.address)} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary cursor-pointer" dir="ltr">
                    {shortAddr(w.address)} <Copy className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-left">
                    <div className="text-[10px] text-text-muted">שווי</div>
                    <div className="text-base font-bold text-text-primary" dir="ltr">
                      {d?.error ? '—' : formatCurrency(d?.totalUsd || 0)}
                    </div>
                  </div>
                  <button onClick={() => load(w.address)} disabled={busy}
                    className="p-2 rounded-lg hover:bg-bg-tertiary text-text-muted cursor-pointer disabled:opacity-50" title="רענן">
                    <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
                  </button>
                  <button onClick={() => removeWallet(w.id, w.address)}
                    className="p-2 rounded-lg hover:bg-loss/10 text-text-muted hover:text-loss cursor-pointer" title="הסר">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {d?.error && (
                <div className="text-xs text-loss bg-loss/10 border border-loss/30 rounded-lg p-2">{d.error}</div>
              )}

              {/* Per-chain split */}
              {d?.chains?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {d.chains.map((c) => (
                    <ChainBadge key={c.chain} chain={c.chain} usd={c.usd} />
                  ))}
                </div>
              )}

              {/* Holdings */}
              {d?.tokens?.length > 0 && (
                <div className="divide-y divide-border-primary border-t border-border-primary pt-1">
                  {d.tokens.map((t, i) => (
                    <div key={`${t.chain}-${t.symbol}-${i}`} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {t.logo
                          ? <img src={t.logo} alt="" className="w-6 h-6 rounded-full" />
                          : <div className="w-6 h-6 rounded-full bg-bg-tertiary flex items-center justify-center text-[9px] text-text-muted">{(t.symbol || '?').slice(0, 3)}</div>}
                        <div className="min-w-0">
                          <div className="text-sm text-text-primary truncate">{t.symbol}</div>
                          <div className="flex items-center gap-1 text-[10px] text-text-muted" dir="ltr">
                            {chainIcon(t.chain) && (
                              <img src={chainIcon(t.chain)} alt="" className="w-3 h-3 rounded-full" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            )}
                            <span>{chainLabel(t.chain)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-left">
                        <div className="text-sm text-text-primary" dir="ltr">{formatCurrency(t.usd)}</div>
                        <div className="text-[10px] text-text-muted" dir="ltr">{(t.amount ?? 0).toLocaleString('en-US', { maximumFractionDigits: 4 })}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {busy && !d && (
                <div className="flex items-center gap-2 text-xs text-text-muted py-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> טוען נתוני ארנק...
                </div>
              )}
            </div>
          );
        })}

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-text-muted pt-2">
          <ExternalLink className="w-3 h-3" /> רשתות EVM + Solana + Bitcoin · Moralis & mempool.space
        </div>
      </div>
    </motion.div>
  );
}
