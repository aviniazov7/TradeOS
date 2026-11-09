import { Bell, Crown, KeyRound, LayoutGrid, LineChart, Lock, Receipt, Search, SlidersHorizontal, X } from 'lucide-react';
import { SETTINGS_ALL_ID, listedSettingsSections } from './settingsCatalog';

const ICONS = {
  all: LayoutGrid,
  trading: LineChart,
  plan: Crown,
  reports: Receipt,
  notifications: Bell,
  api: KeyRound,
  general: SlidersHorizontal,
  account: Lock,
};

function navItems(query) {
  return [
    { id: SETTINGS_ALL_ID, label: 'הכל' },
    ...listedSettingsSections(query),
  ];
}

function Item({ id, label, current, onClick, chip }) {
  const Icon = ICONS[id] || LayoutGrid;
  const state = current
    ? 'bg-accent-primary/12 text-accent-hover border-accent-primary/40'
    : 'bg-bg-secondary text-text-secondary border-border-primary hover:border-border-hover hover:text-text-primary';
  const shape = chip
    ? 'shrink-0 h-11 px-3.5 rounded-full'
    : 'w-full h-11 px-3 rounded-xl';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={current ? 'true' : undefined}
      data-testid={`settings-item-${chip ? 'chip' : 'side'}-${id}`}
      className={`${shape} inline-flex items-center gap-2 border text-sm font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${state}`}
    >
      <Icon className="w-4 h-4 shrink-0" aria-hidden />
      <span>{label}</span>
    </button>
  );
}

export default function SettingsNav({ active, query, onActive, onQuery }) {
  const items = navItems(query);
  const trimmed = query.trim();
  return (
    <div className="sticky top-0 z-20 -mx-1 mb-4 bg-bg-primary/95 px-1 py-2 backdrop-blur-md lg:z-10 lg:mx-0 lg:mb-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
      <div className="relative mb-3">
        <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 right-3 text-text-muted pointer-events-none" aria-hidden />
        <input
          type="text"
          inputMode="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="חיפוש בהגדרות"
          aria-label="חיפוש בהגדרות"
          data-testid="settings-search"
          className="w-full h-11 pr-10 pl-10 rounded-xl bg-bg-secondary border border-border-primary text-sm text-text-primary outline-none focus:border-accent-primary"
        />
        {trimmed && (
          <button
            type="button"
            onClick={() => onQuery('')}
            aria-label="ניקוי חיפוש"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center rounded-lg text-text-muted hover:text-text-primary cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <nav aria-label="קטגוריות הגדרות" data-testid="settings-nav-mobile" className="lg:hidden -mx-1">
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-1 pb-1">
          {items.map((item) => (
            <Item key={item.id} {...item} chip current={item.id === active} onClick={() => onActive(item.id)} />
          ))}
        </div>
        {trimmed && items.length === 1 && (
          <p className="px-1 pt-2 text-xs text-text-muted">אין קטגוריה תואמת</p>
        )}
      </nav>

      <nav aria-label="קטגוריות הגדרות" data-testid="settings-nav-desktop" className="hidden lg:flex lg:flex-col gap-1.5">
        {items.map((item) => (
          <Item key={item.id} {...item} current={item.id === active} onClick={() => onActive(item.id)} />
        ))}
        {trimmed && items.length === 1 && (
          <p className="px-1 pt-1 text-xs text-text-muted">אין קטגוריה תואמת</p>
        )}
      </nav>
    </div>
  );
}
