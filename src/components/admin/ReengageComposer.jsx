import { useState } from 'react';
import { Send, Loader2, Mail, Bell, FlaskConical } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { adminSendBulkNotification, adminSendEmailCampaign } from '../../services/pushService';

// Ready-made "come back" messages — a click fills the form, then edit freely.
const TEMPLATES = [
  {
    label: 'מזמן לא ראינו אותך',
    title: 'מתגעגעים אליך ב-TradeOS 👋',
    body: 'עבר זמן מאז הביקור האחרון שלך. היומן, הניתוחים והסנכרון מהבורסה מחכים — כמה דקות ביום עושות את ההבדל במסחר.',
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
  { path: '/journal', label: 'יומן מסחר' },
  { path: '/journal?tab=analytics', label: 'ניתוחים' },
  { path: '/mentality', label: 'האזור המנטלי' },
  { path: '/premium', label: 'Premium' },
];

const field = 'w-full bg-bg-secondary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary';

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

  const withEmail = recipients.filter((r) => r.email);
  const ready = title.trim() && body.trim() && (usePush || useEmail);

  const applyTemplate = (t) => { setTitle(t.title); setBody(t.body); setCta(t.cta); setPath(t.path); };

  // Sends through the chosen channels and reports both results in one toast.
  const deliver = async (targets, mode) => {
    setSending(mode);
    const parts = [];
    let failed = false;
    try {
      if (usePush && targets.some((r) => r.id)) {
        try {
          const r = await adminSendBulkNotification({ uids: targets.map((t) => t.id).filter(Boolean), title: title.trim(), body: body.trim().slice(0, 400), url: path });
          parts.push(`Push: ${r?.recipients ?? 0} משתמשים`);
        } catch (e) { failed = true; parts.push(`Push נכשל: ${e.message}`); }
      }
      const mailTargets = targets.filter((t) => t.email);
      if (useEmail && mailTargets.length) {
        try {
          const r = await adminSendEmailCampaign({
            recipients: mailTargets.map((t) => ({ email: t.email, name: t.name })),
            subject: title.trim(), headline: title.trim(), message: body.trim(), ctaText: cta.trim(), ctaPath: path,
          });
          parts.push(`מייל: ${r.sent} נשלחו${r.failed ? `, ${r.failed} נכשלו` : ''}`);
          if (r.error) { failed = true; parts.push(r.error); }
        } catch (e) { failed = true; parts.push(`מייל נכשל: ${e.message}`); }
      }
      (failed ? toast.error : toast.success)(parts.join(' · ') || 'לא נשלח דבר', { duration: failed ? 8000 : 4000 });
      if (!failed && mode === 'all') onSent?.();
    } finally {
      setSending(null);
    }
  };

  const sendTest = () => deliver([{ id: me?.uid, email: me?.email, name: me?.displayName || '' }], 'test');
  const sendAll = () => deliver(recipients, 'all');

  return (
    <div className="space-y-3">
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
          hint={`${withEmail.length} עם כתובת מייל`} disabled={!withEmail.length} />
      </div>

      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="כותרת (גם נושא המייל)" maxLength={120} className={field} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="ההודעה" maxLength={1500} rows={4} className={`${field} resize-none`} />

      <div className="grid grid-cols-2 gap-2">
        <input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="טקסט הכפתור במייל" maxLength={40} className={field} disabled={!useEmail} />
        <select value={path} onChange={(e) => setPath(e.target.value)} className={`${field} cursor-pointer`}>
          {DESTINATIONS.map((d) => <option key={d.path} value={d.path}>{d.label}</option>)}
        </select>
      </div>

      {/* Live preview of the email, so what lands in the inbox is no surprise. */}
      {useEmail && (title || body) && (
        <div className="rounded-xl border border-accent-primary/20 bg-[#0f1521] p-4 text-right">
          <div className="text-[10px] text-text-muted mb-2">תצוגה מקדימה של המייל</div>
          <div className="text-base font-bold text-[#e5e7eb]">{title || '—'}</div>
          <div className="text-sm text-[#cbd0d8] mt-2">היי {recipients.length === 1 && recipients[0].name ? recipients[0].name : '{שם}'},</div>
          <div className="text-sm text-[#cbd0d8] mt-1 whitespace-pre-line leading-relaxed">{body}</div>
          <div className="mt-4 flex justify-center">
            <span className="inline-block px-6 py-2.5 rounded-lg bg-[#00bfff] text-[#0a0e16] text-sm font-bold">{cta || 'כניסה ל-TradeOS'}</span>
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
