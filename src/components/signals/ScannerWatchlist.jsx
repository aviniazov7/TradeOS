import { useState, useEffect, useRef, useCallback } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { Star, Plus, Trash2, ExternalLink, Search, Pencil, Target, ChevronDown, TrendingUp, TrendingDown } from 'lucide-react';
import { searchCoins, fetchPrices } from '../../services/coingeckoApi';
import { useWatchlist } from '../../hooks/useWatchlist';
import { MAX_SCAN_TAGS } from '../../utils/wyckoff';
import Modal from '../shared/Modal';
import RollingNumber from '../shared/RollingNumber';
import toast from 'react-hot-toast';
import { LRM } from '../../utils/formatters';

// Aliased so the linter sees the import used (it does not track <m.x> in JSX).
const MotionDiv = m.div;

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
// Long/short tag → opts the coin into the Wyckoff scanner.
const BIAS = {
  long: { label: 'לונג' },
  short: { label: 'שורט' },
};
const isTagged = (b) => b === 'long' || b === 'short';

// Two-segment long/short switch. Clicking the active side clears the tag.
function BiasToggle({ bias, onSet }) {
  const seg = (v, Icon, on) => {
    const active = bias === v;
    return (
      <button
        type="button"
        onClick={() => onSet(active ? null : v)}
        aria-pressed={active}
        title={active ? `${BIAS[v].label} · לחץ להסרת התיוג` : `תייג ${BIAS[v].label} — ייכנס לסריקה`}
        aria-label={BIAS[v].label}
        className={`w-7 h-7 grid place-items-center rounded-md transition-colors cursor-pointer ${
          active ? on : 'text-text-muted/60 hover:text-text-primary hover:bg-bg-tertiary'
        }`}
      >
        <Icon className="w-3.5 h-3.5" />
      </button>
    );
  };
  return (
    <div className="shrink-0 inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-border-primary bg-bg-tertiary">
      {seg('long', TrendingUp, 'bg-profit/15 text-profit')}
      {seg('short', TrendingDown, 'bg-loss/15 text-loss')}
    </div>
  );
}

// The scan universe: coins the owner watches, tagged long/short to opt them
// into the engine. Compact side panel on desktop; on narrower screens it
// collapses to its header row.
export default function ScannerWatchlist() {
  const { items, loading, addItem, updateItem, removeItem } = useWatchlist();
  const [open, setOpen] = useState(false);
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
      toast.error('המטבע כבר בסריקה');
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
      toast.success(`${coin.symbol} נוסף לסריקה`);
      setQuery(''); setResults([]); setShowResults(false);
    } catch { toast.error('הוספה נכשלה'); }
    finally { setAdding(false); }
  };

  // Quick tag from the row — same cap and same write as before (bias field).
  const setBias = async (it, bias) => {
    const wasTagged = isTagged(it.bias);
    const willTag = isTagged(bias);
    if (willTag && !wasTagged) {
      const tagged = items.filter((i) => isTagged(i.bias)).length;
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
    const wasTagged = isTagged(editing.bias);
    const willTag = isTagged(form.bias);
    if (willTag && !wasTagged) {
      const tagged = items.filter((i) => isTagged(i.bias)).length;
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
  const removeEditing = async () => {
    if (!editing) return;
    await removeItem(editing.id);
    setEditing(null);
  };

  const taggedCount = items.filter((i) => isTagged(i.bias)).length;
  const editingChart = editing ? (safeUrl(editing.tvLink) || genericTvUrl(editing.symbol)) : null;

  return (
    <section className="rounded-2xl border border-border-primary bg-bg-secondary">
      {/* Header — the collapse toggle below xl; a plain title from xl up */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-right cursor-pointer xl:cursor-default"
      >
        <Star className="w-4 h-4 text-accent-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-text-primary">מטבעות במעקב</h2>
          <p className="text-[11px] text-text-muted truncate">תיוג לונג / שורט מכניס מטבע לסריקה</p>
        </div>
        <span className="shrink-0 num-mono text-[11px] font-semibold px-2 py-0.5 rounded-full bg-bg-tertiary border border-border-primary text-text-secondary" title="מתויגים לסריקה / מקסימום">
          {taggedCount}/{MAX_SCAN_TAGS}
        </span>
        <ChevronDown className={`w-4 h-4 text-text-muted shrink-0 transition-transform xl:hidden ${open ? 'rotate-180' : ''}`} />
      </button>

      <div className={`${open ? 'block' : 'hidden'} xl:block border-t border-border-primary`}>
        {/* Add coin */}
        <div className="relative p-3" ref={searchRef}>
          <div className="flex items-center gap-2 bg-bg-tertiary border border-border-primary rounded-xl px-3 py-2 focus-within:border-accent-primary/50 transition-colors">
            <Search className="w-4 h-4 text-text-muted shrink-0" />
            <input
              type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              onFocus={() => results.length && setShowResults(true)}
              placeholder="הוסף מטבע…"
              aria-label="חפש מטבע להוספה"
              className="bg-transparent text-sm text-text-primary placeholder-text-muted outline-none w-full min-w-0"
            />
            {adding && <span className="text-[11px] text-text-muted shrink-0">מוסיף…</span>}
          </div>
          <AnimatePresence>
            {showResults && results.length > 0 && (
              <MotionDiv initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                className="absolute z-50 top-full -mt-1 inset-x-3 bg-bg-overlay border border-border-primary rounded-xl shadow-xl overflow-hidden">
                {results.map((coin) => (
                  <button key={coin.coingeckoId} onClick={() => handleAdd(coin)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-bg-tertiary transition-colors cursor-pointer text-right">
                    {coin.thumb && <img src={coin.thumb} alt="" className="w-5 h-5 rounded-full" />}
                    <span className="text-text-primary font-medium truncate">{coin.name}</span>
                    <span className="text-text-muted text-xs">{coin.symbol}</span>
                    <Plus className="w-4 h-4 text-accent-primary mr-auto shrink-0" />
                  </button>
                ))}
              </MotionDiv>
            )}
          </AnimatePresence>
        </div>

        {/* Rows */}
        {loading ? (
          <div className="px-3 pb-3 space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-11 rounded-xl bg-bg-tertiary animate-pulse" />)}
          </div>
        ) : items.length === 0 ? (
          <p className="px-4 pb-4 text-[12px] text-text-muted leading-relaxed">
            אין מטבעות במעקב. חפש מטבע, ותייג אותו לונג או שורט.
          </p>
        ) : (
          <div className="border-t border-border-primary">
            <AnimatePresence initial={false}>
              {items.map((it) => {
                const live = prices[it.coingeckoId];
                const cur = live?.usd;
                const ch24 = live?.usd_24h_change;
                const chartUrl = safeUrl(it.tvLink) || genericTvUrl(it.symbol);
                const thumbUrl = safeUrl(it.thumb);
                const b = isTagged(it.bias) ? it.bias : null;
                return (
                  <MotionDiv key={it.id}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
                    dir="ltr"
                    className="group relative flex items-center gap-2 px-3 py-2 border-b border-border-primary/50 last:border-b-0 hover:bg-bg-tertiary/60 transition-colors"
                  >
                    <BiasToggle bias={b} onSet={(v) => setBias(it, v)} />

                    {thumbUrl
                      ? <img src={thumbUrl} alt="" className="w-6 h-6 rounded-full shrink-0" />
                      : <span className="w-6 h-6 rounded-full bg-bg-tertiary grid place-items-center text-[9px] font-bold text-text-secondary shrink-0">{it.symbol?.slice(0, 3)?.toUpperCase()}</span>}

                    {/* Symbol — tap to edit (the only way in on touch screens) */}
                    <button type="button" onClick={() => openEdit(it)} className="min-w-0 flex-1 text-left cursor-pointer" title="עריכה">
                      <span className="flex items-center gap-1 min-w-0">
                        <span className="text-[13px] font-bold text-text-primary truncate">{it.symbol?.toUpperCase()}</span>
                        <span className="text-[10px] text-text-muted shrink-0">USDT.P</span>
                        {it.targetPrice != null && <Target className="w-3 h-3 text-accent-primary shrink-0" aria-label={`יעד ${fmtPrice(it.targetPrice)}`} />}
                      </span>
                      <span dir="auto" className="block text-left text-[10.5px] text-text-muted truncate">{it.note || it.name}</span>
                    </button>

                    <div className="text-right shrink-0">
                      <p className="text-[13px] font-semibold num-mono text-text-primary leading-none"><RollingNumber value={fmtPrice(cur)} /></p>
                      {ch24 != null && (
                        <p className={`text-[10.5px] font-semibold num-mono mt-0.5 ${ch24 >= 0 ? 'text-profit' : 'text-loss'}`}>
                          {LRM}{ch24 >= 0 ? '+' : ''}{ch24.toFixed(2)}%
                        </p>
                      )}
                    </div>

                    {/* Hover actions — pointer devices only; on touch the row's symbol opens the editor */}
                    <div className="hidden [@media(hover:hover)]:flex absolute right-2 top-1/2 -translate-y-1/2 items-center gap-0.5 p-0.5 rounded-lg border border-border-primary bg-bg-solid backdrop-blur opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                      <a href={chartUrl} target="_blank" rel="noopener noreferrer" className="p-1 rounded-md text-text-muted hover:text-accent-primary hover:bg-accent-primary/10 transition-colors" title={it.tvLink ? 'הגרף שלי' : 'פתח ב-TradingView'}>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button onClick={() => openEdit(it)} className="p-1 rounded-md text-text-muted hover:text-accent-primary hover:bg-accent-primary/10 transition-colors cursor-pointer" title="ערוך">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => removeItem(it.id)} className="p-1 rounded-md text-text-muted hover:text-loss hover:bg-loss/10 transition-colors cursor-pointer" title="הסר">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </MotionDiv>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

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
            className="w-full py-2.5 rounded-lg bg-accent-primary text-white text-sm font-bold hover:brightness-110 transition cursor-pointer">
            שמור
          </button>
          {/* Row actions, reachable on touch screens too */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-border-primary">
            {editingChart && (
              <a href={editingChart} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold text-text-secondary hover:text-accent-primary hover:bg-accent-primary/10 transition-colors">
                <ExternalLink className="w-3.5 h-3.5" /> {editing?.tvLink ? 'הגרף שלי' : 'פתח ב-TradingView'}
              </a>
            )}
            <button type="button" onClick={removeEditing}
              className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold text-text-muted hover:text-loss hover:bg-loss/10 transition-colors cursor-pointer">
              <Trash2 className="w-3.5 h-3.5" /> הסר מהמעקב
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
