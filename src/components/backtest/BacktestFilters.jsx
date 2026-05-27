import { useState } from 'react';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { SESSIONS } from '../../utils/constants';
import { useUserStrategies } from '../../hooks/useUserStrategies';
import SelectDropdown from '../shared/SelectDropdown';

const btnClass = (active) =>
  `px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
    active
      ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/30'
      : 'bg-bg-tertiary text-text-muted border border-border-primary hover:border-border-hover'
  }`;

const sessionOptions = SESSIONS.map((s) => ({ value: s, label: s }));

export default function BacktestFilters({ filters, onChange }) {
  const { allStrategies } = useUserStrategies('backtest');
  const [open, setOpen] = useState(false);
  const set = (key, value) => onChange({ ...filters, [key]: value });
  const toggle = (key, value) => set(key, filters[key] === value ? '' : value);
  const hasFilters = filters.search || filters.direction || filters.result || filters.strategy || filters.session;
  const activeCount = [filters.direction, filters.result, filters.strategy, filters.session].filter(Boolean).length;

  const dynStrategyOptions = allStrategies.map((s) => ({ value: s, label: s }));

  return (
    <div className="mb-4">
      {/* Mobile: Collapsible */}
      <div className="md:hidden">
        <button
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer w-full ${
            open || hasFilters ? 'bg-accent-primary/10 text-accent-primary border border-accent-primary/30' : 'bg-bg-tertiary text-text-muted border border-border-primary'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>סינון</span>
          {activeCount > 0 && (
            <span className="bg-accent-primary text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full">{activeCount}</span>
          )}
          {hasFilters && (
            <button
              onClick={(e) => { e.stopPropagation(); onChange({ search: '', direction: '', result: '', strategy: '', session: '' }); }}
              className="mr-auto p-0.5 rounded text-text-muted hover:text-loss transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </button>

        {open && (
          <div className="mt-2 bg-bg-secondary border border-border-primary rounded-xl p-3 space-y-2.5">
            <div className="flex items-center gap-1.5 bg-bg-tertiary border border-border-primary rounded-lg px-2.5 py-2">
              <Search className="w-3.5 h-3.5 text-text-muted" />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => set('search', e.target.value)}
                placeholder="חפש זוג..."
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
              <button className={`${btnClass(filters.result === 'win')} flex-1`} onClick={() => toggle('result', 'win')}>Win</button>
              <button className={`${btnClass(filters.result === 'breakeven')} flex-1`} onClick={() => toggle('result', 'breakeven')}>BE</button>
              <button className={`${btnClass(filters.result === 'loss')} flex-1`} onClick={() => toggle('result', 'loss')}>Loss</button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <SelectDropdown
                value={filters.strategy}
                onChange={(val) => set('strategy', val)}
                options={dynStrategyOptions}
                placeholder="כל האסטרטגיות"
                allowClear
                compact
              />
              <SelectDropdown
                value={filters.session}
                onChange={(val) => set('session', val)}
                options={sessionOptions}
                placeholder="כל הסשנים"
                allowClear
                compact
              />
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
            placeholder="חפש זוג..."
            className="bg-transparent text-xs text-text-primary placeholder-text-muted outline-none w-full"
          />
        </div>

        <button className={btnClass(filters.direction === 'long')} onClick={() => toggle('direction', 'long')}>Long</button>
        <button className={btnClass(filters.direction === 'short')} onClick={() => toggle('direction', 'short')}>Short</button>

        <button className={btnClass(filters.result === 'win')} onClick={() => toggle('result', 'win')}>Win</button>
        <button className={btnClass(filters.result === 'breakeven')} onClick={() => toggle('result', 'breakeven')}>BE</button>
        <button className={btnClass(filters.result === 'loss')} onClick={() => toggle('result', 'loss')}>Loss</button>

        <SelectDropdown
          value={filters.strategy}
          onChange={(val) => set('strategy', val)}
          options={dynStrategyOptions}
          placeholder="כל האסטרטגיות"
          allowClear
          compact
        />

        <SelectDropdown
          value={filters.session}
          onChange={(val) => set('session', val)}
          options={sessionOptions}
          placeholder="כל הסשנים"
          allowClear
          compact
        />

        {hasFilters && (
          <button
            onClick={() => onChange({ search: '', direction: '', result: '', strategy: '', session: '' })}
            className="p-1.5 rounded-lg text-text-muted hover:text-loss hover:bg-bg-tertiary transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
