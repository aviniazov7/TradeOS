import EquityChart from './EquityChart';
import { DeskLinks, EyeButton, Periods, TradeButton } from './Bits';
import { money, signedPct, streakLabel, thirdStat, toneOf } from './data';
import { useHomeModel } from './model';

export default function SolarHome() {
  const m = useHomeModel();
  const third = thirdStat(m.model, m.acct);
  const { kpi } = m;
  const rows = [
    { label: 'אחוז הצלחה', value: `${Math.round(kpi.winRate)}%`, note: `${kpi.wins} רווח · ${kpi.losses} הפסד`, tone: 'flat' },
    { label: 'יחס רווח להפסד', value: kpi.ratio == null ? '—' : kpi.ratio.toFixed(2), note: `ממוצע ${m.mask(money(kpi.avgWin, { sign: true }))} מול ${m.mask(money(kpi.avgLoss))}`, tone: 'flat' },
    { label: 'פקטור רווח', value: kpi.pf == null ? '—' : kpi.pf.toFixed(2), note: kpi.pfNote, tone: 'flat' },
    { label: 'רצף נוכחי', value: streakLabel(kpi.streak, kpi.streakWin), note: `שיא ${kpi.best} רווחים ברצף`, tone: kpi.streakWin ? 'up' : 'down' },
  ];

  return (
    <div className="dp-page dp-s">
      <header className="dp-s-head">
        <div className="dp-s-intro">
          <p className="dp-kicker">יומן מסחר · {m.dateLabel}</p>
          <h1 className="dp-serif">{m.hello}</h1>
          <p className="dp-s-sync"><span className="dp-live" aria-hidden /> מסונכרן מהבורסה</p>
        </div>
        <div className="dp-s-tools">
          <DeskLinks />
          <EyeButton hidden={m.hidden} onClick={m.toggleHidden} />
          <TradeButton />
        </div>
      </header>

      <section className="dp-s-frame" aria-label="שווי התיק">
        <i className="dp-corner tl" aria-hidden />
        <i className="dp-corner tr" aria-hidden />
        <i className="dp-corner bl" aria-hidden />
        <i className="dp-corner br" aria-hidden />
        <div className="dp-s-top">
          <div>
            <span className="dp-label">שווי תיקים כולל</span>
            <div className="dp-s-figure">
              <b className="dp-serif dp-hero-num" dir="ltr">{m.mask(money(m.acct.balance, { digits: 2 }))}</b>
              <span dir="ltr" className={`dp-pill is-${toneOf(m.acct.pnlPercent)}`}>{m.mask(signedPct(m.acct.pnlPercent))}</span>
            </div>
          </div>
          <Periods period={m.period} onChange={m.setPeriod} />
        </div>
        <div className="dp-s-well">
          <EquityChart points={m.model.points} variant="solar" mask={m.mask} />
        </div>
        <div className="dp-s-metrics">
          <Metric label="רווח/הפסד" value={m.mask(money(m.model.pnl, { sign: true }))} tone={toneOf(m.model.pnl)} />
          <Metric label="עסקאות" value={String(m.model.count)} />
          <Metric label={third.label} value={m.mask(third.text)} tone={third.tone} />
        </div>
      </section>

      <section className="dp-s-ledger" aria-label="מדדים">
        {rows.map((r) => (
          <article key={r.label}>
            <span className="dp-label">{r.label}</span>
            <b className={`dp-num is-${r.tone}`} dir="ltr">{r.value}</b>
            <small>{r.note}</small>
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
