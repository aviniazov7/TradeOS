import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Plus, Trash2, ExternalLink, Search, TrendingUp, TrendingDown, Pencil, Target } from 'lucide-react';
import { searchCoins, fetchPrices } from '../../services/coingeckoApi';
import { useWatchlist } from '../../hooks/useWatchlist';
import { pageVariants, pageTransition } from '../../utils/animations';
import EmptyState from '../shared/EmptyState';
import Modal from '../shared/Modal';
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
// Derive a preview IMAGE from the user's link. A TradingView *snapshot* link
// (camera icon → tradingview.com/x/{ID}/) maps to a public PNG on s3; a direct
// image URL is used as-is. A plain interactive /chart/ link has no image.
function previewImage(link) {
  const safe = safeUrl(link);
  if (!safe) return null;
  if (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(safe)) return safe;
  const m = safe.match(/tradingview\.com\/x\/([A-Za-z0-9]+)/);
  if (m) { const id = m[1]; return `https://s3.tradingview.com/snapshots/${id[0].toLowerCase()}/${id}.png`; }
  return null;
}

export default function WatchlistPage({ embedded = false }) {
  const { items, loading, addItem, updateItem, removeItem } = useWatchlist();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [adding, setAdding] = useState(false);
  const [prices, setPrices] = useState({});
  const [editing, setEditing] = useState(null); // item being edited
  const [form, setForm] = useState({ note: '', targetPrice: '', tvLink: '' });
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
        thumb: coin.thumb || null, addedPrice, note: '', targetPrice: null, tvLink: '',
      });
      toast.success(`${coin.symbol} נוסף למעקב`);
      setQuery(''); setResults([]); setShowResults(false);
    } catch { toast.error('הוספה נכשלה'); }
    finally { setAdding(false); }
  };

  const openEdit = (it) => {
    setEditing(it);
    setForm({ note: it.note || '', targetPrice: it.targetPrice ?? '', tvLink: it.tvLink || '' });
  };
  const saveEdit = async () => {
    if (!editing) return;
    const target = form.targetPrice === '' ? null : Number(form.targetPrice);
    await updateItem(editing.id, {
      note: form.note.trim(),
      targetPrice: Number.isFinite(target) ? target : null,
      tvLink: form.tvLink.trim(),
    });
    toast.success('עודכן');
    setEditing(null);
  };

  const Wrapper = embedded ? 'div' : motion.div;
  const wrapperProps = embedded
    ? {}
    : { variants: pageVariants, initial: 'initial', animate: 'animate', exit: 'exit', transition: pageTransition };

  return (
    <Wrapper {...wrapperProps} className="max-w-5xl mx-auto px-1 py-2">
      {/* Title — hidden when embedded as a market tab (the tab label already says it) */}
      {!embedded && (
        <div className="flex items-center gap-2 mb-4">
          <Star className="w-5 h-5 text-accent-primary" />
          <h1 className="text-lg font-bold text-text-primary">מעקב מטבעות</h1>
          <span className="text-xs text-text-muted">({items.length})</span>
        </div>
      )}

      {/* Add coin */}
      <div className="relative max-w-md mb-6" ref={searchRef}>
        <div className="flex items-center gap-2 bg-bg-secondary border border-border-primary rounded-xl px-4 py-3 focus-within:border-accent-primary/50 transition-colors">
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

      {/* Cards */}
      {loading ? (
        <p className="text-sm text-text-muted text-center py-10">טוען…</p>
      ) : items.length === 0 ? (
        <EmptyState icon={Star} title="אין מטבעות במעקב"
          description="הוסף מטבע שאתה מנתח כדי לעקוב אחרי המחיר, לרשום סטטוס ויעד, ולפתוח את הגרף שלך בלחיצה." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <AnimatePresence>
            {items.map((it) => {
              const live = prices[it.coingeckoId];
              const cur = live?.usd;
              const ch24 = live?.usd_24h_change;
              const sinceAdd = (cur != null && it.addedPrice) ? ((cur - it.addedPrice) / it.addedPrice) * 100 : null;
              const toTarget = (cur != null && cur !== 0 && it.targetPrice) ? ((it.targetPrice - cur) / cur) * 100 : null;
              const chartUrl = safeUrl(it.tvLink) || genericTvUrl(it.symbol);
              const preview = previewImage(it.tvLink);
              const thumbUrl = safeUrl(it.thumb);
              return (
                <motion.div key={it.id} layout
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
                  className="bento-card p-4 group">
                  {/* head */}
                  <div className="flex items-center gap-2.5 mb-3">
                    {thumbUrl
                      ? <img src={thumbUrl} alt="" className="w-8 h-8 rounded-full shrink-0" />
                      : <span className="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center text-[11px] font-bold text-text-secondary shrink-0">{it.symbol?.slice(0, 3)}</span>}
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-text-primary truncate">{it.symbol}</p>
                      <p className="text-[11px] text-text-muted truncate">{it.name}</p>
                    </div>
                    <div className="mr-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(it)} className="p-1.5 rounded-md text-text-muted hover:text-accent-primary hover:bg-accent-primary/10 transition-colors" title="ערוך">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => removeItem(it.id)} className="p-1.5 rounded-md text-text-muted hover:text-loss hover:bg-loss/10 transition-colors" title="הסר">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* price + change metrics with CLEAR labels */}
                  <div className="flex items-end justify-between mb-3">
                    <div>
                      <p className="text-lg font-bold num-mono text-text-primary leading-none">{fmtPrice(cur)}</p>
                      {ch24 != null && (
                        <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold mt-1 ${ch24 >= 0 ? 'text-profit' : 'text-loss'}`}>
                          {ch24 >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {ch24 >= 0 ? '+' : ''}{ch24.toFixed(2)}%
                          <span className="text-text-muted font-normal">· 24h</span>
                        </span>
                      )}
                    </div>
                    {it.addedPrice != null && sinceAdd != null && (
                      <div className="text-left">
                        <p className="text-[9px] text-text-muted">מאז הוספה</p>
                        <p className={`text-xs font-semibold num-mono ${sinceAdd >= 0 ? 'text-profit' : 'text-loss'}`}>
                          {sinceAdd >= 0 ? '+' : ''}{sinceAdd.toFixed(2)}%
                        </p>
                      </div>
                    )}
                  </div>

                  {/* target price */}
                  {it.targetPrice != null && (
                    <div className="flex items-center justify-between text-[11px] mb-2 bg-accent-primary/8 rounded-lg px-2.5 py-1.5">
                      <span className="flex items-center gap-1 text-text-secondary"><Target className="w-3 h-3 text-accent-primary" /> יעד: <span className="num-mono font-semibold text-text-primary">{fmtPrice(it.targetPrice)}</span></span>
                      {toTarget != null && (
                        <span className="text-text-muted num-mono">{toTarget >= 0 ? '+' : ''}{toTarget.toFixed(1)}% ליעד</span>
                      )}
                    </div>
                  )}

                  {/* status / note */}
                  {it.note ? (
                    <p className="text-[11px] text-text-secondary mb-3 bg-bg-tertiary/50 rounded-lg px-2.5 py-1.5">{it.note}</p>
                  ) : null}

                  {/* Preview of the user's own chart snapshot, if provided */}
                  {preview && (
                    <a href={chartUrl} target="_blank" rel="noopener noreferrer" className="block mb-2 rounded-lg overflow-hidden border border-border-primary">
                      <img
                        src={preview} alt={`${it.symbol} chart`} loading="lazy"
                        className="w-full h-32 object-cover hover:opacity-90 transition-opacity"
                        onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
                      />
                    </a>
                  )}

                  <a href={chartUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-xs font-semibold text-accent-primary bg-accent-primary/10 hover:bg-accent-primary/15 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" /> {it.tvLink ? 'הגרף שלי' : 'פתח ב-TradingView'}
                  </a>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Edit modal */}
      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={`עריכת ${editing?.symbol || ''}`} maxWidth="max-w-md">
        <div className="space-y-4">
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
              כדי לראות תצוגה מקדימה של הניתוח שלך: ב-TradingView לחץ על <b>אייקון המצלמה</b> (Take a snapshot) → <b>Copy link to the image</b>, והדבק כאן.
              קישור צ'ארט רגיל (chart/?symbol=...) יעבוד ככפתור — אבל בלי תמונה.
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
