// Initialised here rather than in main.jsx: i18n is used only by this route
// and the switcher inside it, both of which live in this lazy chunk. In the
// eager shell it cost 55 kB for a page that is not linked from any nav.
import '../../i18n';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';

// ── Daily Briefing — PREVIEW of the redesigned home screen ──────────────────
// Not wired to live data yet: the numbers below are demo values that match the
// approved mockup. This exists at /briefing so we can see the direction (blue
// accent + bilingual) inside the real app without touching the current home.
// When we build for real (stage 6.7+), these get fed from live data + the coach.

const CSS = `
.db-wrap { direction: inherit; color: #f2f2f4; max-width: 440px; margin: 0 auto;
  font-family: inherit; display: flex; flex-direction: column; gap: 13px; padding: 8px 4px 40px; }
.db-banner { text-align: center; font-size: 11px; font-weight: 700; letter-spacing: .04em;
  color: #7f8695; background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.22);
  border-radius: 999px; padding: 6px 12px; }
.db-top { display: flex; align-items: center; justify-content: space-between; padding: 4px 2px; }
.db-hi { font-size: 14px; font-weight: 700; }
.db-avatar { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center;
  font-weight: 800; font-size: 15px; color: #06060a;
  background: linear-gradient(135deg, #2563eb 0%, #38bdf8 100%); }
.db-card { background: #0f0f14; border: 1px solid rgba(255,255,255,0.075); border-radius: 18px; }
.db-coach { position: relative; overflow: hidden; border-radius: 20px; padding: 15px;
  border: 1px solid rgba(59,130,246,0.34);
  background: radial-gradient(120% 100% at 100% 0%, rgba(59,130,246,0.17) 0%, transparent 60%), #0f0f14; }
.db-row { display: flex; align-items: center; gap: 9px; }
.db-brain { width: 30px; height: 30px; border-radius: 10px; flex: none; display: grid; place-items: center;
  background: linear-gradient(135deg, #2563eb 0%, #38bdf8 100%); box-shadow: 0 0 18px -4px rgba(59,130,246,0.6); }
.db-ttl { font-size: 13px; font-weight: 800; }
.db-sub { font-size: 10.5px; color: #8a8f9c; margin-top: 1px; }
.db-msg { font-size: 14px; line-height: 1.6; margin-top: 12px; font-weight: 500; }
.db-msg b { color: #fff; }
.db-cost { color: #ff5c5c; font-weight: 700; }
.db-tags { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
.db-tag { font-size: 10.5px; font-weight: 600; padding: 4px 9px; border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.14); color: #8a8f9c; }
.db-tag.warn { color: #f5a623; border-color: rgba(245,166,35,.35); background: rgba(245,166,35,.08); }
.db-cta { margin-top: 13px; display: flex; gap: 8px; }
.db-btn { flex: 1; text-align: center; font-size: 12.5px; font-weight: 700; padding: 10px;
  border-radius: 12px; cursor: pointer; border: none; }
.db-btn.primary { background: linear-gradient(135deg, #2563eb 0%, #38bdf8 100%); color: #06060a; }
.db-btn.ghost { border: 1px solid rgba(255,255,255,0.14); color: #8a8f9c; background: transparent; }
.db-label { font-size: 10.5px; letter-spacing: .06em; color: #5c606b; font-weight: 700;
  margin: 3px 2px -2px; display: flex; align-items: center; justify-content: space-between; }
.db-sync { color: #26d07c; display: inline-flex; align-items: center; gap: 4px; font-weight: 600; }
.db-dot { width: 6px; height: 6px; border-radius: 50%; background: #26d07c; box-shadow: 0 0 8px #26d07c; }
.db-perf { padding: 14px; }
.db-perf-head { display: flex; align-items: flex-end; justify-content: space-between; }
.db-big { font-size: 27px; font-weight: 800; letter-spacing: -0.02em; color: #26d07c; font-variant-numeric: tabular-nums; }
.db-chg { font-size: 11.5px; color: #8a8f9c; margin-top: 2px; }
.db-chg b { color: #26d07c; }
.db-grid3 { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-top: 14px; }
.db-stat { background: #16161d; border: 1px solid rgba(255,255,255,0.075); border-radius: 12px; padding: 9px 10px; }
.db-stat .v { font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; }
.db-stat .v.up { color: #26d07c; }
.db-stat .k { font-size: 10px; color: #8a8f9c; margin-top: 2px; }
.db-disc { padding: 14px; display: flex; align-items: center; gap: 13px; }
.db-gauge { width: 62px; height: 62px; flex: none; position: relative; display: grid; place-items: center; }
.db-gauge .num { font-size: 17px; font-weight: 800; }
.db-gauge .lbl { font-size: 8px; color: #8a8f9c; }
.db-disc .t { font-size: 13px; font-weight: 700; }
.db-disc .t .ok { color: #26d07c; }
.db-disc .d { font-size: 11.5px; color: #8a8f9c; line-height: 1.5; margin-top: 3px; }
.db-streak { display: inline-flex; align-items: center; gap: 5px; margin-top: 8px; font-size: 11px; color: #f5a623; font-weight: 600; }
.db-item { display: flex; align-items: center; gap: 11px; padding: 11px; border-radius: 13px; background: #0f0f14;
  border: 1px solid rgba(255,255,255,0.06); }
.db-item + .db-item { margin-top: 6px; }
.db-ic { width: 30px; height: 30px; border-radius: 9px; flex: none; display: grid; place-items: center;
  background: rgba(59,130,246,.15); color: #3b82f6; }
.db-tx { font-size: 12.5px; font-weight: 600; }
.db-tx small { display: block; font-weight: 400; color: #8a8f9c; font-size: 10.5px; margin-top: 2px; }
.db-open { padding: 14px; border: 1px solid rgba(59,130,246,0.28);
  background: radial-gradient(140% 120% at 0% 0%, rgba(59,130,246,0.10) 0%, transparent 55%), #0f0f14; }
.db-open-head { display: flex; align-items: center; justify-content: space-between; }
.db-sym { font-size: 15px; font-weight: 800; display: flex; align-items: center; gap: 7px; }
.db-badge { font-size: 9.5px; font-weight: 700; padding: 2px 7px; border-radius: 999px; }
.db-badge.long { color: #26d07c; background: rgba(38,208,124,.12); }
.db-lev { font-size: 10px; color: #8a8f9c; font-weight: 600; }
.db-pnl { text-align: left; }
.db-pnl .n { font-size: 17px; font-weight: 800; font-variant-numeric: tabular-nums; }
.db-pnl .n.up { color: #26d07c; }
.db-pnl .p { font-size: 10.5px; color: #26d07c; }
.db-prices { display: flex; gap: 14px; margin-top: 10px; font-size: 11px; color: #8a8f9c; }
.db-prices b { color: #f2f2f4; font-weight: 700; }
.db-track { position: relative; height: 8px; border-radius: 999px; margin: 14px 0 7px;
  background: linear-gradient(90deg, #ff5c5c 0%, #3a3a44 50%, #26d07c 100%); }
.db-entry-tick { position: absolute; top: -3px; width: 2px; height: 14px; background: rgba(255,255,255,.6); transform: translateX(-50%); }
.db-marker { position: absolute; top: -4px; width: 15px; height: 15px; border-radius: 50%;
  background: #fff; border: 3px solid #3b82f6; transform: translateX(-50%); box-shadow: 0 0 10px rgba(59,130,246,.7); }
.db-scale { display: flex; justify-content: space-between; font-size: 10px; color: #8a8f9c; }
.db-scale .g { color: #26d07c; }
.db-scale .r { color: #ff5c5c; }
.db-recent { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px;
  background: #0f0f14; border: 1px solid rgba(255,255,255,0.06); border-radius: 11px; }
.db-recent + .db-recent { margin-top: 6px; }
.db-recent .s { font-size: 12.5px; font-weight: 700; }
.db-recent .v { font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; }
.db-recent .v.up { color: #26d07c; }
.db-recent .v.down { color: #ff5c5c; }
`;

export default function DailyBriefing() {
  const { t } = useTranslation();

  return (
    <div className="db-wrap">
      <style>{CSS}</style>

      <div className="db-banner">{t('briefing.previewBanner')}</div>

      {/* top bar */}
      <div className="db-top">
        <div className="db-hi">{t('briefing.greeting', { name: 'אבי' })}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LanguageSwitcher />
          <div className="db-avatar">א</div>
        </div>
      </div>

      {/* HERO — AI coach */}
      <div className="db-coach">
        <div className="db-row">
          <div className="db-brain">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#06060a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5a3 3 0 1 0-5.997.125" /><path d="M12 5a3 3 0 1 1 5.997.125" />
              <path d="M6 12a3 3 0 0 0-1.5 5.5M18 12a3 3 0 0 1 1.5 5.5" /><path d="M12 5v14M8 19a3 3 0 0 0 8 0" />
            </svg>
          </div>
          <div>
            <div className="db-ttl">{t('briefing.coachTitle')}</div>
            <div className="db-sub">{t('briefing.coachSub', { count: 12 })}</div>
          </div>
        </div>

        <div className="db-msg">
          {t('briefing.coachMsg', { cost: '-$184', winrate: '68%' })
            .split('-$184')
            .flatMap((part, i) =>
              i === 0 ? [part] : [<span key={i} className="db-cost">-$184</span>, part]
            )}
        </div>

        <div className="db-tags">
          <span className="db-tag warn">⚠ {t('briefing.tagEarly')}</span>
          <span className="db-tag">{t('briefing.tagAsian')}</span>
          <span className="db-tag">{t('briefing.tagRepeat')}</span>
        </div>

        <div className="db-cta">
          <button type="button" className="db-btn primary">{t('briefing.analyzeDeep')}</button>
          <button type="button" className="db-btn ghost">{t('briefing.ignoreToday')}</button>
        </div>
      </div>

      {/* open position + route (entry → target/stop) */}
      <div className="db-label"><span>{t('briefing.openTitle')}</span></div>
      <div className="db-card db-open">
        <div className="db-open-head">
          <div className="db-sym">
            BTCUSDT
            <span className="db-badge long">{t('briefing.sideLong')}</span>
            <span className="db-lev">×10</span>
          </div>
          <div className="db-pnl"><div className="n up">+$210</div><div className="p">+2.4%</div></div>
        </div>
        <div className="db-prices">
          <span>{t('briefing.entry')} <b>$62,400</b></span>
          <span>{t('briefing.current')} <b>$63,100</b></span>
          <span style={{ marginInlineStart: 'auto', color: '#26d07c', fontWeight: 700 }}>{t('briefing.toTarget', { pct: '33%' })}</span>
        </div>
        <div className="db-track">
          <div className="db-entry-tick" style={{ left: '22%' }} />
          <div className="db-marker" style={{ left: '48%' }} />
        </div>
        <div className="db-scale">
          <span className="r">{t('briefing.stop')} $61,800</span>
          <span className="g">{t('briefing.target')} $64,500</span>
        </div>
      </div>

      {/* performance */}
      <div className="db-label">
        <span>{t('briefing.performance')}</span>
        <span className="db-sync"><span className="db-dot" /> {t('briefing.syncedFrom', { exchange: 'Bybit' })}</span>
      </div>
      <div className="db-card db-perf">
        <div className="db-perf-head">
          <div>
            <div className="db-big">+$1,240</div>
            <div className="db-chg">{t('briefing.thisWeek')} · <b>+4.8%</b> · {t('briefing.trades', { count: 18 })}</div>
          </div>
          <svg width="130" height="42" viewBox="0 0 130 42" fill="none">
            <defs><linearGradient id="db-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#26d07c" stopOpacity=".35" /><stop offset="1" stopColor="#26d07c" stopOpacity="0" /></linearGradient></defs>
            <path d="M2 34 L20 30 L38 33 L56 22 L74 26 L92 14 L110 18 L128 6" stroke="#26d07c" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 34 L20 30 L38 33 L56 22 L74 26 L92 14 L110 18 L128 6 L128 42 L2 42 Z" fill="url(#db-g)" />
            <circle cx="128" cy="6" r="3" fill="#26d07c" />
          </svg>
        </div>
        <div className="db-grid3">
          <div className="db-stat"><div className="v up">61%</div><div className="k">{t('briefing.winRate')}</div></div>
          <div className="db-stat"><div className="v">2.1R</div><div className="k">{t('briefing.avgRR')}</div></div>
          <div className="db-stat"><div className="v up">+$68</div><div className="k">{t('briefing.today')}</div></div>
        </div>
        <div className="db-grid3" style={{ marginTop: 8 }}>
          <div className="db-stat"><div className="v up">+$96</div><div className="k">{t('briefing.avgWin')}</div></div>
          <div className="db-stat"><div className="v" style={{ color: '#ff5c5c' }}>-$41</div><div className="k">{t('briefing.avgLoss')}</div></div>
          <div className="db-stat"><div className="v up">+$320</div><div className="k">{t('briefing.bestTrade')}</div></div>
        </div>
      </div>

      {/* recent closed trades */}
      <div className="db-label"><span>{t('briefing.recentTitle')}</span></div>
      <div>
        <div className="db-recent"><span className="s">ETHUSDT</span><span className="v up">+$120</span></div>
        <div className="db-recent"><span className="s">SOLUSDT</span><span className="v down">-$92</span></div>
        <div className="db-recent"><span className="s">BTCUSDT</span><span className="v up">+$210</span></div>
      </div>

      {/* discipline */}
      <div className="db-label"><span>{t('briefing.disciplineTitle')}</span></div>
      <div className="db-card db-disc">
        <div className="db-gauge">
          <svg width="62" height="62" viewBox="0 0 62 62">
            <circle cx="31" cy="31" r="26" stroke="rgba(255,255,255,.08)" strokeWidth="6" fill="none" />
            <circle cx="31" cy="31" r="26" stroke="#26d07c" strokeWidth="6" fill="none" strokeLinecap="round" strokeDasharray="163" strokeDashoffset="34" transform="rotate(-90 31 31)" />
          </svg>
          <div style={{ position: 'absolute', textAlign: 'center' }}><div className="num">79</div><div className="lbl">{t('briefing.disciplineLabel')}</div></div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="t">{t('briefing.statusLine', { state: t('briefing.focused') })}</div>
          <div className="d">{t('briefing.disciplineDesc')}</div>
          <div className="db-streak">🔥 {t('briefing.streak', { days: 7 })}</div>
        </div>
      </div>

      {/* action items */}
      <div className="db-label"><span>{t('briefing.todoTitle')}</span></div>
      <div>
        <div className="db-item">
          <div className="db-ic">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
          </div>
          <div className="db-tx">{t('briefing.todoMorning')}<small>{t('briefing.todoMorningSub')}</small></div>
        </div>
        <div className="db-item">
          <div className="db-ic">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m7 14 4-4 3 3 5-6" /></svg>
          </div>
          <div className="db-tx">{t('briefing.todoReview')}<small>{t('briefing.todoReviewSub', { symbol: 'SOLUSDT', pnl: '-$92' })}</small></div>
        </div>
      </div>
    </div>
  );
}
