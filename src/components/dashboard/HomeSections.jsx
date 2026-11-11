import { useNavigate } from 'react-router-dom';
import { scoreReady, streakDaysLabel, MIN_SCORE_TRADES, profitFactorText, winRateText } from '../../utils/homeStats';
import { FlaskConical, ClipboardList, Coins, Sunrise, Moon, ChevronLeft, RefreshCw } from 'lucide-react';
import CoinIcon from '../shared/CoinIcon';
import FitText from '../shared/FitText';
import { formatCurrency, formatCurrencyShort, formatCompactUsd, formatRelativeTime, LRM } from '../../utils/formatters';
import { safePnl, tradeRMultiple } from '../../utils/calculations';

// The home page's sections, all on the same surface: rounded-2xl cards, a
// bold title + a quiet link, big tabular numbers, one thin colour bar.

export function HomePanel({ title, link, onLink, className = '', bodyClass = '', meta = null, tools = null, titleId, children }) {
  return (
    <section className={`panel ${className}`} aria-labelledby={titleId}>
      {(title || link || tools) && (
        <div className="panel__head">
          <h2 className="panel__title" id={titleId}>{title}</h2>
          <div className="panel__tools">
            {meta && <span className="panel__meta">{meta}</span>}
            {link && (
              <button type="button" onClick={onLink} className="panel__link">
                {link} <ChevronLeft className="w-3.5 h-3.5" aria-hidden />
              </button>
            )}
            {tools}
          </div>
        </div>
      )}
      <div className={`panel__body ${bodyClass}`}>{children}</div>
    </section>
  );
}

function Kpi({ label, value, valueCls = '', mono = true, bar, sub }) {
  return (
    <div className="kpi-cell">
      <span className="kpi__label">{label}</span>
      <FitText as="strong" min={16} className={`kpi__value ${mono ? '' : 'is-text'} ${valueCls}`}>
        {value}
      </FitText>
      {bar}
      {sub && <span className="kpi__sub">{sub}</span>}
    </div>
  );
}

const Split = ({ a, b }) => (
  <div dir="ltr" className="bar split-bar" aria-hidden>
    <span className="win" style={{ width: `${a}%` }} />
    <span className="loss" style={{ width: `${b}%` }} />
  </div>
);
const NeutralBar = () => <div className="bar" aria-hidden />;

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
  const streakWin = streakTrades.win;
  const n = streakTrades.current;
  const pnlCls = netPnl > 0 ? 'profit text-profit' : netPnl < 0 ? 'loss text-loss' : '';
  const ratio = Number.isFinite(avgWinLossRatio) ? avgWinLossRatio : null;

  return (
    <section aria-label="מדדים" data-testid="home-glance" className="kpi-strip">
      <div className="contents">
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
            <div className="bar" aria-hidden>
              <span style={{ width: `${pf == null ? 100 : Math.min(100, (pf / 2) * 100)}%`, background: pf == null || pf >= 1.5 ? 'var(--status-profit)' : pf >= 1 ? 'var(--accent)' : 'var(--status-warning)' }} />
            </div>
          )}
          sub={empty ? 'אין עסקאות סגורות' : losses === 0
            ? 'ללא הפסדים עדיין'
            : <>{pfNote} · ממוצע <span dir="ltr" className="text-profit">{m(formatCurrency(avgWin))}</span> מול <span dir="ltr" className="text-loss">{m(formatCurrency(avgLoss))}</span></>}
        />
        <Kpi
          label="רצף נוכחי"
          mono={false}
          valueCls={n === 0 ? '' : streakWin ? 'profit text-profit' : 'loss text-loss'}
          value={n === 0 ? 'אין עדיין' : n === 1 ? (streakWin ? 'רווח אחד' : 'הפסד אחד') : `${n} ${streakWin ? 'רווחים' : 'הפסדים'}`}
          bar={lastResults.length > 0 && (
            <div dir="ltr" className="result-ticks" title="5 העסקאות האחרונות">
              {lastResults.map((w, i) => <span key={i} className={w ? 'win' : 'loss'} />)}
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
    <HomePanel title="עסקאות אחרונות" link="ליומן המסחר" onLink={() => navigate('/journal')} className={className} bodyClass="panel__body--flush" titleId="recentTitle">
      {trades.length === 0 ? (
        <div className="trade-empty">
          <p>אין עסקאות סגורות עדיין</p>
          <button type="button" onClick={() => navigate('/journal?new=1')} className="btn btn--outline" style={{ marginTop: 12 }}>
            רשום עסקה
          </button>
        </div>
      ) : (
        <div>
          {trades.map((t) => {
            const p = pnlOf(t);
            const r = rMultiple(t);
            const long = t.direction !== 'short';
            const pair = t.pair || t.symbol;
            return (
              <button key={t.id} type="button" onClick={() => navigate('/journal')} className="trade-row" aria-label={`פתיחת ${pair} ביומן`}>
                <span className="journal-card__mark" aria-hidden>
                  <CoinIcon pair={pair} assetClass={t.assetClass} className="w-5 h-5" />
                </span>
                <span className="trade-main">
                  <span className="trade-top">
                    <FitText className="trade-pair" dir="ltr">{pair}</FitText>
                    <span className={`chip ${long ? 'chip--profit' : 'chip--loss'}`}>{long ? 'לונג' : 'שורט'}</span>
                  </span>
                  <span className="trade-meta">
                    {formatRelativeTime(t.exitDate || t.entryDate)}
                    {r != null && <> · <span className="num">{LRM}{r > 0 ? '+' : ''}{r.toFixed(1)}R</span></>}
                  </span>
                </span>
                <FitText as="b" className={`trade-pnl ${p > 0 ? 'profit text-profit' : p < 0 ? 'loss text-loss' : ''}`} dir="ltr" style={{ width: 'auto' }}>{m(formatCurrency(p))}</FitText>
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
      <section className={`panel score ${className}`} aria-labelledby="scoreTitle">
        <div className="panel__head">
          <h2 className="panel__title" id="scoreTitle">ציון ביצועים</h2>
          <span className="panel__meta">{sampleSize} עסקאות</span>
        </div>
        <div className="score__empty">
          <p>לא מספיק נתונים עדיין</p>
          <p style={{ marginTop: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>
            הציון יופיע אחרי {MIN_SCORE_TRADES} עסקאות סגורות (כרגע <span className="num">{sampleSize}</span>)
          </p>
        </div>
      </section>
    );
  }
  const s = Math.round(score);
  const verdict = s >= 70 ? { text: 'מצוין', chip: 'chip--profit', cls: 'profit text-profit' } : s >= 40 ? { text: 'סביר', chip: 'chip--accent', cls: '' } : { text: 'יש מה לשפר', chip: 'chip--warning', cls: '' };
  const weakest = [...metrics].sort((a, b) => a.value - b.value)[0];
  const barColor = (v) => (v >= 60 ? 'var(--accent)' : v >= 35 ? 'var(--status-warning)' : 'var(--status-loss)');
  return (
    <section className={`panel score ${className}`} aria-labelledby="scoreTitle">
      <div className="panel__head">
        <h2 className="panel__title" id="scoreTitle">ציון ביצועים</h2>
        <span className="panel__meta">{sampleSize} עסקאות</span>
      </div>
      <div className="score__body">
        <div className="score__top">
          <span className={`score__value ${verdict.cls}`}>{s}</span>
          <span className="score__of">/ 100</span>
          <span className={`chip ${verdict.chip}`}>{verdict.text}</span>
        </div>
        <div className="score__scale" aria-hidden><span style={{ width: `${Math.max(2, Math.min(100, s))}%` }} /></div>
        <div className="scale-labels" aria-hidden><span>0</span><span>50</span><span>100</span></div>
        <div className="score__metrics">
          {metrics.map((mt) => (
            <div key={mt.label} className="score-metric">
              <div className="score-metric__row">
                <span>{mt.label}</span>
                <b>{Math.round(mt.value)}</b>
              </div>
              <div className="bar"><span style={{ width: `${Math.max(2, Math.min(100, mt.value))}%`, background: barColor(mt.value) }} /></div>
            </div>
          ))}
        </div>
        <p className="score__note">
          החוליה החלשה: <b>{weakest.label}</b>. שיפור שלה יעלה את הציון הכי הרבה.
        </p>
      </div>
    </section>
  );
}

// Backtests, plans, DCA and the mental journals as one row of small links.
export function QuickLinks({ backtests, backtestStats, plans, activePlans, dcaPlans, todayMorning, todayEvening, loading = false }) {
  const navigate = useNavigate();
  const items = [
    {
      to: '/backtest', name: 'בקטסטים', Icon: FlaskConical,
      sub: backtests.length ? `${backtests.length}${backtestStats ? ` · ${backtestStats.winRate.toFixed(0)}% הצלחה` : ''}` : 'עוד לא התחלת',
    },
    {
      to: '/plans', name: 'תוכניות מסחר', Icon: ClipboardList,
      sub: plans.length ? `${activePlans.length} פעילות מתוך ${plans.length}` : 'עוד לא התחלת',
    },
    {
      to: '/dca', name: 'מעקב DCA', Icon: Coins,
      sub: dcaPlans.length ? `${dcaPlans.length} תוכניות` : 'עוד לא התחלת',
    },
    {
      to: '/mentality/morning', name: 'יומן בוקר', Icon: Sunrise,
      sub: todayMorning ? 'מולא היום' : 'טרם מולא היום', warn: !todayMorning,
    },
    {
      to: '/mentality/evening', name: 'יומן ערב', Icon: Moon,
      sub: todayEvening ? 'מולא היום' : 'טרם מולא היום', warn: !todayEvening,
    },
  ];
  return (
    <section aria-label="קיצורי דרך" data-testid="home-quick">
      <div className="section-head">
        <div className="section-head__eyebrow">המשך מכאן</div>
        <h2>קיצורי דרך</h2>
        <p>הכלים שמשלימים את התמונה.</p>
      </div>
      <div className="quick-grid">
        {items.map(({ to, name, Icon, sub, warn }) => (
          <button key={to} type="button" onClick={() => navigate(to)} className="quick-card">
            <span className="quick-card__icon" aria-hidden>{Icon && <Icon className="w-[18px] h-[18px]" />}</span>
            <span className="quick-card__text">
              <span className="quick-card__title">{name}</span>
              {loading ? (
                <span className="quick-card__sub" aria-hidden style={{ height: 12 }} />
              ) : (
                <span className={`quick-card__sub${warn ? ' is-warning' : ''}`}>{sub}</span>
              )}
            </span>
            <ChevronLeft className="quick-card__arrow w-4 h-4" aria-hidden />
          </button>
        ))}
      </div>
    </section>
  );
}

const FNG_HE = {
  'Extreme Fear': 'פחד קיצוני', Fear: 'פחד', Neutral: 'ניטרלי', Greed: 'תאווה', 'Extreme Greed': 'תאווה קיצונית',
};

// Market in four numbers.
function updatedLabel(at) {
  if (!at) return '';
  const mins = Math.max(0, Math.floor((Date.now() - at) / 60000));
  if (mins < 1) return 'עודכן עכשיו';
  if (mins < 60) return `עודכן לפני ${mins} דק׳`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `עודכן לפני ${hrs} שע׳`;
  return `עודכן לפני ${Math.floor(hrs / 24)} ימים`;
}

export function MarketCard({ market, fng, failed = false, onRetry, updatedAt = null, refreshing = false, className = '' }) {
  const navigate = useNavigate();
  const chg = market?.market_cap_change_percentage_24h_usd;
  const fngVal = fng ? Number(fng.value) : null;
  const fngCls = fngVal == null ? '' : fngVal >= 55 ? 'profit' : fngVal <= 45 ? 'loss' : '';
  const refresh = onRetry ? (
    <button type="button" className={`icon-btn${refreshing ? ' is-spinning' : ''}`} onClick={onRetry} aria-label="רענון נתוני שוק" title="רענון נתוני שוק">
      <RefreshCw className="w-4 h-4" aria-hidden />
    </button>
  ) : null;
  return (
    <HomePanel title="השוק עכשיו" link="לסקירה" onLink={() => navigate('/market')} className={`market ${className}`} titleId="marketTitle" tools={refresh}>
      {market ? (
        <>
          <div className="market-grid">
            <div className="market-cell">
              <span className="market-cell__label">שווי שוק</span>
              <strong className="market-cell__value">{formatCompactUsd(market.total_market_cap?.usd)}</strong>
              {chg != null && <span className={`market-cell__delta ${chg >= 0 ? 'profit' : 'loss'}`}>{chg >= 0 ? '+' : ''}{chg.toFixed(1)}%</span>}
            </div>
            <div className="market-cell">
              <span className="market-cell__label">פחד ותאווה</span>
              <strong className="market-cell__value is-text">
                {fngVal == null ? '—' : <><span className="num">{fngVal}</span> · <span className={fngCls}>{FNG_HE[fng.value_classification] || fng.value_classification}</span></>}
              </strong>
            </div>
            <div className="market-cell">
              <span className="market-cell__label">דומיננטיות BTC</span>
              <strong className="market-cell__value">{market.market_cap_percentage?.btc != null ? `${market.market_cap_percentage.btc.toFixed(1)}%` : '—'}</strong>
            </div>
            <div className="market-cell">
              <span className="market-cell__label">נפח 24 שעות</span>
              <strong className="market-cell__value">{formatCompactUsd(market.total_volume?.usd)}</strong>
            </div>
          </div>
          {updatedAt ? <div className="market-updated">{updatedLabel(updatedAt)}</div> : null}
        </>
      ) : failed ? (
        <div className="market-status" role="status">
          <p>נתוני השוק לא זמינים כרגע</p>
        </div>
      ) : (
        <p className="market-status">טוען נתוני שוק…</p>
      )}
    </HomePanel>
  );
}
