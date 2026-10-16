import EquityChart from './EquityChart';
import { DeskLinks, EyeButton, Periods, TradeButton } from './Bits';
import { money, signedPct, streakLabel, thirdStat, toneOf } from './data';
import { useHomeModel } from './model';

export default function GraphiteHome() {
  const m = useHomeModel();
  const third = thirdStat(m.model, m.acct);
  const { kpi } = m;
  const cells = [
    {
      label: 'אחוז הצלחה',
      value: `${Math.round(kpi.winRate)}%`,
      tone: 'flat',
      sub: `${kpi.wins} רווח · ${kpi.losses} הפסד`,
      bar: (
        <span className="dp-split" dir="ltr">
          <i className="is-up" style={{ width: `${kpi.winShare}%` }} />
          <i className="is-down" style={{ width: `${100 - kpi.winShare}%` }} />
        </span>
      ),
    },
    {
      label: 'יחס רווח להפסד',
      value: kpi.ratio == null ? '—' : kpi.ratio.toFixed(2),
      tone: 'flat',
      sub: (
        <>
          ממוצע <b dir="ltr" className="is-up">{m.mask(money(kpi.avgWin, { sign: true }))}</b>
          {' '}מול <b dir="ltr" className="is-down">{m.mask(money(kpi.avgLoss))}</b>
        </>
      ),
      bar: (
        <span className="dp-split" dir="ltr">
          <i className="is-up" style={{ width: `${kpi.sizeShare}%` }} />
          <i className="is-down" style={{ width: `${100 - kpi.sizeShare}%` }} />
        </span>
      ),
    },
    {
      label: 'פקטור רווח',
      value: kpi.pf == null ? '—' : kpi.pf.toFixed(2),
      tone: 'flat',
      sub: kpi.pfNote,
      bar: <span className="dp-meter"><i style={{ width: `${kpi.pfShare}%` }} /></span>,
    },
    {
      label: 'רצף נוכחי',
      value: streakLabel(kpi.streak, kpi.streakWin),
      tone: kpi.streak ? (kpi.streakWin ? 'up' : 'down') : 'flat',
      mono: false,
      sub: `שיא ${kpi.best} רווחים ברצף`,
      bar: (
        <span className="dp-pips" dir="ltr">
          {kpi.lastResults.map((w, i) => <i key={i} className={w ? 'is-up' : 'is-down'} />)}
        </span>
      ),
    },
  ];

  return (
    <div className="dp-page dp-g">
      <header className="dp-g-head">
        <div className="dp-g-hello">
          <p className="dp-kicker">
            <span className="dp-live" aria-hidden />
            מסונכרן מהבורסה
            <span className="dp-dot" aria-hidden>·</span>
            {m.dateLabel}
          </p>
          <h1>{m.hello}</h1>
        </div>
        <div className="dp-g-tools">
          <DeskLinks />
          <EyeButton hidden={m.hidden} onClick={m.toggleHidden} />
          <TradeButton />
        </div>
      </header>

      <section
        className="dp-g-panel dp-spot"
        aria-label="שווי התיק"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
          e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
        }}
      >
        <div className="dp-g-main">
          <div className="dp-g-value">
            <span className="dp-label">שווי תיקים כולל</span>
            <div className="dp-g-figure">
              <b className="dp-num dp-hero-num" dir="ltr">{m.mask(money(m.acct.balance, { digits: 2 }))}</b>
              <span dir="ltr" className={`dp-pill is-${toneOf(m.acct.pnlPercent)}`}>
                {m.mask(signedPct(m.acct.pnlPercent))}
              </span>
            </div>
            <Periods period={m.period} onChange={m.setPeriod} />
          </div>
          <EquityChart points={m.model.points} variant="graphite" mask={m.mask} />
        </div>
        <div className="dp-g-metrics">
          <Metric label="רווח/הפסד" value={m.mask(money(m.model.pnl, { sign: true }))} tone={toneOf(m.model.pnl)} />
          <Metric label="עסקאות" value={String(m.model.count)} />
          <Metric label={third.label} value={m.mask(third.text)} tone={third.tone} />
        </div>
      </section>

      <section className="dp-g-kpis" aria-label="מדדים">
        {cells.map((c) => (
          <article key={c.label}>
            <span className="dp-label">{c.label}</span>
            <b className={`${c.mono === false ? '' : 'dp-num'} is-${c.tone}`}>{c.value}</b>
            {c.bar}
            <small>{c.sub}</small>
          </article>
        ))}
      </section>
    </div>
  );
}

function Metric({ label, value, tone = 'flat' }) {
  return (
    <div>
      <span className="dp-label">{label}</span>
      <b className={`dp-num is-${tone}`} dir="ltr">{value}</b>
    </div>
  );
}
