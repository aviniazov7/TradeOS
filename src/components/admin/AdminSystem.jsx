import { useState, useEffect } from 'react';
import { Check, AlertTriangle, ChevronDown, RefreshCw, ExternalLink, ScrollText, Loader2 } from 'lucide-react';
import Card from '../shared/Card';
import { adminListAuditEvents } from '../../services/pushService';
import { Panel, Meter, softBtn } from './AdminUi';
import { KIND_META, cloudflareQuotaRows, relativeActive, displayName } from './adminUtils';

const DOT = { ok: 'bg-profit', loading: 'bg-text-muted', warn: 'bg-amber-500', bad: 'bg-loss' };
const STATUS_TEXT = {
  ok: { label: 'תקין', cls: 'text-profit' },
  loading: { label: '…', cls: 'text-text-secondary' },
  warn: { label: 'לבדיקה', cls: 'text-amber-400' },
  bad: { label: 'תקלה', cls: 'text-loss' },
};

function Tile({ label, value, pct, children }) {
  return (
    <div className="rounded-xl bg-bg-tertiary px-3.5 py-3 flex flex-col gap-2 min-w-0">
      <span className="text-xs text-text-secondary truncate">{label}</span>
      <b className="num-mono text-base text-text-primary truncate" dir="ltr" style={{ textAlign: 'right' }}>{value}</b>
      {pct != null && <Meter pct={pct} className="h-1" />}
      {children}
    </div>
  );
}

function AiDetails({ health, globalAi, aiStats, statsDays, setStatsDays, aiTest, aiTesting, runAiTest, users, onOpenUser, service }) {
  const ai = health.ai;
  const lastFail = service?.lastFail;
  // Today's bar is backfilled from the live counters — token metering only
  // accrues going forward, so the stored day can lag behind real usage.
  const series = (aiStats?.stats || []).map((s) => (globalAi && s.date === globalAi.date
    ? { ...s, text: Math.max(s.text, globalAi.totalText || 0), image: Math.max(s.image, globalAi.totalImage || 0) }
    : s));
  const totals = series.map((s) => s.text + s.image);
  const max = Math.max(1, ...totals);
  const totReq = totals.reduce((a, n) => a + n, 0);
  const tokens = series.reduce((a, s) => a + s.tokIn + s.tokOut, 0);
  const cost = series.reduce((a, s) => a + s.tokIn * 0.59 + s.tokOut * 0.79, 0) / 1e6;
  const topUsers = Object.entries(globalAi?.perUser || {})
    .map(([uid, v]) => ({ uid, text: v.text || 0, image: v.image || 0, u: users.find((x) => x.id === uid) }))
    .sort((a, b) => (b.text + b.image) - (a.text + a.image))
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-3">
      {lastFail && (
        <div className="rounded-xl border border-loss/30 bg-loss/8 px-3.5 py-3 text-sm">
          <div className="font-bold text-loss mb-1.5">כל הספקים נכשלו {relativeActive(lastFail.t)}</div>
          <ul className="space-y-1">
            {(lastFail.fails || []).map((f, i) => (
              <li key={i} className="text-xs text-text-secondary">
                <b className="text-text-primary" dir="ltr">{f.provider} · {f.model}</b> — {f.status}
                {f.detail && <span className="block font-mono text-[11px] text-text-muted truncate" dir="ltr" title={f.detail}>{f.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {ai && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[
            { role: 'Premium', model: ai.models.premiumText, limit: ai.limits.premiumDaily },
            { role: 'חינם', model: ai.models.freeText, limit: ai.limits.freeDaily },
            { role: 'תמונות', model: ai.models.vision, limit: ai.limits.imageDaily },
          ].map((m) => (
            <div key={m.role} className="rounded-xl bg-bg-tertiary px-3.5 py-3 min-w-0">
              <div className="flex items-center justify-between text-xs text-text-secondary">
                <span>{m.role}</span><span className="num-mono">{m.limit}/יום</span>
              </div>
              <div className="font-mono text-[12px] text-text-primary truncate mt-1.5" dir="ltr" title={m.model}>{m.model}</div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl bg-bg-tertiary px-3.5 py-3">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="text-xs text-text-secondary">בקשות ביום</span>
          <div className="inline-flex rounded-lg border border-border-primary p-0.5">
            {[7, 30].map((d) => (
              <button key={d} type="button" onClick={() => setStatsDays(d)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-colors ${statsDays === d ? 'bg-accent-primary/20 text-sky-200' : 'text-text-secondary hover:text-text-primary'}`}>
                {d} ימים
              </button>
            ))}
          </div>
        </div>
        {!aiStats ? (
          <div className="h-16 grid place-items-center text-text-secondary"><Loader2 className="w-4 h-4 animate-spin" /></div>
        ) : (
          <div dir="ltr" className="flex items-end gap-[3px] h-16">
            {series.map((s, i) => (
              <div key={s.date} className="flex-1 h-full flex items-end" title={`${s.date} · ${totals[i]} בקשות`}>
                <div className={`w-full rounded-t-[3px] ${i === series.length - 1 ? 'bg-accent-primary' : 'bg-accent-primary/40'}`}
                  style={{ height: totals[i] ? `${(totals[i] / max) * 100}%` : '2px', opacity: totals[i] ? 1 : 0.35 }} />
              </div>
            ))}
          </div>
        )}
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
          <span><b className="num-mono text-text-primary">{totReq.toLocaleString()}</b> בקשות</span>
          <span><b className="num-mono text-text-primary">{(tokens / 1000).toFixed(0)}K</b> טוקנים</span>
          <span>עלות אילו בתשלום <b className="num-mono text-text-primary">~${cost.toFixed(2)}</b></span>
        </div>
      </div>

      {topUsers.length > 0 && (
        <div className="rounded-xl bg-bg-tertiary px-3.5 py-2.5">
          <div className="text-xs text-text-secondary mb-1">הכי פעילים ב-AI היום</div>
          {topUsers.map((r) => (
            <button key={r.uid} type="button" onClick={() => r.u && onOpenUser(r.u)} disabled={!r.u}
              className="w-full flex items-center justify-between gap-3 py-1.5 text-sm text-right cursor-pointer disabled:cursor-default">
              <span className="text-text-primary truncate">{r.u ? displayName(r.u) : `${r.uid.slice(0, 8)}…`}</span>
              <span className="text-xs text-text-secondary shrink-0"><b className="num-mono text-text-primary">{r.text}</b> טקסט · <b className="num-mono text-text-primary">{r.image}</b> תמונה</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={runAiTest} disabled={aiTesting} className={softBtn}>
          <RefreshCw className={`w-4 h-4 ${aiTesting ? 'animate-spin' : ''}`} /> בדיקת חיבור
        </button>
        {aiTest && (aiTest.error ? <span className="text-xs text-loss">{aiTest.error}</span> : (
          [['Gemini', aiTest.gemini], ['Groq', aiTest.groq]].filter(([, r]) => r).map(([name, r]) => (
            <span key={name} className={`inline-flex items-center gap-1.5 text-xs ${r.ok ? 'text-profit' : 'text-loss'}`} title={r.error || ''}>
              <span className={`w-1.5 h-1.5 rounded-full ${r.ok ? 'bg-profit' : 'bg-loss'}`} />
              {name} {r.ok ? 'תקין' : `שגיאה ${r.status ?? ''}`}
            </span>
          ))
        ))}
      </div>
    </div>
  );
}

function ServiceDetails({ service, ...p }) {
  const { health, fbUsage, fbLoading, refreshFbUsage } = p;
  if (service.id === 'ai') return <AiDetails {...p} service={service} />;
  if (service.id === 'cloudflare') {
    return (
      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-2">
        {cloudflareQuotaRows(health.quotas).map((q) => (
          <Tile key={q.key} label={q.label} value={`${q.used.toLocaleString()} / ${q.limit.toLocaleString()}`} pct={q.pct} />
        ))}
        <p className="col-span-full text-xs text-text-secondary">ניצול היום (UTC) · מתעדכן כל 5 דקות</p>
      </div>
    );
  }
  if (service.id === 'firebase') {
    const c = fbUsage?.counts || {};
    const docs = [['משתמשים', c.users], ['עסקאות', c.trades], ['תשלומים', c.payments], ['לידרבורד', c.leaderboard]].filter(([, v]) => v != null);
    return (
      <div className="flex flex-col gap-3">
        {docs.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {docs.map(([label, v]) => <Tile key={label} label={label} value={v.toLocaleString()} />)}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={refreshFbUsage} disabled={fbLoading} className={softBtn}>
            <RefreshCw className={`w-4 h-4 ${fbLoading ? 'animate-spin' : ''}`} /> רענון
          </button>
          <a href="https://console.firebase.google.com/project/tradeos-91a58/usage" target="_blank" rel="noopener noreferrer" className={softBtn}>
            <ExternalLink className="w-4 h-4" /> מכסות מלאות במסוף Firebase
          </a>
        </div>
      </div>
    );
  }
  if (service.id === 'cron') {
    return (
      <p className="text-sm text-text-secondary leading-relaxed">
        שולח התראות על עסקאות שנסגרו, סיכום יומי ודוחות שבועיים. הדופק נרשם פעם בשעה
        {health.cronLast && <> · אחרון: <span className="num-mono text-text-primary">{new Date(health.cronLast).toLocaleString('he-IL')}</span></>}
      </p>
    );
  }
  return (
    <p className="text-sm text-text-secondary leading-relaxed">
      {health.pushConfigured ? 'מפתחות ההתראות מוגדרים. כל משתמש שאישר התראות יקבל אותן.' : 'חסר VAPID_JWK ב-Worker — אי אפשר לשלוח התראות לטלפון.'}
    </p>
  );
}

const fmtTs = (iso) => (iso ? relativeActive(iso) : '');

// The system tab: one line when all is well, a compact row per service that
// opens for details (on its own when something needs a look), and the
// latest admin actions.
export default function AdminSystem({ checks, users, auditKey, onOpenAudit, onOpenUser, ...p }) {
  const [open, setOpen] = useState({}); // id → bool (unset: open only when not ok)
  const [events, setEvents] = useState(null);

  useEffect(() => {
    let cancelled = false;
    adminListAuditEvents({ limit: 6 })
      .then((ev) => { if (!cancelled) setEvents(ev || []); })
      .catch(() => { if (!cancelled) setEvents([]); });
    return () => { cancelled = true; };
  }, [auditKey]);

  const userLabel = (uid) => {
    const u = uid && users.find((x) => x.id === uid);
    return u ? displayName(u) : uid ? (uid.includes('@') ? uid : `${uid.slice(0, 8)}…`) : '';
  };

  const { services, issues, level } = checks;
  const allOk = level === 'ok';

  return (
    <div className="space-y-4">
      <section aria-label="מצב המערכת" className={`flex flex-wrap items-center gap-4 p-5 rounded-2xl border ${
        level === 'loading' ? 'bg-bg-secondary border-border-primary'
          : allOk ? 'bg-profit/7 border-profit/25'
            : level === 'bad' ? 'bg-loss/7 border-loss/30' : 'bg-amber-500/7 border-amber-500/30'
      }`}>
        <span className={`w-12 h-12 rounded-full grid place-items-center shrink-0 ${
          level === 'loading' ? 'bg-bg-tertiary text-text-secondary' : allOk ? 'bg-profit/16 text-profit' : level === 'bad' ? 'bg-loss/15 text-loss' : 'bg-amber-500/15 text-amber-400'
        }`}>
          {level === 'loading' ? <Loader2 className="w-6 h-6 animate-spin" /> : allOk ? <Check className="w-6 h-6" strokeWidth={2.6} /> : <AlertTriangle className="w-6 h-6" />}
        </span>
        <div className="flex-1 basis-56">
          <div className="text-xl font-extrabold text-text-primary">
            {level === 'loading' ? 'בודק את המערכת…' : allOk ? 'כל המערכות תקינות' : issues.length === 1 ? issues[0] : `${issues.length} דברים דורשים בדיקה`}
          </div>
          {level !== 'loading' && (
            <div className="text-sm text-text-secondary mt-0.5">
              {services.length} שירותים · {allOk ? 'שירות שמתקרב למכסה ייפתח כאן לבד' : 'השירותים הרלוונטיים פתוחים למטה'}
            </div>
          )}
        </div>
      </section>

      {services.length > 0 && (
        <Card className="rounded-2xl p-2">
          <h2 className="text-[15px] font-bold text-text-primary px-3 pt-3 pb-2">שירותים</h2>
          {services.map((s) => {
            const isOpen = open[s.id] ?? (s.status === 'warn' || s.status === 'bad');
            const st = STATUS_TEXT[s.status];
            return (
              <div key={s.id} className="border-t border-border-primary/70">
                <button type="button" onClick={() => setOpen((o) => ({ ...o, [s.id]: !isOpen }))} aria-expanded={isOpen}
                  className={`w-full min-h-16 flex flex-wrap items-center gap-3.5 px-3 py-3.5 rounded-xl text-right cursor-pointer transition-colors ${isOpen ? 'bg-bg-tertiary/60' : 'hover:bg-bg-tertiary/40'}`}>
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT[s.status]}`} />
                  <span className="flex-1 basis-52 min-w-0 flex flex-col gap-0.5">
                    <span className="text-[15px] font-bold text-text-primary">{s.name}</span>
                    <span className="text-[13px] text-text-secondary truncate">{s.sub}</span>
                  </span>
                  {s.pct != null && (
                    <span className="hidden sm:flex items-center gap-2">
                      <Meter pct={s.pct} className="w-[120px]" />
                      <span dir="ltr" className="w-10 text-xs text-text-secondary num-mono text-right">{s.pct > 0 && s.pct < 1 ? '<1' : Math.round(s.pct)}%</span>
                    </span>
                  )}
                  <span className={`text-xs font-bold ${st.cls}`}>{st.label}</span>
                  <ChevronDown className={`w-[18px] h-[18px] text-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="px-3 pt-1 pb-4">
                    <ServiceDetails service={s} users={users} onOpenUser={onOpenUser} {...p} />
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      <Panel
        title="יומן פעולות"
        action={<button type="button" onClick={onOpenAudit} className="text-[13px] font-semibold text-accent-hover hover:text-accent-primary cursor-pointer">הצגת הכל</button>}
        bodyClassName="-mt-1"
      >
        {events === null ? (
          <div className="py-4 text-center text-text-secondary"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
        ) : events.length === 0 ? (
          <div className="text-sm text-text-secondary py-3">אין עדיין פעולות</div>
        ) : events.map((ev, i) => {
          const meta = KIND_META[ev.kind] || { label: ev.kind, tile: 'bg-bg-tertiary text-text-secondary', Icon: ScrollText };
          const Icon = meta.Icon;
          const target = ev.kind === 'account_deleted' ? (ev.displayName || ev.email || userLabel(ev.target)) : userLabel(ev.target);
          const extra = [
            ev.code && ev.code,
            ev.days != null && `${ev.days} ימים`,
            ev.sent != null && `נשלח ל-${ev.sent}${ev.total != null ? `/${ev.total}` : ''}`,
            ev.targeted != null && `${ev.targeted} נמענים`,
            (ev.title || ev.subject) && `"${ev.title || ev.subject}"`,
          ].filter(Boolean).join(' · ');
          return (
            <div key={i} className="flex items-center gap-3 py-3 border-t border-border-primary first:border-t-0 text-sm">
              <span className={`w-8 h-8 rounded-[10px] grid place-items-center shrink-0 ${meta.tile}`}><Icon className="w-[15px] h-[15px]" /></span>
              <span className="flex-1 min-w-0 line-clamp-2 leading-snug">
                <span className="text-text-primary">{meta.label}{target ? ` · ${target}` : ''}</span>
                {extra && <span className="text-text-secondary"> · {extra}</span>}
              </span>
              <span className="text-xs text-text-secondary whitespace-nowrap">{fmtTs(ev.ts_iso)}</span>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}
