import { useNavigate } from 'react-router-dom';
import { scoreReady, streakDaysLabel, MIN_SCORE_TRADES, profitFactorText, winRateText } from '../../utils/homeStats';
import { FlaskConical, ClipboardList, Coins, Sunrise, Moon, ChevronLeft, RefreshCw } from 'lucide-react';
import Card from '../shared/Card';
import CoinIcon from '../shared/CoinIcon';
import FitText from '../shared/FitText';
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

function Kpi({ label, value, valueCls = 'text-text-primary', mono = true, bar, sub }) {
  return (
    <div className="p-3.5 md:p-4 flex flex-col gap-2 min-w-0">
      <span className="text-[13px] text-text-secondary">{label}</span>
      <FitText as="b" min={14} className={`${mono ? 'num-mono text-[26px] md:text-[30px]' : 'text-[22px] md:text-2xl'} font-extrabold leading-tight ${valueCls}`} dir={mono ? 'ltr' : undefined} style={mono ? { textAlign: 'right' } : undefined}>
        {value}
      </FitText>
      {bar}
      {sub && <span className="text-xs text-text-secondary leading-snug">{sub}</span>}
    </div>
  );
}

const Split = ({ a, b }) => (
  <div dir="ltr" className="flex h-1.5 rounded-full overflow-hidden bg-bg-tertiary">
    <span className="bg-profit" style={{ width: `${a}%` }} />
    <span className="bg-loss" style={{ width: `${b}%` }} />
  </div>
);
const NeutralBar = () => <div className="h-1.5 rounded-full bg-bg-tertiary" aria-hidden />;

// One surface, four numbers: net P&L, win rate, profit factor, streak.
// The win/loss size ratio stays under the win rate — it is "—" until a loss
// exists, same rule as before, just not its own card.
export function HomeKpis({ kpi, hidden }) {
  const m = (v) => (hidden ? '••••' : v);
  const {
    netPnl = 0, tradeCount = 0,
    winRate = 0, wins = 0, losses = 0, breakeven = 0, avgWin = 0, avgLoss = 0, avgWinLossRatio = 0,
    profitFactor = 0, streakDays = { current: 0 }, streakTrades = { current: 0, best: 0, win: true }, lastResults = [],
  } = kpi || {};
  const decided = wins + losses;
  const empty = decided === 0;
  const pf = Number.isFinite(profitFactor) ? profitFactor : null;
  const pfNote = pf == null ? 'ללא הפסדים עדיין'
    : pf < 1 ? 'מתחת ל-1: ההפסדים גדולים מהרווחים'
      : pf < 1.5 ? 'רווחי, יש מקום לשיפור' : 'חזק — ממשיכים כך';
  const pfColor = pf == null || pf >= 1.5 ? 'bg-profit' : pf >= 1 ? 'bg-accent-primary' : 'bg-amber-500';
  const streakWin = streakTrades.win;
  const n = streakTrades.current;
  const pnlCls = netPnl > 0 ? 'text-profit' : netPnl < 0 ? 'text-loss' : 'text-text-primary';
  const ratio = Number.isFinite(avgWinLossRatio) ? avgWinLossRatio : null;

  return (
    <section aria-label="מדדים" data-testid="home-glance" className="rounded-2xl border border-border-primary bg-bg-secondary overflow-hidden">
      <div className="grid grid-cols-2 lg:grid-cols-4 [&>*]:border-border-primary max-lg:[&>*:nth-child(odd)]:border-e max-lg:[&>*:nth-child(-n+2)]:border-b lg:[&>*:not(:first-child)]:border-s">
        <Kpi
          label="רווח/הפסד"
          value={m(formatCurrencyShort(netPnl))}
          valueCls={pnlCls}
          sub={`${tradeCount} עסקאות סגורות`}
        />
        <Kpi
          label="אחוז הצלחה"
          value={winRateText(winRate, wins, losses)}
          bar={empty ? <NeutralBar /> : <Split a={(wins / decided) * 100} b={(losses / decided) * 100} />}
          sub={<>
            {wins} רווח · {losses} הפסד{breakeven ? ` · ${breakeven} איזון` : ''}
            {ratio != null && <> · יחס <span dir="ltr">{ratio.toFixed(2)}</span></>}
          </>}
        />
        <Kpi
          label="פקטור רווח"
          value={profitFactorText(pf, wins, losses)}
          bar={empty ? <NeutralBar /> : (
            <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
              <div className={`h-full rounded-full ${pfColor}`} style={{ width: `${pf == null ? 100 : Math.min(100, (pf / 2) * 100)}%` }} />
            </div>
          )}
          sub={empty ? 'אין עסקאות סגורות' : losses === 0
            ? 'ללא הפסדים עדיין'
            : <>{pfNote} · ממוצע <span dir="ltr" className="text-profit">{m(formatCurrency(avgWin))}</span> מול <span dir="ltr" className="text-loss">{m(formatCurrency(avgLoss))}</span></>}
        />
        <Kpi
          label="רצף נוכחי"
          mono={false}
          valueCls={n === 0 ? 'text-text-secondary' : streakWin ? 'text-profit' : 'text-loss'}
          value={n === 0 ? 'אין עדיין' : n === 1 ? (streakWin ? 'רווח אחד' : 'הפסד אחד') : `${n} ${streakWin ? 'רווחים' : 'הפסדים'}`}
          bar={lastResults.length > 0 && (
            <div dir="ltr" className="flex gap-1" title="5 העסקאות האחרונות">
              {lastResults.map((w, i) => <span key={i} className={`flex-1 h-1.5 rounded-full ${w ? 'bg-profit' : 'bg-loss'}`} />)}
            </div>
          )}
          sub={`${streakDaysLabel(streakDays.current)} · שיא ${streakTrades.best || 0} רווחים ברצף`}
        />
      </div>
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
                </span>
                <FitText as="b" className={`num-mono text-[15px] shrink-0 max-w-[45%] ${p > 0 ? 'text-profit' : p < 0 ? 'text-loss' : 'text-text-secondary'}`} dir="ltr" style={{ width: 'auto' }}>{m(formatCurrency(p))}</FitText>
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
        <b className={`num-mono text-[44px] font-extrabold leading-none ${verdict.cls}`}>{s}</b>
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
