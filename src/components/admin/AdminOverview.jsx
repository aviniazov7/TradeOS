import { Users, Activity, Crown, UserPlus, Clock, Plug, Hourglass, Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react';
import Card from '../shared/Card';
import { Panel, Pill, Avatar, softBtn } from './AdminUi';
import { ILS, RISK_DAYS, DAY_MS, createdMs, daysUntilExpiry, displayName, relativeActive } from './adminUtils';

function Kpi({ icon: Icon, label, value, sub, subTone = 'text-text-secondary' }) {
  return (
    <Card spotlight className="rounded-2xl p-4 md:p-[18px] flex flex-col gap-2.5 min-w-0">
      <div className="flex items-center justify-between gap-2 text-[13px] font-medium text-text-secondary">
        <span className="truncate">{label}</span>
        {Icon && <Icon className="w-4 h-4 shrink-0" />}
      </div>
      <div className="num-mono text-3xl md:text-[34px] font-extrabold leading-none text-text-primary" dir="ltr" style={{ textAlign: 'right' }}>{value}</div>
      {sub && <div className={`text-xs font-semibold truncate ${subTone}`}>{sub}</div>}
    </Card>
  );
}

const TONES = {
  amber: 'bg-amber-500/12 text-amber-400',
  violet: 'bg-violet-500/14 text-violet-300',
  blue: 'bg-accent-primary/14 text-sky-300',
  red: 'bg-loss/12 text-loss',
};

function TodoRow({ icon: Icon, tone, title, sub, onTitle, action, onAction }) {
  return (
    <div className="flex flex-wrap items-center gap-3.5 py-3.5 border-t border-border-primary first:border-t-0">
      <span className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${TONES[tone]}`}>
        {Icon && <Icon className="w-[18px] h-[18px]" />}
      </span>
      <button type="button" onClick={onTitle} disabled={!onTitle}
        className="flex-1 basis-56 min-w-0 text-right cursor-pointer disabled:cursor-default">
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        {sub && <div className="text-[13px] text-text-secondary mt-0.5 truncate">{sub}</div>}
      </button>
      <button type="button" onClick={onAction} className={softBtn}>{action}</button>
    </div>
  );
}

const namesLine = (list) => {
  const names = list.slice(0, 2).map((u) => (u.displayName || u.email || '').split(' ')[0]).filter(Boolean);
  const rest = list.length - names.length;
  return names.join(', ') + (rest > 0 ? ` ועוד ${rest}` : '');
};

// The first tab: four numbers, what needs doing now, and who just joined.
export default function AdminOverview({
  users, now, stats, analytics, growth, segments, expiringSoon, quotaAlerts, systemIssues,
  onRemind, onOpenUser, onShowList, onGoTab,
}) {
  const new30 = users.filter((u) => now - createdMs(u) <= 30 * DAY_MS).length;
  const prev30 = users.filter((u) => { const age = now - createdMs(u); return age > 30 * DAY_MS && age <= 60 * DAY_MS; }).length;
  const diff = new30 - prev30;
  const wauPct = users.length ? Math.round((growth.wau / users.length) * 100) : 0;

  const todos = [];
  if (systemIssues.length) {
    todos.push({
      key: 'system', icon: AlertTriangle, tone: 'red',
      title: `בעיה במערכת: ${systemIssues[0]}`,
      sub: systemIssues.length > 1 ? `ועוד ${systemIssues.length - 1} התראות` : 'פרטים בלשונית מערכת',
      action: 'למערכת', onAction: () => onGoTab('system'),
    });
  }
  if (segments.inactive.length) {
    todos.push({
      key: 'inactive', icon: Clock, tone: 'amber',
      title: `${segments.inactive.length} משתמשים לא נכנסו כבר ${RISK_DAYS}+ ימים`,
      sub: `${namesLine(segments.inactive)} · בסיכון נטישה`,
      onTitle: () => onShowList(`לא נכנסו ${RISK_DAYS}+ ימים`, segments.inactive),
      action: 'שליחת תזכורת', onAction: () => onRemind('inactive'),
    });
  }
  if (segments.churned.length) {
    todos.push({
      key: 'churned', icon: Crown, tone: 'violet',
      title: `${segments.churned.length} לקוחות Premium לא נכנסו שבוע+`,
      sub: namesLine(segments.churned),
      onTitle: () => onShowList('Premium בסיכון נטישה', segments.churned),
      action: 'שליחת תזכורת', onAction: () => onRemind('churned'),
    });
  }
  if (expiringSoon.length === 1) {
    const u = expiringSoon[0];
    const d = daysUntilExpiry(u);
    todos.push({
      key: 'expiring', icon: Hourglass, tone: 'violet',
      title: `מנוי Premium מסתיים ${d === 0 ? 'היום' : d === 1 ? 'מחר' : `בעוד ${d} ימים`}`,
      sub: displayName(u),
      onTitle: () => onOpenUser(u),
      action: 'פתיחת משתמש', onAction: () => onOpenUser(u),
    });
  } else if (expiringSoon.length > 1) {
    todos.push({
      key: 'expiring', icon: Hourglass, tone: 'violet',
      title: `${expiringSoon.length} מנויי Premium מסתיימים השבוע`,
      sub: namesLine(expiringSoon),
      onTitle: () => onShowList('מנויים שמסתיימים השבוע', expiringSoon),
      action: 'הצגה', onAction: () => onShowList('מנויים שמסתיימים השבוע', expiringSoon),
    });
  }
  if (segments.notOnboarded.length) {
    todos.push({
      key: 'onboarding', icon: Plug, tone: 'blue',
      title: `${segments.notOnboarded.length} נרשמו ועדיין לא השלימו את ההגדרה הראשונית`,
      sub: 'נרשמו בשבועיים האחרונים · בלי הגדרה ראשונית קשה להתחיל',
      onTitle: () => onShowList('לא השלימו הגדרה ראשונית', segments.notOnboarded),
      action: 'שליחת תזכורת', onAction: () => onRemind('notOnboarded'),
    });
  }
  if (quotaAlerts.length) {
    const list = quotaAlerts.map((a) => a.u).filter(Boolean);
    todos.push({
      key: 'quota', icon: Sparkles, tone: 'amber',
      title: `${quotaAlerts.length} משתמשים קרובים למכסת ה-AI היום`,
      sub: 'מעל 80% מהמכסה היומית',
      onTitle: () => onShowList('קרובים למכסת AI', list),
      action: 'הצגה', onAction: () => onShowList('קרובים למכסת AI', list),
    });
  }

  const signups = growth.signups;
  const maxSignup = Math.max(1, ...signups.map((s) => s.count));
  const totalSignups = signups.reduce((a, s) => a + s.count, 0);
  const recent = [...users].sort((a, b) => createdMs(b) - createdMs(a)).slice(0, 5);

  return (
    <div className="space-y-4">
      <section aria-label="מספרים עיקריים" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Users} label="משתמשים" value={users.length} sub={`${growth.dau} פעילים היום`} />
        <Kpi icon={Activity} label="פעילים השבוע" value={growth.wau} sub={`${wauPct}% מהמשתמשים`} />
        <Kpi icon={Crown} label="Premium" value={stats.premium.length}
          sub={`${ILS(analytics.mrr)} בחודש · ${analytics.conversion}% המרה`} />
        <Kpi icon={UserPlus} label="חדשים החודש" value={new30}
          sub={diff === 0 ? 'כמו החודש הקודם' : <><span dir="ltr">{diff > 0 ? '+' : '−'}{Math.abs(diff)}</span> מול החודש הקודם</>}
          subTone={diff > 0 ? 'text-profit' : diff < 0 ? 'text-loss' : 'text-text-secondary'} />
      </section>

      <Panel
        title="דורש טיפול"
        badge={todos.length > 0 && <Pill className="text-amber-400 bg-amber-500/14">{todos.length}</Pill>}
        bodyClassName="-mt-1"
      >
        {todos.length === 0 ? (
          <div className="flex items-center gap-2.5 py-3 text-sm text-text-secondary">
            <CheckCircle2 className="w-5 h-5 text-profit shrink-0" />
            אין כרגע משהו שדורש טיפול
          </div>
        ) : todos.map(({ key, ...t }) => <TodoRow key={key} {...t} />)}
      </Panel>

      <div className="flex flex-wrap gap-3 items-start">
        <Panel
          title="הצטרפות · 30 יום"
          className="flex-[999_1_520px] min-w-0"
          action={<span className="text-[13px] text-text-secondary">סה״כ <b className="num-mono text-text-primary">{totalSignups}</b></span>}
        >
          <div dir="ltr" className="flex items-end gap-1 h-[150px] pt-1.5">
            {signups.map((s, i) => {
              const today = i === signups.length - 1;
              return (
                <div key={i} className="flex-1 h-full flex items-end" title={`${s.date.getDate()}/${s.date.getMonth() + 1} · ${s.count} הרשמות`}>
                  <div
                    className={`w-full rounded-t-[4px] rounded-b-[2px] transition-all duration-500 ${today ? 'bg-accent-primary' : 'bg-accent-primary/40'}`}
                    style={{ height: s.count ? `${(s.count / maxSignup) * 100}%` : '2px', opacity: s.count ? 1 : 0.35 }}
                  />
                </div>
              );
            })}
          </div>
          <div dir="ltr" className="flex justify-between text-xs text-text-secondary mt-2">
            <span>לפני 30 יום</span><span>היום</span>
          </div>
        </Panel>

        <Panel
          title="הצטרפו לאחרונה"
          className="flex-[1_1_300px] min-w-0"
          action={<button type="button" onClick={() => onGoTab('users')} className="text-[13px] font-semibold text-accent-hover hover:text-accent-primary cursor-pointer">לכל המשתמשים</button>}
        >
          {recent.length === 0 ? (
            <div className="text-sm text-text-secondary py-4">עדיין אין משתמשים</div>
          ) : (
            <div className="-my-1">
              {recent.map((u) => (
                <button key={u.id} type="button" onClick={() => onOpenUser(u)}
                  className="w-full flex items-center gap-3 py-2 text-right rounded-lg hover:bg-bg-tertiary/60 transition-colors cursor-pointer">
                  <Avatar user={u} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-text-primary truncate">{displayName(u)}</div>
                    <div className="text-xs text-text-secondary">{relativeActive(u.createdAt)}</div>
                  </div>
                  {u.onboardingCompleted
                    ? <Pill className="text-profit bg-profit/12 font-semibold">הגדרה הושלמה</Pill>
                    : <Pill className="text-text-secondary bg-bg-tertiary font-semibold">ללא הגדרה</Pill>}
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
