import { useState } from 'react';
import { Bitcoin, Layers, Dog, Landmark, Search, X } from 'lucide-react';
import { SECTORS } from '../../utils/constants';
import { PLAN_PAIR_LIMIT, searchPlanPairs } from '../../utils/planSymbols';

const ICONS = { Bitcoin, Layers, Dog, Landmark };

// Local catalog only. PairSearchMulti also calls CoinGecko; this picker must
// stay usable in demo mode, which never touches the network.
export default function PlanSymbolPicker({ value, onChange }) {
  const selected = Array.isArray(value) ? value : [];
  const [query, setQuery] = useState('');
  const results = searchPlanPairs(query);

  const toggle = (pair) => {
    if (selected.includes(pair)) {
      onChange(selected.filter((item) => item !== pair));
      return;
    }
    if (selected.length >= PLAN_PAIR_LIMIT) return;
    onChange([...selected, pair]);
  };

  const toggleSector = (sector) => {
    const allOn = sector.coins.every((pair) => selected.includes(pair));
    if (allOn) {
      onChange(selected.filter((pair) => !sector.coins.includes(pair)));
      return;
    }
    const next = [...selected];
    for (const pair of sector.coins) {
      if (next.includes(pair) || next.length >= PLAN_PAIR_LIMIT) continue;
      next.push(pair);
    }
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {SECTORS.map((sector) => {
          const Icon = ICONS[sector.icon];
          const allOn = sector.coins.every((pair) => selected.includes(pair));
          return (
            <button
              key={sector.key}
              type="button"
              data-sector={sector.key}
              aria-pressed={allOn}
              onClick={() => toggleSector(sector)}
              className={`flex min-h-11 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium cursor-pointer ${allOn
                ? 'border-accent-primary/30 bg-accent-primary/20 text-accent-primary'
                : 'border-border-primary bg-bg-tertiary text-text-muted hover:border-accent-primary/30'}`}
            >
              {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
              {sector.label}
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((pair) => (
            <span key={pair} className="flex items-center gap-1 rounded-lg border border-accent-primary/30 bg-accent-primary/20 px-2 py-1 text-[11px] font-medium text-accent-primary">
              <span className="num-mono">{pair}</span>
              <button type="button" aria-label={`הסר ${pair}`} onClick={() => toggle(pair)} className="cursor-pointer hover:text-loss">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <label className="relative block">
        <Search className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted start-3" aria-hidden />
        <input
          data-question-input="markets"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="חפש מטבע..."
          className="min-h-11 w-full rounded-xl border border-border-primary bg-bg-tertiary ps-9 pe-3 text-sm text-text-primary outline-none focus:border-accent-primary"
        />
      </label>
      {results.length > 0 && (
        <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
          {results.map((row) => {
            const on = selected.includes(row.pair);
            return (
              <button
                key={row.pair}
                type="button"
                data-option={row.pair}
                aria-pressed={on}
                onClick={() => toggle(row.pair)}
                className={`flex min-h-11 items-center justify-between rounded-xl border px-3 text-sm cursor-pointer ${on
                  ? 'border-accent-primary/50 bg-accent-primary/15 text-text-primary'
                  : 'border-border-primary bg-bg-tertiary text-text-secondary'}`}
              >
                <span>{row.label}</span>
                <span className="num-mono text-xs">{row.pair}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
