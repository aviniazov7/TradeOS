import { useState, useEffect } from 'react';
import { Plus, Plug, Mail, Loader2, Settings2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '../shared/Card';
import { adminListCoupons } from '../../services/couponService';
import { adminSendTestDigest } from '../../services/pushService';
import { Panel, Pill, Meter, softBtn } from './AdminUi';
import { DAY_MS, ILS, createdMs, lastActiveMs, activeWithin, formatDate } from './adminUtils';

// Share of customers who came back, each measured only over those old enough
// for the window to make sense.
function retentionOf(customers) {
  const now = Date.now();
  const rate = (pool, test) => (pool.length ? Math.round((pool.filter(test).length / pool.length) * 100) : null);
  const olderThan = (days) => customers.filter((u) => { const c = createdMs(u); return c > 0 && now - c > days * DAY_MS; });
  return [
    { label: 'אחרי יום', pct: rate(olderThan(1), (u) => lastActiveMs(u) - createdMs(u) > DAY_MS), sub: 'חזרו אחרי יום ההרשמה' },
    { label: 'אחרי שבוע', pct: rate(olderThan(7), (u) => activeWithin(u, 7)), sub: 'פעילים בשבוע האחרון' },
    { label: 'אחרי חודש', pct: rate(olderThan(30), (u) => activeWithin(u, 30)), sub: 'פעילים בחודש האחרון' },
  ];
}

function couponState(c) {
  const cap = Number.isFinite(c.maxUses) && c.maxUses > 0 ? c.maxUses : null;
  const used = Number(c.used) || 0;
  const expired = c.expiresAt ? new Date(c.expiresAt).getTime() < Date.now() : false;
  const full = cap != null && used >= cap;
  return { cap, used, done: expired || full, label: expired ? 'פג' : full ? 'נגמר' : 'פעיל' };
}

// The growth tab: the new-user journey, how many come back, revenue, coupons.
export default function AdminGrowth({ users, funnel, analytics, revenueSeries, couponsKey, onOpenCoupons }) {
  const [coupons, setCoupons] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    adminListCoupons()
      .then((list) => { if (!cancelled) setCoupons(list || []); })
      .catch(() => { if (!cancelled) setCoupons([]); });
    return () => { cancelled = true; };
  }, [couponsKey]);

  const customers = users.filter((u) => u.role !== 'admin');
  const retention = retentionOf(customers);

  const stages = funnel.stages;
  const top = stages[0]?.count || 0;
  // The step that loses the biggest share of the previous one.
  const worst = stages.reduce((best, s, i) => (i > 0 && stages[i - 1].count > 0 && s.dropPct > (best?.dropPct || 0) ? { ...s, prev: stages[i - 1].count } : best), null);

  const months = revenueSeries.slice(-6);
  const maxMonth = Math.max(1, ...months.map((m) => m.total));
  const thisMonth = revenueSeries[revenueSeries.length - 1]?.total || 0;
  const lastMonth = revenueSeries[revenueSeries.length - 2]?.total || 0;
  const revDiff = thisMonth - lastMonth;

  const sendDigest = async () => {
    setSending(true);
    try {
      const r = await adminSendTestDigest();
      toast.success(`הדוח נשלח ל-${r.sentTo}`);
    } catch (e) {
      toast.error(e.message || 'שליחת המייל נכשלה');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="המסע של משתמש חדש" action={<span className="text-[13px] text-text-secondary">מהרשמה ועד פעילות קבועה</span>}>
        {top === 0 ? (
          <div className="text-sm text-text-secondary py-4">אין עדיין משתמשים להצגה</div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {stages.map((s, i) => {
              const conv = i === 0 || !stages[i - 1].count ? null : Math.round((s.count / stages[i - 1].count) * 100);
              const isWorst = worst && worst.key === s.key;
              return (
                <div key={s.key} title={s.note} className="grid grid-cols-[minmax(96px,170px)_minmax(0,1fr)_48px] gap-3 items-center">
                  <span className="text-sm font-semibold text-text-secondary truncate">{s.label}</span>
                  <div className="h-[34px] rounded-[10px] bg-bg-tertiary overflow-hidden">
                    <div className="h-full rounded-[10px] bg-gradient-to-l from-accent-primary to-accent-muted flex items-center px-3 text-sm font-extrabold text-white num-mono transition-all duration-500"
                      style={{ width: `${s.count ? Math.max(8, (s.count / top) * 100) : 0}%` }}>
                      {s.count}
                    </div>
                  </div>
                  <span className={`text-[13px] font-bold num-mono text-left ${isWorst ? 'text-amber-400' : 'text-text-secondary'}`}>{conv == null ? '' : `${conv}%`}</span>
                </div>
              );
            })}
            {worst && (
              <div className="mt-1.5 flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-amber-500/8 border border-amber-500/25 text-sm">
                <Plug className="w-[18px] h-[18px] text-amber-400 shrink-0" />
                <span>
                  <b className="text-text-primary">הנפילה הגדולה: {worst.label}.</b>{' '}
                  <span className="text-text-secondary">{worst.prev - worst.count} מתוך {worst.prev} עצרו כאן — שם כדאי להשקיע.</span>
                </span>
              </div>
            )}
          </div>
        )}
      </Panel>

      <div className="flex flex-wrap gap-3">
        <Panel title="כמה חוזרים" className="flex-[1_1_340px] min-w-0">
          <div className="grid grid-cols-3 gap-2.5">
            {retention.map((r) => (
              <div key={r.label} className="rounded-2xl bg-bg-tertiary px-3.5 py-4 flex flex-col gap-1.5 min-w-0" title={r.sub}>
                <span className="text-[13px] text-text-secondary">{r.label}</span>
                <b className="num-mono text-[26px] md:text-[28px] font-extrabold text-text-primary leading-none">{r.pct == null ? '—' : `${r.pct}%`}</b>
                <Meter pct={r.pct || 0} color="bg-accent-primary" className="h-1" />
              </div>
            ))}
          </div>
          <p className="mt-3 text-[13px] text-text-secondary">מתוך מי שנרשם לפני יותר מאותה תקופה</p>
        </Panel>

        <Panel title="הכנסות" className="flex-[1_1_340px] min-w-0"
          action={<span className="text-[13px] text-text-secondary">סה״כ {ILS(analytics.totalRevenue)}</span>}>
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <b className="num-mono text-[34px] font-extrabold text-text-primary leading-none">{ILS(analytics.mrr)}</b>
            <span className="text-[13px] text-text-secondary">בחודש (MRR)</span>
            {revDiff !== 0 && (
              <span className={`text-xs font-bold ${revDiff > 0 ? 'text-profit' : 'text-loss'}`}>
                <span dir="ltr">{revDiff > 0 ? '+' : '−'}{ILS(Math.abs(revDiff))}</span> מהחודש הקודם
              </span>
            )}
          </div>
          {analytics.totalRevenue === 0 ? (
            <div className="mt-4 text-[13px] text-text-secondary">רשמו סכום ששולם בעת הענקת Premium כדי לראות כאן הכנסות.</div>
          ) : (
            <div dir="ltr" className="mt-4 flex items-end gap-2.5 h-24">
              {months.map((m, i) => (
                <div key={m.full} className="flex-1 h-full flex flex-col items-center justify-end gap-1.5" title={`${m.full} · ${ILS(m.total)}`}>
                  <div className={`w-full rounded-t-md rounded-b-[3px] ${i === months.length - 1 ? 'bg-profit' : 'bg-profit/35'}`}
                    style={{ height: m.total ? `${Math.max(6, (m.total / maxMonth) * 72)}px` : '3px' }} />
                  <span className="text-[11px] text-text-secondary">{m.label}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="קופונים"
        action={(
          <div className="flex gap-2">
            <button type="button" onClick={onOpenCoupons} className={softBtn}><Plus className="w-4 h-4" /> קופון חדש</button>
          </div>
        )}
        bodyClassName="-mt-1"
      >
        {coupons === null ? (
          <div className="py-4 text-center text-text-secondary"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
        ) : coupons.length === 0 ? (
          <div className="text-sm text-text-secondary py-3">עדיין אין קופונים</div>
        ) : (
          <>
            {coupons.slice(0, 5).map((c) => {
              const st = couponState(c);
              return (
                <button key={c.code} type="button" onClick={onOpenCoupons}
                  className={`w-full flex flex-wrap items-center gap-3.5 py-3 border-t border-border-primary first:border-t-0 text-right cursor-pointer ${st.done ? 'opacity-60' : ''}`}>
                  <code dir="ltr" className="text-[13px] font-bold tracking-wide px-2.5 py-1.5 rounded-lg bg-bg-tertiary border border-dashed border-border-hover text-text-primary">{c.code}</code>
                  <span className="flex-1 basis-40 text-sm text-text-secondary">
                    {c.days} ימי Premium · {st.used} {st.cap ? `מתוך ${st.cap}` : ''} מומשו
                    {c.expiresAt && <span className="text-text-muted"> · עד {formatDate(c.expiresAt)}</span>}
                  </span>
                  {st.cap && <Meter pct={(st.used / st.cap) * 100} color={st.done ? 'bg-text-muted' : 'bg-accent-primary'} className="w-[120px] h-1" />}
                  <Pill className={st.done ? 'text-text-secondary bg-bg-tertiary' : 'text-profit bg-profit/12'}>{st.label}</Pill>
                </button>
              );
            })}
            {coupons.length > 5 && (
              <button type="button" onClick={onOpenCoupons} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent-hover hover:text-accent-primary cursor-pointer">
                <Settings2 className="w-3.5 h-3.5" /> כל {coupons.length} הקופונים
              </button>
            )}
          </>
        )}
      </Panel>

      <Card className="rounded-2xl px-4 py-3 md:px-5 flex flex-wrap items-center gap-3">
        <Mail className="w-[18px] h-[18px] text-text-secondary shrink-0" />
        <span className="flex-1 basis-48 text-sm text-text-secondary">הדוח השבועי נשלח אליך במייל אוטומטית</span>
        <button type="button" onClick={sendDigest} disabled={sending} className={softBtn}>
          {sending && <Loader2 className="w-4 h-4 animate-spin" />} שלח לי עכשיו
        </button>
      </Card>
    </div>
  );
}
