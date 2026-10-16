import EquityChart from './EquityChart';
import { DeskLinks, EyeButton, Periods, TradeButton } from './Bits';
import { money, signedPct, streakLabel, thirdStat, toneOf } from './data';
import { useHomeModel } from './model';

export default function AuroraHome() {
  const m = useHomeModel();
  const third = thirdStat(m.model, m.acct);
  const { kpi } = m;
  const tiles = [
    { label: 'אחוז הצלחה', value: `${Math.round(kpi.winRate)}%`, sub: `${kpi.wins} רווח · ${kpi.losses} הפסד`, tone: 'flat' },
    { label: 'יחס רווח להפסד', value: kpi.ratio == null ? '—' : kpi.ratio.toFixed(2), sub: `ממוצע ${m.mask(money(kpi.avgWin, { sign: true }))}`, tone: 'flat' },
    { label: 'פקטור רווח', value: kpi.pf == null ? '—' : kpi.pf.toFixed(2), sub: kpi.pfNote, tone: 'flat' },
    { label: 'רצף נוכחי', value: streakLabel(kpi.streak, kpi.streakWin), sub: `שיא ${kpi.best} ברצף`, tone: kpi.streakWin ? 'up' : 'down', mono: false },
  ];

  return (
    <div className="dp-page dp-a">
      <header className="dp-a-head">
        <div>
          <p className="dp-kicker">
            <span className="dp-live" aria-hidden />
            מסונכרן מהבורסה
          </p>
          <h1>{m.hello}</h1>
          <p className="dp-a-date">{m.dateLabel}</p>
        </div>
        <div className="dp-a-tools">
          <DeskLinks />
          <EyeButton hidden={m.hidden} onClick={m.toggleHidden} />
          <TradeButton />
        </div>
      </header>

      <div className="dp-a-bento">
        <section className="dp-a-beam" aria-label="שווי התיק">
          <div className="dp-a-card">
            <div className="dp-a-top">
              <div>
                <span className="dp-label">שווי תיקים כולל</span>
                <div className="dp-a-figure">
                  <b className="dp-num dp-hero-num" dir="ltr">{m.mask(money(m.acct.balance, { digits: 2 }))}</b>
                  <span dir="ltr" className={`dp-pill is-${toneOf(m.acct.pnlPercent)}`}>{m.mask(signedPct(m.acct.pnlPercent))}</span>
                </div>
              </div>
              <Periods period={m.period} onChange={m.setPeriod} />
            </div>
            <EquityChart points={m.model.points} variant="aurora" mask={m.mask} />
            <div className="dp-a-chips">
              <Chip label="רווח/הפסד" value={m.mask(money(m.model.pnl, { sign: true }))} tone={toneOf(m.model.pnl)} />
              <Chip label="עסקאות" value={String(m.model.count)} />
              <Chip label={third.label} value={m.mask(third.text)} tone={third.tone} />
            </div>
          </div>
        </section>

        <aside className="dp-a-side">
          <div className="dp-a-card dp-a-today">
            <span className="dp-label">היום</span>
            <b className={`dp-num is-${toneOf(m.model.today)}`} dir="ltr">{m.mask(money(m.model.today, { sign: true }))}</b>
            <small>מסונכרן · {m.model.count} עסקאות {m.model.def.label}</small>
          </div>
          <div className="dp-a-card dp-a-pips-card">
            <span className="dp-label">5 אחרונות</span>
            <div className="dp-a-pips" dir="ltr">
              {kpi.lastResults.map((w, i) => <i key={i} className={w ? 'is-up' : 'is-down'} />)}
            </div>
            <small>{streakLabel(kpi.streak, kpi.streakWin)}</small>
          </div>
        </aside>
      </div>

      <section className="dp-a-stats" aria-label="מדדים">
        {tiles.map((t) => (
          <article key={t.label} className="dp-a-card">
            <span className="dp-label">{t.label}</span>
            <b className={`${t.mono === false ? '' : 'dp-num'} is-${t.tone}`}>{t.value}</b>
            <small>{t.sub}</small>
          </article>
        ))}
      </section>
    </div>
  );
}

function Chip({ label, value, tone = 'flat' }) {
  return (
    <div className="dp-a-chip">
      <span className="dp-label">{label}</span>
      <b className={`dp-num is-${tone}`} dir="ltr">{value}</b>
    </div>
  );
}
