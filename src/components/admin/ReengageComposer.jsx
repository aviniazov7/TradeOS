import { useState } from 'react';
import { Send, Loader2, Mail, Bell, FlaskConical, Sparkles, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { adminSendBulkNotification, adminSendEmailCampaign, adminGenerateMarketHook } from '../../services/pushService';
import SelectDropdown from '../shared/SelectDropdown';

// Ready-made "come back" messages — a click fills the form, then edit freely.
const TEMPLATES = [
  {
    label: 'מזמן לא ראינו אותך',
    title: 'מתגעגעים אליך ב-TradeOS 👋',
    body: 'עבר זמן מאז הביקור האחרון שלך. היומן, האנליטיקה והסנכרון מהבורסה מחכים — כמה דקות ביום עושות את ההבדל במסחר.',
    cta: 'חזרה ל-TradeOS',
    path: '/',
  },
  {
    label: 'מה חדש',
    title: 'חדש ב-TradeOS ✨',
    body: 'הוספנו ניתוח לפי R, רווח/הפסד חי לעסקאות פתוחות, ומיון וסינונים חדשים ביומן. כנסו לראות מה השתנה.',
    cta: 'לראות מה חדש',
    path: '/journal?tab=analytics',
  },
  {
    label: 'תזכורת לתעד',
    title: 'תיעדת את העסקאות של השבוע?',
    body: 'סוחרים שמתעדים כל עסקה משתפרים מהר יותר. סנכרן מהבורסה או הוסף עסקה ידנית — זה לוקח דקה.',
    cta: 'ליומן המסחר',
    path: '/journal',
  },
];

// Where the email button / notification tap leads.
const DESTINATIONS = [
  { path: '/', label: 'דף הבית' },
  { path: '/market', label: 'סקירת שוק' },
  { path: '/news', label: 'חדשות' },
  { path: '/journal', label: 'יומן מסחר' },
  { path: '/journal?tab=analytics', label: 'אנליטיקה' },
  { path: '/mentality', label: 'האזור המנטלי' },
  { path: '/premium', label: 'Premium' },
];

// Same look as the app's SelectDropdown so inputs and the destination menu match.
const field = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent-primary transition-colors';

function ChannelToggle({ checked, onChange, icon: Icon, label, hint, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      aria-pressed={checked}
      className={`flex-1 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-right transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? 'bg-accent-primary/10 border-accent-primary/40' : 'bg-bg-tertiary border-border-primary hover:border-border-hover'
      }`}
    >
      {Icon && <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${checked ? 'text-accent-primary' : 'text-text-muted'}`} />}
      <span className="min-w-0">
        <span className={`block text-sm font-semibold ${checked ? 'text-accent-primary' : 'text-text-primary'}`}>{label}</span>
        <span className="block text-[11px] text-text-muted">{hint}</span>
      </span>
    </button>
  );
}

// Compose and send a reminder to one user or many, by push and/or email.
//   recipients: [{ id, email, name }]
// Push reaches only devices that allowed notifications; email reaches
// everyone with an address — that's why both channels exist.
export default function ReengageComposer({ recipients, onSent }) {
  const { user: me } = useAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [cta, setCta] = useState('כניסה ל-TradeOS');
  const [path, setPath] = useState('/');
  const [usePush, setUsePush] = useState(true);
  const [useEmail, setUseEmail] = useState(true);
  const [sending, setSending] = useState(null); // 'all' | 'test' | null
  // Short phone-notification text (the AI writes one); empty = the message's start.
  const [pushText, setPushText] = useState('');
  // The real market numbers the AI copy was built from — shown for review.
  const [hook, setHook] = useState(null); // { facts, source }
  const [generating, setGenerating] = useState(false);

  const generate = async () => {
    setGenerating(true);
    try {
      const h = await adminGenerateMarketHook();
      setTitle(h.title); setBody(h.email); setPushText(h.push); setCta(h.cta); setPath(h.path);
      setHook({ facts: h.facts, source: h.source });
    } catch (e) {
      toast.error(e.message || 'יצירת ההודעה נכשלה');
    } finally {
      setGenerating(false);
    }
  };

  // Email is advertising, so it only reaches users who opted in to it (the
  // Worker checks again). Push needs the device's own permission instead.
  const withEmail = recipients.filter((r) => r.email && r.marketing);
  const ready = title.trim() && body.trim() && (usePush || useEmail);

  const applyTemplate = (t) => { setTitle(t.title); setBody(t.body); setCta(t.cta); setPath(t.path); setPushText(''); setHook(null); };
  const pushBody = (pushText.trim() || body.trim()).slice(0, 400);

  // Sends through the chosen channels and reports both results in one toast,
  // one plain line per channel.
  const deliver = async (targets, mode) => {
    setSending(mode);
    const lines = [];
    let failed = false;
    let anySent = false;
    const single = targets.length === 1;
    try {
      if (usePush && targets.some((r) => r.id)) {
        try {
          const r = await adminSendBulkNotification({ uids: targets.map((t) => t.id).filter(Boolean), title: title.trim(), body: pushBody, url: path });
          const n = r?.recipients ?? 0;
          if (n > 0) anySent = true;
          lines.push(n > 0
            ? `התראה לטלפון נשלחה ל-${n === 1 ? 'משתמש אחד' : `${n} משתמשים`}`
            : single ? 'התראה לטלפון לא נשלחה — המשתמש לא אישר התראות' : 'התראה לטלפון לא נשלחה — אף אחד מהנמענים לא אישר התראות');
        } catch (e) { failed = true; lines.push(`ההתראה לא נשלחה: ${e.message}`); }
      }
      const mailTargets = targets.filter((t) => t.email && t.marketing);
      if (useEmail && mailTargets.length) {
        try {
          const r = await adminSendEmailCampaign({
            uids: mailTargets.map((t) => t.id),
            subject: title.trim(), headline: title.trim(), message: body.trim(), ctaText: cta.trim(), ctaPath: path,
          });
          if (r.sent) anySent = true;
          if (r.sent) lines.push(`מייל נשלח ל-${r.sent === 1 ? 'נמען אחד' : `${r.sent} נמענים`}${r.failed ? ` (${r.failed} נכשלו)` : ''}`);
          if (r.error) { failed = true; lines.push(`המייל לא נשלח: ${r.error}`); }
        } catch (e) { failed = true; lines.push(`המייל לא נשלח: ${e.message}`); }
      } else if (useEmail && !mailTargets.length) {
        lines.push(single ? 'המשתמש לא אישר קבלת עדכונים במייל' : 'אף נמען לא אישר קבלת עדכונים במייל');
      }
      const content = lines.length ? (
        <div className="space-y-1 text-right">{lines.map((l) => <div key={l}>{l}</div>)}</div>
      ) : 'לא נשלח דבר';
      if (failed) toast.error(content, { duration: 9000 });
      else if (anySent) toast.success(content, { duration: 5000 });
      else toast(content, { duration: 7000 }); // nothing to deliver, but nothing broke
      if (!failed && anySent && mode === 'all') onSent?.();
    } finally {
      setSending(null);
    }
  };

  const sendTest = () => deliver([{ id: me?.uid, email: me?.email, name: me?.displayName || '', marketing: true }], 'test');
  const sendAll = () => deliver(recipients, 'all');

  const fmtFact = (f) => `${f.coin} ${f.change > 0 ? '+' : ''}${f.change}%`;
  const factLine = hook?.facts
    ? [hook.facts.btc, hook.facts.eth, ...hook.facts.gainers, ...hook.facts.losers].filter(Boolean).map(fmtFact).join(' · ')
    : '';

  return (
    <div className="space-y-3">
      {/* The strongest hook: what's actually moving right now, written by AI
          from live market data (numbers are checked on the server). */}
      <button type="button" onClick={generate} disabled={generating}
        className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-accent-primary text-sm font-bold cursor-pointer disabled:opacity-60">
        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : (hook ? <RefreshCw className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />)}
        {generating ? 'בודק מה חם בשוק…' : hook ? 'נסח מחדש עם AI' : 'AI: מה חם עכשיו בשוק'}
      </button>
      {hook && (
        <div className="rounded-xl border border-border-primary bg-bg-tertiary px-3 py-2 text-[11px] text-text-secondary leading-relaxed">
          <span className={`inline-block me-1.5 px-1.5 py-0.5 rounded font-bold ${hook.source === 'ai' ? 'bg-accent-primary/15 text-accent-primary' : 'bg-bg-secondary text-text-muted'}`}>
            {hook.source === 'ai' ? 'AI' : 'תבנית'}
          </span>
          על בסיס נתוני שוק אמיתיים מהרגע: <span className="num-mono" dir="ltr">{factLine}</span>
          {hook.facts.headlines?.[0] && <span className="block text-text-muted mt-0.5">כותרת: {hook.facts.headlines[0]}</span>}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {TEMPLATES.map((t) => (
          <button key={t.label} type="button" onClick={() => applyTemplate(t)}
            className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-border-primary bg-bg-tertiary text-text-secondary hover:text-accent-primary hover:border-accent-primary/40 transition-colors cursor-pointer">
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <ChannelToggle checked={usePush} onChange={setUsePush} icon={Bell} label="התראה לטלפון"
          hint="רק למי שאישר התראות" />
        <ChannelToggle checked={useEmail} onChange={setUseEmail} icon={Mail} label="מייל"
          hint={`${withEmail.length} מתוך ${recipients.length} אישרו קבלת עדכונים במייל`} disabled={!withEmail.length} />
      </div>

      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="כותרת (גם נושא המייל)" maxLength={120} className={field} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="ההודעה (גוף המייל)" maxLength={1500} rows={4} className={`${field} resize-none`} />
      {usePush && (
        <input value={pushText} onChange={(e) => setPushText(e.target.value)} maxLength={180}
          placeholder="טקסט קצר להתראה בטלפון (ריק = תחילת ההודעה)" className={field} />
      )}

      <div className="grid grid-cols-2 gap-2">
        <input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="טקסט הכפתור במייל" maxLength={40} className={field} disabled={!useEmail} />
        <SelectDropdown
          value={path}
          onChange={setPath}
          options={DESTINATIONS.map((d) => ({ value: d.path, label: d.label }))}
        />
      </div>

      {/* Live preview of the email, so what lands in the inbox is no surprise. */}
      {useEmail && (title || body) && (
        <div className="rounded-2xl border border-[#26262b] bg-[#0c0c0e] p-4 text-right">
          <div className="text-[10px] text-text-muted mb-2">תצוגה מקדימה של המייל · הנושא נשלח עם "פרסומת:" בתחילתו, ובתחתית המייל קישור הסרה מרשימת התפוצה</div>
          <div className="text-lg font-bold text-[#f0f0f0]">{(title || '—').replace(/\p{Extended_Pictographic}\uFE0F?/gu, '').trim() || '—'}</div>
          <div className="text-sm text-[#a0a0b0] mt-2">היי {recipients.length === 1 && recipients[0].name ? recipients[0].name : '{שם}'},</div>
          <div className="text-sm text-[#a0a0b0] mt-1 whitespace-pre-line leading-relaxed">{body}</div>
          <div className="mt-4 flex justify-center">
            <span className="inline-block px-6 py-2.5 rounded-xl bg-[#3b82f6] text-white text-sm font-bold">{cta || 'כניסה ל-TradeOS'}</span>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={sendTest} disabled={!ready || !!sending}
          className="h-10 px-3 inline-flex items-center gap-1.5 rounded-lg border border-border-primary text-xs font-semibold text-text-secondary hover:bg-bg-tertiary transition-colors cursor-pointer disabled:opacity-40"
          title="שולח קודם רק אליך — לבדוק איך זה נראה">
          {sending === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
          בדיקה אליי
        </button>
        <button type="button" onClick={sendAll} disabled={!ready || !!sending || !recipients.length}
          className="flex-1 h-10 inline-flex items-center justify-center gap-2 rounded-lg bg-accent-primary text-sm font-bold transition-colors cursor-pointer disabled:opacity-40">
          {sending === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {recipients.length === 1 ? 'שלח' : `שלח ל-${recipients.length} משתמשים`}
        </button>
      </div>
    </div>
  );
}
