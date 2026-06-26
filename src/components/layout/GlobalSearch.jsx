import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, CornerDownLeft, LayoutDashboard, BookOpen, Brain, FlaskConical,
  Coins, Wallet, ClipboardList, Activity, Bot, Newspaper, Crown, User, Building2,
} from 'lucide-react';
import { getUserCollectionDocs } from '../../services/firestoreService';
import { useAuth } from '../../contexts/AuthContext';

// All navigable pages — shown as the default list, and matched by label/keywords.
const PAGES = [
  { label: 'דשבורד', path: '/', icon: LayoutDashboard, kw: 'בית home dashboard ראשי' },
  { label: 'יומן מסחר', path: '/journal', icon: BookOpen, kw: 'עסקאות trades journal' },
  { label: 'האזור המנטלי', path: '/mentality', icon: Brain, kw: 'מנטל פסיכולוגיה mentality mindset' },
  { label: 'בקטסט', path: '/backtest', icon: FlaskConical, kw: 'backtest' },
  { label: 'מעקב DCA', path: '/dca', icon: Coins, kw: 'dca' },
  { label: 'ארנקים', path: '/wallets', icon: Wallet, kw: 'wallets ארנק יתרה' },
  { label: 'תוכניות מסחר', path: '/plans', icon: ClipboardList, kw: 'plans תוכנית' },
  { label: 'סקירת שוק', path: '/market', icon: Activity, kw: 'market שוק' },
  { label: 'TradeAI', path: '/trade-ai', icon: Bot, kw: 'ai בינה מלאכותית' },
  { label: 'חדשות', path: '/news', icon: Newspaper, kw: 'news' },
  { label: 'בורסות', path: '/exchange', icon: Building2, kw: 'exchange חיבור api מפתח' },
  { label: 'שדרוג Premium', path: '/premium', icon: Crown, kw: 'premium פרימיום שדרוג' },
  { label: 'פרופיל', path: '/profile', icon: User, kw: 'profile הגדרות settings חשבון' },
];

// Firestore collections searched for content matches; each maps to the page it lives on.
const SEARCHABLE = [
  { key: 'trades', label: 'יומן מסחר', icon: BookOpen, path: '/journal', fields: ['pair', 'strategy', 'notes', 'entryReason'] },
  { key: 'tradingPlans', label: 'תוכניות מסחר', icon: ClipboardList, path: '/plans', fields: ['name', 'description', 'entryRules', 'exitRules', 'notes'] },
  { key: 'backtests', label: 'בקטסטים', icon: FlaskConical, path: '/backtest', fields: ['pair', 'strategy', 'notes'] },
];

function SectionLabel({ children }) {
  return <div className="px-4 pt-3 pb-1 text-[10px] font-semibold tracking-wide text-text-muted">{children}</div>;
}

function Row({ item, active, onClick, onHover }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseMove={onHover}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-right transition-colors cursor-pointer ${
        active ? 'bg-accent-primary/12' : 'hover:bg-bg-tertiary'
      }`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-accent-primary' : 'text-text-muted'}`} />
      <span className={`flex-1 text-sm truncate ${active ? 'text-accent-primary font-medium' : 'text-text-primary'}`}>
        {item.title}
      </span>
      <span className="text-[10px] text-text-muted shrink-0 bg-bg-tertiary rounded px-1.5 py-0.5">
        {item.page}
      </span>
    </button>
  );
}

export default function GlobalSearch() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [allData, setAllData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const loadData = async () => {
    if (allData || !user) return;
    setLoading(true);
    const data = {};
    for (const { key } of SEARCHABLE) {
      try { data[key] = await getUserCollectionDocs(user.uid, key); } catch { data[key] = []; }
    }
    setAllData(data);
    setLoading(false);
  };

  const openPalette = () => { setOpen(true); setQuery(''); setActive(0); loadData(); };
  const close = () => setOpen(false);

  // ⌘K / Ctrl+K to toggle, Esc to close
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => {
          if (!o) { setQuery(''); setActive(0); loadData(); }
          return !o;
        });
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, allData]);

  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  const q = query.trim().toLowerCase();

  const pageItems = useMemo(() => {
    const list = q ? PAGES.filter((p) => `${p.label} ${p.kw}`.toLowerCase().includes(q)) : PAGES;
    return list.map((p) => ({ kind: 'page', title: p.label, page: 'דף', path: p.path, icon: p.icon }));
  }, [q]);

  const contentItems = useMemo(() => {
    if (!q || !allData) return [];
    const found = [];
    for (const cfg of SEARCHABLE) {
      for (const item of allData[cfg.key] || []) {
        const match = cfg.fields.some((f) => item[f] && String(item[f]).toLowerCase().includes(q));
        if (match) {
          found.push({
            kind: 'content',
            title: item.pair || item.name || item.title || cfg.label,
            page: cfg.label,
            path: cfg.path,
            icon: cfg.icon,
          });
        }
        if (found.length >= 24) break;
      }
    }
    return found.slice(0, 24);
  }, [q, allData]);

  const items = useMemo(() => [...pageItems, ...contentItems], [pageItems, contentItems]);

  useEffect(() => { setActive(0); }, [query]);

  // Keep the highlighted row in view during keyboard navigation.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${active}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const select = (it) => { if (!it) return; navigate(it.path); close(); };

  const onInputKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); select(items[active]); }
  };

  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        title="חיפוש (⌘K)"
        className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer shrink-0"
      >
        <Search className="w-5 h-5" />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <>
              <motion.div
                className="fixed inset-0 z-[80] bg-black/60"
                style={{ backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                onClick={close}
              />
              <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[12vh] px-4 pointer-events-none">
                <motion.div
                  initial={{ opacity: 0, y: -14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -14, scale: 0.98 }}
                  transition={{ type: 'spring', damping: 26, stiffness: 340, mass: 0.8 }}
                  className="pointer-events-auto w-full max-w-xl rounded-2xl overflow-hidden"
                  style={{
                    background: 'var(--color-bg-solid)',
                    border: '1px solid rgba(0,191,255,0.25)',
                    boxShadow: '0 28px 70px rgba(0,0,0,0.6), 0 0 30px rgba(0,191,255,0.12)',
                  }}
                >
                  {/* Input */}
                  <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border-primary">
                    <Search className="w-4 h-4 text-accent-primary shrink-0" />
                    <input
                      ref={inputRef}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={onInputKey}
                      placeholder="חפש דף, עסקה, תוכנית, אסטרטגיה..."
                      className="flex-1 bg-transparent outline-none text-sm text-text-primary placeholder-text-muted"
                    />
                    <kbd className="text-[10px] text-text-muted border border-border-primary rounded px-1.5 py-0.5">ESC</kbd>
                  </div>

                  {/* Results */}
                  <div ref={listRef} className="max-h-[58vh] overflow-y-auto py-1">
                    {pageItems.length > 0 && <SectionLabel>{q ? 'דפים' : 'כל הדפים'}</SectionLabel>}
                    {pageItems.map((it, i) => (
                      <div data-idx={i} key={`p-${it.path}`}>
                        <Row item={it} active={active === i} onClick={() => select(it)} onHover={() => setActive(i)} />
                      </div>
                    ))}

                    {q && contentItems.length > 0 && <SectionLabel>תוצאות באפליקציה</SectionLabel>}
                    {contentItems.map((it, i) => {
                      const idx = pageItems.length + i;
                      return (
                        <div data-idx={idx} key={`c-${i}`}>
                          <Row item={it} active={active === idx} onClick={() => select(it)} onHover={() => setActive(idx)} />
                        </div>
                      );
                    })}

                    {loading && <div className="px-4 py-6 text-center text-xs text-text-muted">טוען...</div>}
                    {!loading && q && items.length === 0 && (
                      <div className="px-4 py-8 text-center text-sm text-text-muted">לא נמצאו תוצאות</div>
                    )}
                  </div>

                  {/* Footer hint */}
                  <div className="flex items-center gap-4 px-4 py-2 border-t border-border-primary text-[10px] text-text-muted">
                    <span className="flex items-center gap-1"><CornerDownLeft className="w-3 h-3" /> פתיחה</span>
                    <span>↑↓ ניווט</span>
                    <span className="mr-auto">⌘K</span>
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
