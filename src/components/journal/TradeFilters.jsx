import { useState, useMemo } from 'react';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { useUserStrategies } from '../../hooks/useUserStrategies';
import { TAG_LABELS } from '../../utils/constants';
import SelectDropdown from '../shared/SelectDropdown';

const btnClass = (active) =>
  `px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
    active
      ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/30'
      : 'bg-bg-tertiary text-text-muted border border-border-primary hover:border-border-hover'
  }`;

const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

const EMPTY_FILTERS = { search: '', direction: '', result: '', status: '', strategy: '', tag: '', timeframe: '', month: '', from: '', to: '' };

// From–to date range on the trade's entry date (native picker: light, no
// extra bundle, and the phone's own date UI on mobile).
function DateRange({ from, to, onChange, className = '' }) {
  const input = 'h-8 bg-bg-tertiary border border-border-primary rounded-lg px-2 text-xs text-text-primary outline-none focus:border-accent-primary/50 min-w-0';
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <input type="date" aria-label="מתאריך" value={from} max={to || undefined}
        onChange={(e) => onChange('from', e.target.value)} className={`${input} flex-1`} />
      <span className="text-[11px] text-text-muted shrink-0">עד</span>
      <input type="date" aria-label="עד תאריך" value={to} min={from || undefined}
        onChange={(e) => onChange('to', e.target.value)} className={`${input} flex-1`} />
    </div>
  );
}

export default function TradeFilters({ filters, onChange, trades = [] }) {
  const { allStrategies } = useUserStrategies('journal');
  const [open, setOpen] = useState(false);
  const set = (key, value) => onChange({ ...filters, [key]: value });
  const toggle = (key, value) => set(key, filters[key] === value ? '' : value);
  const hasFilters = Object.values(filters).some(Boolean);
  // Search shows in its own box; a date range counts once.
  const activeCount = [filters.direction, filters.result, filters.status, filters.strategy, filters.tag, filters.timeframe, filters.month, filters.from || filters.to].filter(Boolean).length;

  const allTags = useMemo(() => {
    const tagSet = new Set();
    trades.forEach((t) => {
      const tags = Array.isArray(t.tags) ? t.tags : [];
      tags.forEach((tag) => tagSet.add(tag));
    });
    return [...tagSet].sort();
  }, [trades]);

  // Build month options from actual trade dates (latest first) so the dropdown
  // only shows months the user has trades in.
  const monthOptions = useMemo(() => {
    const seen = new Set();
    trades.forEach((t) => {
      const raw = t.exitDate || t.entryDate;
      if (!raw) return;
      const d = typeof raw.toDate === 'function' ? raw.toDate() : new Date(raw);
      if (isNaN(d.getTime())) return;
      seen.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    });
    return [...seen]
      .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
      .map((key) => {
        const [year, month] = key.split('-');
        return { value: key, label: `${HEBREW_MONTHS[parseInt(month, 10) - 1]} ${year}` };
      });
  }, [trades]);

  const strategyOptions = allStrategies.map((s) => ({ value: s, label: s }));
  const tagOptions = allTags.map((tag) => ({ value: tag, label: TAG_LABELS[tag] || tag }));

  return (
    <div className="mb-4">
      {/* Mobile: Collapsible */}
      <div className="md:hidden">
        {/* Toggle + clear sit side by side inside one pill — a <button> can't
            contain another <button> (invalid HTML; taps could hit the wrong one). */}
        <div
          className={`flex items-center rounded-lg text-xs font-medium transition-colors w-full ${
            open || hasFilters ? 'bg-accent-primary/10 text-accent-primary border border-accent-primary/30' : 'bg-bg-tertiary text-text-muted border border-border-primary'
          }`}
        >
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="flex-1 flex items-center gap-2 px-3 py-2 cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>סינון</span>
            {activeCount > 0 && (
              <span className="bg-accent-primary text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full">{activeCount}</span>
            )}
          </button>
          {hasFilters && (
            <button
              type="button"
              onClick={() => onChange(EMPTY_FILTERS)}
              aria-label="נקה סינון"
              className="p-2 rounded text-text-muted hover:text-loss transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {open && (
          <div className="mt-2 bg-bg-secondary border border-border-primary rounded-xl p-3 space-y-2.5">
            <div className="flex items-center gap-1.5 bg-bg-tertiary border border-border-primary rounded-lg px-2.5 py-2">
              <Search className="w-3.5 h-3.5 text-text-muted" />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => set('search', e.target.value)}
                placeholder="חיפוש: זוג, אסטרטגיה, הערה…"
                className="bg-transparent text-xs text-text-primary placeholder-text-muted outline-none w-full"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-text-muted w-12 flex-shrink-0">כיוון</span>
              <button className={`${btnClass(filters.direction === 'long')} flex-1`} onClick={() => toggle('direction', 'long')}>Long</button>
              <button className={`${btnClass(filters.direction === 'short')} flex-1`} onClick={() => toggle('direction', 'short')}>Short</button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-text-muted w-12 flex-shrink-0">תוצאה</span>
              <button className={`${btnClass(filters.result === 'win')} flex-1`} onClick={() => toggle('result', 'win')}>רווח</button>
              <button className={`${btnClass(filters.result === 'loss')} flex-1`} onClick={() => toggle('result', 'loss')}>הפסד</button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-text-muted w-12 flex-shrink-0">סטטוס</span>
              <button className={`${btnClass(filters.status === 'open')} flex-1`} onClick={() => toggle('status', 'open')}>פתוחות</button>
              <button className={`${btnClass(filters.status === 'closed')} flex-1`} onClick={() => toggle('status', 'closed')}>סגורות</button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-text-muted w-12 flex-shrink-0">תאריכים</span>
              <DateRange from={filters.from} to={filters.to} onChange={set} className="flex-1 min-w-0" />
            </div>

            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <SelectDropdown
                  value={filters.strategy}
                  onChange={(val) => set('strategy', val)}
                  options={strategyOptions}
                  placeholder="כל האסטרטגיות"
                  allowClear
                  compact
                />
              </div>

              {allTags.length > 0 && (
                <div className="flex-1 min-w-0">
                  <SelectDropdown
                    value={filters.tag}
                    onChange={(val) => set('tag', val)}
                    options={tagOptions}
                    placeholder="כל התגיות"
                    allowClear
                    compact
                  />
                </div>
              )}

              {monthOptions.length > 0 && (
                <div className="flex-1 min-w-0">
                  <SelectDropdown
                    value={filters.month}
                    onChange={(val) => set('month', val)}
                    options={monthOptions}
                    placeholder="כל החודשים"
                    allowClear
                    compact
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Desktop: Inline row */}
      <div className="hidden md:flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 bg-bg-tertiary border border-border-primary rounded-lg px-2.5 py-1.5 min-w-[140px]">
          <Search className="w-3.5 h-3.5 text-text-muted" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
            placeholder="חיפוש: זוג, אסטרטגיה, הערה…"
            className="bg-transparent text-xs text-text-primary placeholder-text-muted outline-none w-full"
          />
        </div>

        <button className={btnClass(filters.direction === 'long')} onClick={() => toggle('direction', 'long')}>Long</button>
        <button className={btnClass(filters.direction === 'short')} onClick={() => toggle('direction', 'short')}>Short</button>

        <button className={btnClass(filters.result === 'win')} onClick={() => toggle('result', 'win')}>רווח</button>
        <button className={btnClass(filters.result === 'loss')} onClick={() => toggle('result', 'loss')}>הפסד</button>

        <button className={btnClass(filters.status === 'open')} onClick={() => toggle('status', 'open')}>פתוחות</button>
        <button className={btnClass(filters.status === 'closed')} onClick={() => toggle('status', 'closed')}>סגורות</button>

        <DateRange from={filters.from} to={filters.to} onChange={set} className="w-[17rem]" />

        <SelectDropdown
          value={filters.strategy}
          onChange={(val) => set('strategy', val)}
          options={strategyOptions}
          placeholder="כל האסטרטגיות"
          allowClear
          compact
        />

        {allTags.length > 0 && (
          <SelectDropdown
            value={filters.tag}
            onChange={(val) => set('tag', val)}
            options={tagOptions}
            placeholder="כל התגיות"
            allowClear
            compact
          />
        )}

        {monthOptions.length > 0 && (
          <SelectDropdown
            value={filters.month}
            onChange={(val) => set('month', val)}
            options={monthOptions}
            placeholder="כל החודשים"
            allowClear
            compact
          />
        )}

        {filters.timeframe && (
          <button onClick={() => set('timeframe', '')} className={`${btnClass(true)} flex items-center gap-1`}>
            {filters.timeframe} <X className="w-3 h-3" />
          </button>
        )}

        {hasFilters && (
          <button
            onClick={() => onChange(EMPTY_FILTERS)}
            className="p-1.5 rounded-lg text-text-muted hover:text-loss hover:bg-bg-tertiary transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
