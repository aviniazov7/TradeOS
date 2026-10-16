import { Activity, BookOpen, Bot, Eye, EyeOff, LayoutDashboard, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import { NAV, PERIODS, TICKER, formatChange, formatPrice } from './data';

const ICONS = {
  home: LayoutDashboard,
  journal: BookOpen,
  ai: Bot,
  market: Activity,
};

export function Periods({ period, onChange, className = '' }) {
  return (
    <div role="group" aria-label="תקופה" className={`dp-periods ${className}`}>
      {PERIODS.map((p) => (
        <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => onChange(p.id)}>
          {p.label}
        </button>
      ))}
    </div>
  );
}

export function EyeButton({ hidden, onClick }) {
  return (
    <button
      type="button"
      className="dp-eye"
      onClick={onClick}
      aria-pressed={hidden}
      aria-label={hidden ? 'הצגת סכומים' : 'הסתרת סכומים'}
    >
      {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );
}

export function TradeButton({ children = 'עסקה חדשה' }) {
  return (
    <button type="button" className="dp-cta">
      <Plus size={16} strokeWidth={2.4} />
      <span>{children}</span>
    </button>
  );
}

export function Ticker() {
  const loop = [...TICKER, ...TICKER];
  return (
    <div className="dp-ticker" dir="ltr" aria-label="מחירי שוק">
      <div className="dp-marquee">
        {loop.map((item, i) => {
          const up = item.change >= 0;
          return (
            <span className="dp-tick" key={`${item.symbol}-${i}`}>
              <i className={`dp-mark m-${item.symbol}`} aria-hidden>{item.symbol.slice(0, 1)}</i>
              <b>{item.label}</b>
              <span className="dp-num">${formatPrice(item.price)}</span>
              <em className={up ? 'is-up' : 'is-down'}>
                {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {formatChange(item.change)}
              </em>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function MobileNav() {
  return (
    <nav className="dp-nav" aria-label="ניווט ראשי">
      <div className="dp-nav-bar">
        {NAV.slice(0, 2).map((item) => {
          const Icon = ICONS[item.id];
          const active = item.id === 'home';
          return (
            <button key={item.id} type="button" className={active ? 'is-on' : ''} aria-current={active ? 'page' : undefined}>
              <Icon size={21} strokeWidth={active ? 2.2 : 1.7} />
              <span>{item.label}</span>
            </button>
          );
        })}
        <button type="button" className="dp-nav-plus" aria-label="עסקה חדשה">
          <Plus size={22} strokeWidth={2.4} />
        </button>
        {NAV.slice(2).map((item) => {
          const Icon = ICONS[item.id];
          return (
            <button key={item.id} type="button">
              <Icon size={21} strokeWidth={1.7} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function DeskLinks() {
  return (
    <nav className="dp-desk" aria-label="ניווט">
      {NAV.map((item) => (
        <button key={item.id} type="button" className={item.id === 'home' ? 'is-on' : ''} aria-current={item.id === 'home' ? 'page' : undefined}>
          {item.label}
        </button>
      ))}
    </nav>
  );
}
