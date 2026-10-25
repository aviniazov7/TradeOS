import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { scoreReady, streakDaysLabel, MIN_SCORE_TRADES, profitFactorText, winRateText } from '../../utils/homeStats';
import { FlaskConical, ClipboardList, Coins, Sunrise, Moon, ChevronLeft, RefreshCw, Percent, Scale, Flame } from 'lucide-react';
import Card from '../shared/Card';
import CoinIcon from '../shared/CoinIcon';
import FitText from '../shared/FitText';
import RollingNumber from '../shared/RollingNumber';
import { formatCurrency, formatCurrencyShort, formatCompactUsd, formatRelativeTime, LRM } from '../../utils/formatters';
import { safePnl, tradeRMultiple } from '../../utils/calculations';

// The home page's sections, all on the same surface: rounded-2xl cards, a
// bold title + a quiet link, big tabular numbers, one thin colour bar.

export function HomePanel({ title, link, onLink, className = '', children }) {
  return (
    <Card className={`rounded-2xl p-4 md:p-5 ${className}`}>
      {(title || link) && (
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-[15px] font-bold text-text-primary">{title}</h2>
          {link && (
            <button type="button" onClick={onLink} className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-accent-hover hover:text-accent-primary cursor-pointer">
              {link} <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
      {children}
    </Card>
  );
}

function Badge({ children, down = false }) {
  return (
    <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full ${down ? 'bg-[#3a1d24] text-[#ff8d8d]' : 'bg-[#c6f36b] text-[#17210c]'}`}>
      {children}
    </span>
  );
}

function DarkKpi({ icon: Icon, label, value, badge, delay = 0, mono = true }) {
  return (
    <article className="dash-card rise-in relative overflow-hidden rounded-2xl border p-4 md:p-5 min-h-[148px] flex flex-col" style={{ animationDelay: `${delay}s` }}>
      <div className="flex items-start justify-between gap-2">
        <span className="w-8 h-8 rounded-full grid place-items-center text-white" style={{ background: '#3b5bfd' }}>
          <Icon className="w-4 h-4" />
        </span>
        {badge}
      </div>
      <FitText as="b" min={16} className={`${mono ? 'num-mono' : ''} mt-auto pt-4 text-[28px] md:text-[32px] font-extrabold leading-none text-text-primary`} dir={mono ? 'ltr' : undefined} style={mono ? { textAlign: 'right' } : undefined}>
        {value}
      </FitText>
      <span className="mt-2 text-[13px] text-text-secondary">{label}</span>
    </article>
  );
}

// Four separate cards: a blue headline for net P&L, then three dark tiles.
export function HomeKpis({ kpi, hidden, returnPct = null }) {
  const m = (v) => (hidden ? '••••' : v);
  const {
    netPnl = 0, tradeCount = 0,
    winRate = 0, wins = 0, losses = 0,
    profitFactor = 0, streakDays = { current: 0 }, streakTrades = { current: 0, best: 0, win: true },
  } = kpi || {};
  const decided = wins + losses;
  const empty = decided === 0;
  const pf = Number.isFinite(profitFactor) ? profitFactor : null;
  const pfBadge = pf == null ? 'בלי הפסד' : pf < 1 ? 'חלש' : pf < 1.5 ? 'בסדר' : 'חזק';
  const streakWin = streakTrades.win;
  const n = streakTrades.current;

  const retDown = returnPct != null && returnPct < 0;
  const retLabel = returnPct == null ? null : `${returnPct > 0 ? '+' : ''}${returnPct.toFixed(1)}%`;
  return (
    <section aria-label="מדדים" data-testid="home-glance" className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      <article className="kpi-hero rise-in relative overflow-hidden rounded-2xl p-4 md:p-5 min-h-[148px] flex flex-col col-span-2 xl:col-span-1">
        <span aria-hidden className="absolute -left-6 -bottom-8 w-28 h-28 rounded-full bg-white/10" />
        <span aria-hidden className="absolute left-8 -bottom-10 w-16 h-16 rounded-full bg-white/10" />
        <div className="relative flex justify-end">
          {retLabel ? <Badge down={retDown}>{m(retLabel)}</Badge> : <Badge>{tradeCount} עסקאות</Badge>}
        </div>
        <FitText as="b" min={18} className="relative num-mono mt-auto pt-6 text-[34px] md:text-[40px] font-extrabold leading-none text-white" dir="ltr" style={{ textAlign: 'right' }}>
          <RollingNumber value={m(formatCurrencyShort(netPnl))} />
        </FitText>
        <span className="relative mt-2 text-sm font-medium text-white/80">רווח/הפסד · {tradeCount} עסקאות סגורות</span>
      </article>
      <DarkKpi
        delay={0.12}
        icon={Percent}
        label="אחוז הצלחה"
        value={<RollingNumber value={winRateText(winRate, wins, losses)} />}
        badge={<Badge down={decided > 0 && winRate < 50}>{empty ? '—' : `${wins}/${decided}`}</Badge>}
      />
      <DarkKpi
        delay={0.24}
        icon={Scale}
        label="פקטור רווח"
        value={<RollingNumber value={profitFactorText(pf, wins, losses)} />}
        badge={<Badge down={pf != null && pf < 1}>{empty ? '—' : pfBadge}</Badge>}
      />
      <DarkKpi
        delay={0.36}
        icon={Flame}
        label="רצף נוכחי"
        mono={false}
        value={n === 0 ? 'אין עדיין' : n === 1 ? (streakWin ? 'רווח אחד' : 'הפסד אחד') : `${n} ${streakWin ? 'רווחים' : 'הפסדים'}`}
        badge={<Badge down={!streakWin && n > 0}>{streakDaysLabel(streakDays.current)}</Badge>}
      />
    </section>
  );
}

const pnlOf = safePnl;
// Signed R against the risk taken at entry (original stop) — the same R as the
// journal and the home average, so a stop trailed to breakeven keeps its R.
const rMultiple = tradeRMultiple;

// The last five closed trades, each with its real coin logo.
export function RecentTradesCard({ trades, hidden, className = '' }) {
  const navigate = useNavigate();
  const m = (v) => (hidden ? '••••' : v);
  const maxAbs = Math.max(1, ...trades.map((t) => Math.abs(pnlOf(t))));
  return (
    <HomePanel title="עסקאות אחרונות" link="ליומן המסחר" onLink={() => navigate('/journal')} className={className}>
      {trades.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-sm text-text-secondary">אין עסקאות סגורות עדיין</p>
          <button type="button" onClick={() => navigate('/journal?new=1')} className="mt-3 h-9 px-3 rounded-lg text-sm font-bold text-accent-hover hover:bg-accent-primary/10 cursor-pointer">
            רשום עסקה
          </button>
        </div>
      ) : (
        <div className="-mt-1">
          {trades.map((t) => {
            const p = pnlOf(t);
            const r = rMultiple(t);
            const long = t.direction !== 'short';
            return (
              <button key={t.id} type="button" onClick={() => navigate('/journal')}
                className="w-full flex items-center gap-3 py-2.5 border-t border-border-primary/70 first:border-t-0 text-right cursor-pointer hover:bg-bg-tertiary/40 rounded-lg transition-colors">
                <span className="w-9 h-9 rounded-full bg-bg-tertiary border border-border-primary grid place-items-center shrink-0">
                  <CoinIcon pair={t.pair || t.symbol} assetClass={t.assetClass} className="w-6 h-6" />
                </span>
                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="flex items-center gap-2 min-w-0">
                    <FitText className="text-sm font-bold text-text-primary flex-initial" dir="ltr">{t.pair || t.symbol}</FitText>
                    <span className={`shrink-0 text-[10px] font-extrabold px-1.5 py-0.5 rounded ${long ? 'bg-long/15 text-long' : 'bg-short/15 text-short'}`}>{long ? 'LONG' : 'SHORT'}</span>
                  </span>
                  <span className="text-xs text-text-secondary">
                    {formatRelativeTime(t.exitDate || t.entryDate)}
                    {r != null && <> · <span dir="ltr">{LRM}{r > 0 ? '+' : ''}{r.toFixed(1)}R</span></>}
                  </span>
                  <span className="mt-1.5 block h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(127,127,140,0.28)' }}>
                    <span className="block h-full rounded-full" style={{ width: `${(Math.abs(p) / maxAbs) * 100}%`, background: '#3b5bfd' }} />
                  </span>
                </span>
                <FitText as="b" className={`num-mono text-[15px] shrink-0 max-w-[45%] ${p > 0 ? 'text-profit' : p < 0 ? 'text-loss' : 'text-text-secondary'}`} dir="ltr" style={{ width: 'auto' }}>
                  <RollingNumber value={m(formatCurrency(p))} />
                </FitText>
              </button>
            );
          })}
        </div>
      )}
    </HomePanel>
  );
}

// The performance score as one number + a bar per ingredient, with the
// weakest one called out — easier to read than a radar.
export function ScoreCard({ metrics, score, sampleSize = 0, className = '' }) {
  // A grade on 1–4 trades is noise ("מצוין" after a single win), so hold it
  // back and say how far the user is from a meaningful one.
  if (!metrics.length || !scoreReady(sampleSize)) {
    return (
      <HomePanel title="ציון ביצועים" className={className}>
        <div className="py-6 text-center">
          <p className="text-sm text-text-secondary">לא מספיק נתונים עדיין</p>
          <p className="text-xs text-text-muted mt-1">
            הציון יופיע אחרי {MIN_SCORE_TRADES} עסקאות סגורות (כרגע <span className="num-mono">{sampleSize}</span>)
          </p>
        </div>
      </HomePanel>
    );
  }
  const s = Math.round(score);
  const verdict = s >= 70 ? { text: 'מצוין', cls: 'text-profit' } : s >= 40 ? { text: 'סביר', cls: 'text-accent-hover' } : { text: 'יש מה לשפר', cls: 'text-amber-400' };
  const weakest = [...metrics].sort((a, b) => a.value - b.value)[0];
  const barCls = (v) => (v >= 60 ? 'bg-accent-primary' : v >= 35 ? 'bg-amber-500' : 'bg-loss');
  return (
    <HomePanel title="ציון ביצועים" className={className}>
      <div className="flex items-baseline gap-2.5 mb-4">
        <b className={`num-mono text-[44px] font-extrabold leading-none ${verdict.cls}`}><RollingNumber value={String(s)} /></b>
        <span className="text-sm text-text-secondary">/ 100 · {verdict.text}</span>
      </div>
      <div className="flex flex-col gap-3">
        {metrics.map((mt) => (
          <div key={mt.label} className="flex flex-col gap-1.5">
            <div className="flex justify-between text-[13px]">
              <span className="text-text-secondary">{mt.label}</span>
              <b className="num-mono text-text-primary">{Math.round(mt.value)}</b>
            </div>
            <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${barCls(mt.value)}`} style={{ width: `${Math.max(2, Math.min(100, mt.value))}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[13px] text-text-secondary leading-relaxed">
        החוליה החלשה: <b className="text-text-primary">{weakest.label}</b>. שיפור שלה יעלה את הציון הכי הרבה.
      </p>
    </HomePanel>
  );
}

// Backtests, plans, DCA and the mental journals as one row of small links.
export function QuickLinks({ backtests, backtestStats, plans, activePlans, dcaPlans, todayMorning, todayEvening, loading = false }) {
  const navigate = useNavigate();
  const items = [
    {
      to: '/backtest', name: 'בקטסטים', Icon: FlaskConical, tile: 'bg-accent-primary/14 text-sky-300',
      sub: backtests.length ? `${backtests.length}${backtestStats ? ` · ${backtestStats.winRate.toFixed(0)}% הצלחה` : ''}` : 'עוד לא התחלת',
    },
    {
      to: '/plans', name: 'תוכניות מסחר', Icon: ClipboardList, tile: 'bg-violet-500/14 text-violet-300',
      sub: plans.length ? `${activePlans.length} פעילות מתוך ${plans.length}` : 'עוד לא התחלת',
    },
    {
      to: '/dca', name: 'מעקב DCA', Icon: Coins, tile: 'bg-teal-500/14 text-teal-300',
      sub: dcaPlans.length ? `${dcaPlans.length} תוכניות` : 'עוד לא התחלת',
    },
    {
      to: '/mentality/morning', name: 'יומן בוקר', Icon: Sunrise, tile: 'bg-amber-500/14 text-amber-300',
      sub: todayMorning ? 'מולא היום' : 'טרם מולא היום', warn: !todayMorning,
    },
    {
      to: '/mentality/evening', name: 'יומן ערב', Icon: Moon, tile: 'bg-indigo-500/16 text-indigo-300',
      sub: todayEvening ? 'מולא היום' : 'טרם מולא היום', warn: !todayEvening,
    },
  ];
  return (
    <section aria-label="קיצורי דרך" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
      {items.map(({ to, name, Icon, tile, sub, warn }) => (
        <Card key={to} as="button" type="button" hover onClick={() => navigate(to)}
          className="rounded-2xl px-3.5 py-3 min-h-16 flex items-center gap-3 text-right">
          <span className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${tile}`}>{Icon && <Icon className="w-[18px] h-[18px]" />}</span>
          <span className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-bold text-text-primary truncate">{name}</span>
            {loading ? (
              <span className="mt-1 h-3 w-16 rounded bg-bg-tertiary animate-pulse" />
            ) : (
              <span className={`text-xs truncate ${warn ? 'text-amber-400' : 'text-text-secondary'}`}>{sub}</span>
            )}
          </span>
        </Card>
      ))}
    </section>
  );
}

const FNG_HE = {
  'Extreme Fear': 'פחד קיצוני', Fear: 'פחד', Neutral: 'ניטרלי', Greed: 'תאווה', 'Extreme Greed': 'תאווה קיצונית',
};

// Market in four numbers.
export function MarketCard({ market, fng, failed = false, onRetry, className = '' }) {
  const navigate = useNavigate();
  const chg = market?.market_cap_change_percentage_24h_usd;
  const fngVal = fng ? Number(fng.value) : null;
  const fngCls = fngVal == null ? 'text-text-primary' : fngVal >= 55 ? 'text-profit' : fngVal <= 45 ? 'text-loss' : 'text-text-primary';
  const cell = 'rounded-xl bg-bg-tertiary border border-border-primary px-3 py-2.5 min-w-0';
  return (
    <HomePanel title="השוק עכשיו" link="לסקירה" onLink={() => navigate('/market')} className={className}>
      {market ? (
        <div className="grid grid-cols-2 gap-2">
          <div className={cell}>
            <div className="text-xs text-text-secondary">שווי שוק</div>
            <div className="flex items-baseline gap-1.5 flex-wrap" dir="ltr" style={{ justifyContent: 'flex-end' }}>
              {chg != null && <span className={`text-xs font-bold ${chg >= 0 ? 'text-profit' : 'text-loss'}`}>{chg >= 0 ? '+' : ''}{chg.toFixed(1)}%</span>}
              <b className="num-mono text-base text-text-primary whitespace-nowrap">{formatCompactUsd(market.total_market_cap?.usd)}</b>
            </div>
          </div>
          <div className={cell}>
            <div className="text-xs text-text-secondary">פחד ותאווה</div>
            <b className="text-base text-text-primary">{fngVal == null ? '—' : <><span className="num-mono">{fngVal}</span> · <span className={fngCls}>{FNG_HE[fng.value_classification] || fng.value_classification}</span></>}</b>
          </div>
          <div className={cell}>
            <div className="text-xs text-text-secondary">דומיננטיות BTC</div>
            <b className="num-mono text-base text-text-primary">{market.market_cap_percentage?.btc?.toFixed(1)}%</b>
          </div>
          <div className={cell}>
            <div className="text-xs text-text-secondary">נפח 24 שעות</div>
            <b className="num-mono text-base text-text-primary block" dir="ltr" style={{ textAlign: 'right' }}>{formatCompactUsd(market.total_volume?.usd)}</b>
          </div>
        </div>
      ) : failed ? (
        <div className="flex items-center gap-2 flex-wrap" role="status">
          <p className="text-sm text-text-secondary">נתוני השוק לא זמינים כרגע</p>
          {onRetry && (
            <button type="button" onClick={onRetry}
              className="inline-flex items-center gap-1 px-2 h-7 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors cursor-pointer">
              <RefreshCw className="w-3 h-3" aria-hidden /> נסה שוב
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm text-text-secondary">טוען נתוני שוק…</p>
      )}
    </HomePanel>
  );
}

// Actual cumulative P&L (blue) against a straight pace line (light) from the
// first point to the last. The pill sits on the latest point.
export function PaceChart({ series, hidden, className = '' }) {
  const m = (v) => (hidden ? '••••' : v);
  const chart = useMemo(() => {
    const pts = (series || []).filter((p) => Number.isFinite(p.value));
    if (pts.length < 2) return null;
    const W = 600;
    const H = 180;
    const pad = 16;
    const target = pts.map((p, i) => {
      const t = i / (pts.length - 1);
      return pts[0].value + (pts[pts.length - 1].value - pts[0].value) * t;
    });
    const vals = [...pts.map((p) => p.value), ...target];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    const x = (i) => pad + (i / (pts.length - 1)) * (W - pad * 2);
    const y = (v) => pad + (H - pad * 2) * (1 - (v - min) / span);
    const path = (ys) => ys.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const last = pts.length - 1;
    return {
      blue: path(pts.map((p) => p.value)),
      white: path(target),
      tipX: (x(last) / W) * 100,
      tipY: (y(pts[last].value) / H) * 100,
      last: pts[last].value,
    };
  }, [series]);

  return (
    <HomePanel title="ביצוע מול יעד" className={`dash-card ${className}`}>
      <p className="text-xs text-text-secondary -mt-1 mb-3">הקו הכחול הוא הרווח המצטבר. הקו הבהיר הוא הקצב הישר מאותה נקודת פתיחה.</p>
      {chart ? (
        <div dir="ltr" className="relative h-[180px]">
          <svg viewBox="0 0 600 180" className="w-full h-full" role="img" aria-label="ביצוע מול קצב יעד">
            <path d={chart.white} fill="none" stroke="var(--pace-target)" strokeWidth="2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
            <path d={chart.blue} fill="none" stroke="#3b5bfd" strokeWidth="2.75" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <div
            className="absolute -translate-x-1/2 -translate-y-full px-2.5 py-1 rounded-full text-[11px] font-bold text-white pointer-events-none"
            style={{ left: `${chart.tipX}%`, top: `${chart.tipY}%`, background: '#111218' }}
          >
            <span className="num-mono" dir="ltr">{m(formatCurrencyShort(chart.last))}</span>
          </div>
        </div>
      ) : (
        <div className="h-[140px] grid place-items-center text-sm text-text-secondary">צריך לפחות שתי עסקאות סגורות</div>
      )}
    </HomePanel>
  );
}

export function WinDonut({ wins = 0, losses = 0, className = '' }) {
  const total = wins + losses;
  const rate = total ? Math.round((wins / total) * 100) : 0;
  const r = 42;
  const c = 2 * Math.PI * r;
  const winLen = total ? (wins / total) * c : 0;
  return (
    <HomePanel title="הצלחה מול הפסד" className={`dash-card ${className}`}>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 120 120" className="w-28 h-28 shrink-0" role="img" aria-label={`${rate}% הצלחה`}>
          <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(127,127,140,0.25)" strokeWidth="14" />
          {total > 0 && (
            <>
              <circle cx="60" cy="60" r={r} fill="none" stroke="#3b5bfd" strokeWidth="14"
                strokeDasharray={`${Math.max(0, c - winLen)} ${c}`} strokeDashoffset={-winLen} transform="rotate(-90 60 60)" />
              <circle cx="60" cy="60" r={r} fill="none" stroke="#c6f36b" strokeWidth="14"
                strokeDasharray={`${winLen} ${c}`} transform="rotate(-90 60 60)" />
            </>
          )}
          <text x="60" y="64" textAnchor="middle" fontSize="18" fontWeight="800" fill="currentColor">{total ? `${rate}%` : '—'}</text>
        </svg>
        <div className="flex flex-col gap-2 text-sm">
          <span className="inline-flex items-center gap-2"><i className="w-2.5 h-2.5 rounded-full" style={{ background: '#c6f36b' }} /> {wins} רווח</span>
          <span className="inline-flex items-center gap-2"><i className="w-2.5 h-2.5 rounded-full" style={{ background: '#3b5bfd' }} /> {losses} הפסד</span>
        </div>
      </div>
    </HomePanel>
  );
}

export function MetricFunnel({ metrics = [], className = '' }) {
  const rows = [...metrics].sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <HomePanel title="משפך ביצועים" className={`dash-card ${className}`}>
      {rows.length === 0 ? (
        <p className="text-sm text-text-secondary py-6 text-center">הציון יופיע אחרי כמה עסקאות סגורות</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-xs text-text-secondary truncate">{row.label}</span>
              <span className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(127,127,140,0.22)' }}>
                <span className="block h-full rounded-full" style={{ width: `${Math.max(8, (row.value / max) * 100)}%`, background: '#3b5bfd' }} />
              </span>
              <b className="num-mono text-xs w-8 text-left">{Math.round(row.value)}</b>
            </div>
          ))}
        </div>
      )}
    </HomePanel>
  );
}
