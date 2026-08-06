import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Plus, Trash2, ExternalLink, Search, Pencil, Target, Flag, Radar } from 'lucide-react';
import { searchCoins, fetchPrices } from '../../services/coingeckoApi';
import { useWatchlist } from '../../hooks/useWatchlist';
import { pageVariants, pageTransition } from '../../utils/animations';
import EmptyState from '../shared/EmptyState';
import Modal from '../shared/Modal';
import RollingNumber from '../shared/RollingNumber';
import toast from 'react-hot-toast';

function fmtPrice(p) {
  if (p == null || isNaN(p)) return '—';
  if (p >= 1) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${p.toFixed(6)}`;
}
function genericTvUrl(symbol) {
  const s = String(symbol || '').toUpperCase();
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(`BINANCE:${s}USDT`)}`;
}
// Only allow http(s) URLs — the link is user-provided and rendered as an <a
// href>, so a javascript:/data:/vbscript: scheme would be a stored-XSS vector.
function safeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url.trim());
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
  } catch { return null; }
}
// Long/short tag → opts the coin into the Wyckoff scanner and colors its flag.
const BIAS = {
  long: { label: 'לונג', flag: 'text-profit fill-profit/25', chip: 'text-profit bg-profit/10 border-profit/25' },
  short: { label: 'שורט', flag: 'text-loss fill-loss/25', chip: 'text-loss bg-loss/10 border-loss/25' },
};
const nextBias = (b) => (b == null ? 'long' : b === 'long' ? 'short' : null);
// Cap the number of scanned (tagged) coins so the scanner always stays within
// the free Cloudflare/Firestore budget — applies to Premium too, on purpose.
const MAX_SCAN_TAGS = 15;

export default function WatchlistPage({ embedded = false }) {
  const { items, loading, addItem, updateItem, removeItem } = useWatchlist();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [adding, setAdding] = useState(false);
  const [prices, setPrices] = useState({});
  const [editing, setEditing] = useState(null); // item being edited
  const [form, setForm] = useState({ note: '', targetPrice: '', tvLink: '', bias: null });
  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  const refreshPrices = useCallback(async (signal) => {
    if (!items.length) { setPrices({}); return; }
    const coins = items.map((i) => ({ symbol: i.symbol, coingeckoId: i.coingeckoId }));
    const p = await fetchPrices(coins, signal);
    if (!signal?.aborted) setPrices(p);
  }, [items]);

  useEffect(() => {
    const ctrl = new AbortController();
    refreshPrices(ctrl.signal);
    const t = setInterval(() => refreshPrices(ctrl.signal), 45_000);
    return () => { ctrl.abort(); clearInterval(t); };
  }, [refreshPrices]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      const r = await searchCoins(query.trim());
      setResults(r); setShowResults(true);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  useEffect(() => {
    const onClick = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setShowResults(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const handleAdd = async (coin) => {
    if (items.some((i) => i.coingeckoId === coin.coingeckoId)) {
      toast.error('המטבע כבר במעקב');
      setQuery(''); setShowResults(false);
      return;
    }
    setAdding(true);
    try {
      const p = await fetchPrices([{ symbol: coin.symbol, coingeckoId: coin.coingeckoId }]);
      const addedPrice = p[coin.coingeckoId]?.usd ?? null;
      await addItem({
        coingeckoId: coin.coingeckoId, symbol: coin.symbol, name: coin.name,
        thumb: coin.thumb || null, addedPrice, note: '', targetPrice: null, tvLink: '', bias: null,
      });
      toast.success(`${coin.symbol} נוסף למעקב`);
      setQuery(''); setResults([]); setShowResults(false);
    } catch { toast.error('הוספה נכשלה'); }
    finally { setAdding(false); }
  };

  // Quick flag toggle on the row — cycles none → long → short → none.
  const cycleBias = async (it) => {
    const wasTagged = it.bias === 'long' || it.bias === 'short';
    const bias = nextBias(it.bias ?? null);
    const willTag = bias === 'long' || bias === 'short';
    if (willTag && !wasTagged) {
      const tagged = items.filter((i) => i.bias === 'long' || i.bias === 'short').length;
      if (tagged >= MAX_SCAN_TAGS) {
        toast.error(`מקסימום ${MAX_SCAN_TAGS} מטבעות מתויגים לסריקה. הסר תיוג ממטבע אחר קודם.`);
        return;
      }
    }
    try {
      await updateItem(it.id, { bias });
      if (bias) toast.success(`${it.symbol}: ${BIAS[bias].label} — ייסרק לסטאפ`);
    } catch { toast.error('עדכון התיוג נכשל'); }
  };

  const openEdit = (it) => {
    setEditing(it);
    setForm({ note: it.note || '', targetPrice: it.targetPrice ?? '', tvLink: it.tvLink || '', bias: it.bias ?? null });
  };
  const saveEdit = async () => {
    if (!editing) return;
    const wasTagged = editing.bias === 'long' || editing.bias === 'short';
    const willTag = form.bias === 'long' || form.bias === 'short';
    if (willTag && !wasTagged) {
      const tagged = items.filter((i) => i.bias === 'long' || i.bias === 'short').length;
      if (tagged >= MAX_SCAN_TAGS) {
        toast.error(`מקסימום ${MAX_SCAN_TAGS} מטבעות מתויגים לסריקה.`);
        return;
      }
    }
    const target = form.targetPrice === '' ? null : Number(form.targetPrice);
    await updateItem(editing.id, {
      note: form.note.trim(),
      targetPrice: Number.isFinite(target) ? target : null,
      tvLink: form.tvLink.trim(),
      bias: form.bias,
    });
    toast.success('עודכן');
    setEditing(null);
  };

  const Wrapper = embedded ? 'div' : motion.div;
  const wrapperProps = embedded
    ? {}
    : { variants: pageVariants, initial: 'initial', animate: 'animate', exit: 'exit', transition: pageTransition };

  const taggedCount = items.filter((i) => i.bias === 'long' || i.bias === 'short').length;

  return (
    <Wrapper {...wrapperProps} className="max-w-3xl mx-auto px-1 py-2">
      {/* Title — hidden when embedded as a market tab (the tab label already says it) */}
      {!embedded && (
        <div className="flex items-center gap-2 mb-3">
          <Star className="w-5 h-5 text-accent-primary" />
          <h1 className="text-lg font-bold text-text-primary">מעקב מטבעות</h1>
          <span className="text-xs text-text-muted">({items.length})</span>
        </div>
      )}

      {/* Scanner hint — tagging a coin long/short opts it into the setup scanner */}
      <div className="flex items-center gap-2 mb-3 rounded-xl bg-accent-primary/8 border border-accent-primary/20 px-3 py-2">
        <Radar className="w-4 h-4 text-accent-primary shrink-0" />
        <p className="text-[11px] text-text-secondary leading-snug">
          תייג מטבע ב<span className="text-profit font-semibold">לונג</span> או <span className="text-loss font-semibold">שורט</span> (הדגל בצד) — והוא ייסרק אוטומטית לסטאפ ויקוף.
          {taggedCount > 0 && <span className="text-text-muted"> · {taggedCount}/{MAX_SCAN_TAGS} מתויגים</span>}
        </p>
      </div>

      {/* Add coin */}
      <div className="relative mb-4" ref={searchRef}>
        <div className="flex items-center gap-2 bg-bg-secondary border border-border-primary rounded-xl px-4 py-2.5 focus-within:border-accent-primary/50 transition-colors">
          <Search className="w-4 h-4 text-text-muted shrink-0" />
          <input
            type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length && setShowResults(true)}
            placeholder="חפש מטבע להוספה למעקב..."
            className="bg-transparent text-sm text-text-primary placeholder-text-muted outline-none w-full"
          />
          {adding && <span className="text-[11px] text-text-muted shrink-0">מוסיף…</span>}
        </div>
        <AnimatePresence>
          {showResults && results.length > 0 && (
            <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
              className="absolute z-50 top-full mt-1 inset-x-0 bg-bg-overlay border border-border-primary rounded-xl shadow-xl overflow-hidden">
              {results.map((coin) => (
                <button key={coin.coingeckoId} onClick={() => handleAdd(coin)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-bg-tertiary transition-colors cursor-pointer text-right">
                  {coin.thumb && <img src={coin.thumb} alt="" className="w-5 h-5 rounded-full" />}
                  <span className="text-text-primary font-medium">{coin.name}</span>
                  <span className="text-text-muted text-xs">{coin.symbol}</span>
                  <Plus className="w-4 h-4 text-accent-primary mr-auto" />
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* List — TradingView-style rows */}
      {loading ? (
        <p className="text-sm text-text-muted text-center py-10">טוען…</p>
      ) : items.length === 0 ? (
        <EmptyState icon={Star} title="אין מטבעות במעקב"
          description="הוסף מטבע שאתה מנתח, תייג אותו לונג/שורט, ותקבל התראה כשנוצר סטאפ ויקוף." />
      ) : (
        <div className="rounded-2xl border border-border-primary bg-bg-secondary/40 overflow-hidden">
          <AnimatePresence>
            {items.map((it) => {
              const live = prices[it.coingeckoId];
              const cur = live?.usd;
              const ch24 = live?.usd_24h_change;
              const chartUrl = safeUrl(it.tvLink) || genericTvUrl(it.symbol);
              const thumbUrl = safeUrl(it.thumb);
              const b = it.bias === 'long' || it.bias === 'short' ? it.bias : null;
              return (
                <motion.div key={it.id} layout
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
                  dir="ltr"
                  className="group flex items-center gap-2.5 px-3 py-2.5 border-b border-border-primary/50 last:border-b-0 hover:bg-bg-tertiary/40 transition-colors"
                >
                  {/* Bias flag — click to cycle long/short/none */}
                  <button
                    onClick={() => cycleBias(it)}
                    title={b ? `תיוג: ${BIAS[b].label} · לחץ להחלפה` : 'לחץ לתיוג לונג/שורט'}
                    aria-label="תיוג לונג/שורט"
                    className="shrink-0 p-1 rounded-md hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <Flag className={`w-4 h-4 ${b ? BIAS[b].flag : 'text-text-muted/50'}`} />
                  </button>

                  {/* Icon */}
                  {thumbUrl
                    ? <img src={thumbUrl} alt="" className="w-8 h-8 rounded-full shrink-0" />
                    : <span className="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center text-[10px] font-bold text-text-secondary shrink-0">{it.symbol?.slice(0, 3)?.toUpperCase()}</span>}

                  {/* Symbol + name */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-text-primary truncate">{it.symbol?.toUpperCase()}USDT.P</span>
                      {b && <span className={`text-[9px] font-bold px-1.5 py-px rounded border ${BIAS[b].chip}`}>{BIAS[b].label}</span>}
                    </div>
                    <p className="text-[11px] text-text-muted truncate">{it.name} · Perpetual</p>
                  </div>

                  {/* Note / target indicators */}
                  <div className="hidden sm:flex items-center gap-1 shrink-0">
                    {it.targetPrice != null && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-accent-primary" title={`יעד ${fmtPrice(it.targetPrice)}`}>
                        <Target className="w-3 h-3" />
                      </span>
                    )}
                  </div>

                  {/* Price + change */}
                  <div className="text-right shrink-0 min-w-[84px]">
                    <p className="text-sm font-bold num-mono text-text-primary leading-none"><RollingNumber value={fmtPrice(cur)} /></p>
                    {ch24 != null && (
                      <p className={`text-[11px] font-semibold num-mono mt-0.5 ${ch24 >= 0 ? 'text-profit' : 'text-loss'}`}>
                        {ch24 >= 0 ? '+' : ''}{ch24.toFixed(2)}%
                      </p>
                    )}
                  </div>

                  {/* Actions (hover) */}
                  <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a href={chartUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md text-text-muted hover:text-accent-primary hover:bg-accent-primary/10 transition-colors" title={it.tvLink ? 'הגרף שלי' : 'פתח ב-TradingView'}>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button onClick={() => openEdit(it)} className="p-1.5 rounded-md text-text-muted hover:text-accent-primary hover:bg-accent-primary/10 transition-colors" title="ערוך">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => removeItem(it.id)} className="p-1.5 rounded-md text-text-muted hover:text-loss hover:bg-loss/10 transition-colors" title="הסר">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Edit modal */}
      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={`עריכת ${editing?.symbol?.toUpperCase() || ''}`} maxWidth="max-w-md">
        <div className="space-y-4">
          {/* Bias selector */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">תיוג לסורק</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { v: 'long', label: 'לונג', cls: 'text-profit border-profit/50 bg-profit/10' },
                { v: 'short', label: 'שורט', cls: 'text-loss border-loss/50 bg-loss/10' },
                { v: null, label: 'ללא', cls: 'text-text-secondary border-border-primary bg-bg-secondary' },
              ].map((o) => (
                <button key={o.label} onClick={() => setForm((f) => ({ ...f, bias: o.v }))}
                  className={`py-2 rounded-lg text-sm font-bold border transition-all cursor-pointer ${
                    form.bias === o.v ? o.cls : 'text-text-muted border-border-primary hover:border-border-primary/80'
                  }`}>
                  {o.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-text-muted mt-1">תיוג לונג/שורט מכניס את המטבע לסריקת סטאפ אוטומטית.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">סטטוס / הערה</label>
            <input type="text" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="לדוגמה: ממתין ליצירת LPS"
              className="w-full bg-bg-secondary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary/50" />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">מחיר יעד</label>
            <input type="number" inputMode="decimal" value={form.targetPrice} onChange={(e) => setForm((f) => ({ ...f, targetPrice: e.target.value }))}
              placeholder="לדוגמה: 3494"
              className="w-full bg-bg-secondary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary/50" dir="ltr" />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">תמונת הגרף שלי מ-TradingView (אופציונלי)</label>
            <input type="url" value={form.tvLink} onChange={(e) => setForm((f) => ({ ...f, tvLink: e.target.value }))}
              placeholder="הדבק קישור snapshot (tradingview.com/x/...)"
              className="w-full bg-bg-secondary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary/50" dir="ltr" />
            <p className="text-[10px] text-text-muted mt-1 leading-relaxed">
              ב-TradingView לחץ על <b>אייקון המצלמה</b> → <b>Copy link to the image</b>, והדבק כאן.
            </p>
          </div>
          <button onClick={saveEdit}
            className="w-full py-2.5 rounded-lg bg-accent-primary text-white text-sm font-bold hover:brightness-110 transition">
            שמור
          </button>
        </div>
      </Modal>
    </Wrapper>
  );
}
