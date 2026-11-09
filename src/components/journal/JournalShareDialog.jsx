import { useEffect, useState } from 'react';
import { Copy, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../shared/Modal';
import DateField from '../shared/DateField';
import JournalSharePreview from './JournalSharePreview';
import { journalShareClient } from '../../services/journalShareService';
import { formatDateTime, isolateLtr } from '../../utils/formatters';
import {
  SHARE_CREATED_MESSAGE,
  SHARE_DAY_OPTIONS,
  SHARE_FIELD_ROWS,
  effectiveShareFields,
  isOwnerEmail,
  jerusalemToday,
  maxShareDate,
  shareExpiryPatch,
  shareRequestBody,
  sharesForJournal,
} from '../../utils/journalShareOwner';
import { defaultShareFields } from '../../utils/journalShareFilter';

const STATUS_LABEL = { active: 'פעיל', revoked: 'בוטל', expired: 'פג תוקף' };
const inputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors';
const choiceClass = (on) => `px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
  on
    ? 'bg-accent-primary text-bg-primary border-accent-primary'
    : 'bg-bg-tertiary text-text-secondary border-border-primary hover:text-text-primary'
}`;

async function copyToken(token) {
  try {
    await navigator.clipboard.writeText(token);
    toast.success('הטוקן הועתק');
  } catch {
    toast.error('העתיקו את הטוקן מהשדה');
  }
}

export default function JournalShareDialog({
  isOpen,
  onClose,
  journal,
  trades = [],
  ownerEmail = '',
  client = journalShareClient,
}) {
  const [email, setEmail] = useState('');
  const [fields, setFields] = useState(defaultShareFields);
  const [expiry, setExpiry] = useState('7');
  const [expiresOn, setExpiresOn] = useState('');
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [listError, setListError] = useState('');
  const [issued, setIssued] = useState(null);
  const [extendChoice, setExtendChoice] = useState({});
  const [extendDate, setExtendDate] = useState({});
  const [revokeId, setRevokeId] = useState(null);

  useEffect(() => {
    if (!isOpen || !journal?.id) return undefined;
    let cancelled = false;
    setEmail('');
    setFields(defaultShareFields());
    setExpiry('7');
    setExpiresOn('');
    setFormError('');
    setIssued(null);
    setRevokeId(null);
    setLoading(true);
    setListError('');
    client.list()
      .then((data) => { if (!cancelled) setShares(Array.isArray(data.shares) ? data.shares : []); })
      .catch((err) => { if (!cancelled) setListError(err.message || 'לא ניתן לטעון את השיתופים'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, journal?.id, client]);

  if (!journal) return null;

  if (!isOpen && issued) setIssued(null);

  const mine = sharesForJournal(shares, journal.id);
  const shownFields = effectiveShareFields(fields);
  const today = jerusalemToday();
  const latest = maxShareDate();

  const setField = (key, on) => {
    setFields((prev) => {
      if (key !== 'trades' && key !== 'balances' && !prev.trades) return prev;
      const next = { ...prev, [key]: on };
      if (key === 'trades' && !on) {
        next.notes = false;
        next.emotions = false;
        next.tradingView = false;
      }
      return next;
    });
  };

  const refresh = async () => {
    const data = await client.list();
    setShares(Array.isArray(data.shares) ? data.shares : []);
  };

  const createShare = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (isOwnerEmail(ownerEmail, email)) {
      setFormError('אי אפשר לשתף אל הכתובת שלכם.');
      return;
    }
    const built = shareRequestBody({ journalId: journal.id, email, fields, expiry, expiresOn });
    if (built.error) {
      setFormError(built.error);
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      const data = await client.create(built.body);
      setIssued(typeof data.token === 'string' ? data.token : '');
      setEmail('');
      await refresh();
    } catch (err) {
      setFormError(err.message || 'השיתוף נכשל');
    } finally {
      setBusy(false);
    }
  };

  const extendShare = async (share) => {
    const choice = extendChoice[share.id] || '30';
    const built = shareExpiryPatch({ expiry: choice, expiresOn: extendDate[share.id] || '' });
    if (built.error) {
      toast.error(built.error);
      return;
    }
    const body = built.body;
    setBusy(true);
    try {
      await client.update(share.id, body);
      toast.success('התוקף עודכן');
      await refresh();
    } catch (err) {
      toast.error(err.message || 'עדכון התוקף נכשל');
    } finally {
      setBusy(false);
    }
  };

  const revokeShare = async (share) => {
    setBusy(true);
    try {
      await client.revoke(share.id);
      setRevokeId(null);
      toast.success('השיתוף בוטל');
      await refresh();
    } catch (err) {
      toast.error(err.message || 'ביטול השיתוף נכשל');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-lg"
      title={(
        <span className="inline-flex items-center gap-2">
          <Share2 className="w-4 h-4 text-text-secondary" />
          שיתוף היומן
        </span>
      )}
      ariaLabel="שיתוף היומן"
      footer={(
        <button
          type="submit"
          form="journal-share-form"
          disabled={busy}
          className="w-full h-11 rounded-xl bg-accent-muted hover:bg-accent-primary text-white text-sm font-bold transition-colors cursor-pointer disabled:opacity-50"
        >
          {busy ? 'שומר…' : 'יצירת שיתוף'}
        </button>
      )}
    >
      <div className="space-y-4 pb-16" dir="rtl">
        <p className="text-xs leading-relaxed text-text-secondary">
          הצופה מקבל רק את מה שתדליקו. הערות, רגשות וקישורי גרף נשלחים רק יחד עם העסקאות.
          יתרה חיה, כתובת בורסה ומפתחות API לא נשלחים אף פעם. אין מייל: אתם מעתיקים את הטוקן ושולחים אותו בעצמכם.
          התשובה זהה בין אם לכתובת יש חשבון ובין אם אין. חשבונות חינמיים יכולים לשתף.
        </p>

        {issued != null && (
          <div data-testid="share-created" className="rounded-xl border border-accent-primary/40 bg-accent-primary/10 p-3 space-y-2">
            <p className="text-sm font-semibold text-text-primary">{SHARE_CREATED_MESSAGE}</p>
            <p className="text-[11px] text-text-muted">הטוקן מוצג פעם אחת. אחרי סגירת החלון אי אפשר להציג אותו שוב.</p>
            <div className="flex gap-2">
              <input
                readOnly
                dir="ltr"
                value={issued}
                aria-label="טוקן השיתוף"
                data-testid="share-token"
                onFocus={(event) => event.target.select()}
                className={`${inputClass} font-mono text-xs`}
              />
              <button
                type="button"
                onClick={() => copyToken(issued)}
                aria-label="העתקת הטוקן"
                className="shrink-0 h-11 w-11 grid place-items-center rounded-lg border border-border-primary bg-bg-tertiary text-text-primary cursor-pointer"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <form id="journal-share-form" onSubmit={createShare} className="space-y-3">
          <div>
            <label htmlFor="share-email" className="block text-xs text-text-muted mb-1">כתובת של הצופה</label>
            <input
              id="share-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              dir="ltr"
              value={email}
              onChange={(event) => { setEmail(event.target.value); setFormError(''); }}
              className={`${inputClass} text-left`}
              placeholder="name@example.com"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs text-text-muted mb-1">מה לשתף. הכול כבוי עד שתדליקו.</legend>
            {SHARE_FIELD_ROWS.map((row) => {
              const locked = row.needs === 'trades' && !fields.trades;
              const on = shownFields[row.key] === true;
              return (
                <div key={row.key} className={`flex items-start justify-between gap-3 rounded-lg border border-border-primary px-3 py-2 ${locked ? 'opacity-60' : ''}`}>
                  <span className="min-w-0">
                    <span className="block text-sm text-text-primary">{row.label}</span>
                    <span className="block text-[11px] text-text-muted leading-relaxed">{row.hint}</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={row.label}
                    disabled={locked}
                    onClick={() => setField(row.key, !on)}
                    className={`w-10 h-5 rounded-full shrink-0 mt-0.5 relative transition-colors cursor-pointer disabled:cursor-not-allowed ${on ? 'bg-accent-primary' : 'bg-border-primary'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'right-0.5' : 'left-0.5'}`} />
                  </button>
                </div>
              );
            })}
          </fieldset>

          <fieldset>
            <legend className="text-xs text-text-muted mb-1">תוקף. תמיד יש תאריך סיום.</legend>
            <div className="flex flex-wrap gap-1.5">
              {SHARE_DAY_OPTIONS.map((days) => (
                <button key={days} type="button" className={choiceClass(expiry === String(days))} onClick={() => setExpiry(String(days))}>
                  {days} ימים
                </button>
              ))}
              <button type="button" className={choiceClass(expiry === 'date')} onClick={() => setExpiry('date')}>
                תאריך
              </button>
            </div>
            {expiry === 'date' && (
              <div className="mt-2">
                <DateField
                  size="field"
                  label="תאריך סיום"
                  value={expiresOn}
                  min={today}
                  max={latest}
                  onChange={setExpiresOn}
                />
              </div>
            )}
          </fieldset>

          {formError && <p role="alert" className="text-xs text-loss">{formError}</p>}
          <JournalSharePreview journal={journal} trades={trades} fields={shownFields} />
        </form>

        <section aria-label="שיתופים של היומן" className="space-y-2">
          <h3 className="text-sm font-bold text-text-primary">שיתופים של היומן הזה</h3>
          {loading && <p className="text-xs text-text-muted">טוען שיתופים…</p>}
          {listError && <p role="alert" className="text-xs text-loss">{listError}</p>}
          {!loading && !mine.length && <p className="text-xs text-text-muted">אין עדיין שיתוף ליומן הזה.</p>}
          <ul data-testid="share-list" className="space-y-2">
            {mine.map((share) => {
              const choice = extendChoice[share.id] || '30';
              const active = share.status === 'active';
              return (
                <li key={share.id} className="rounded-xl border border-border-primary p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-text-primary truncate" dir="ltr">{share.viewerEmail}</span>
                    <span className={`text-[11px] font-semibold shrink-0 ${share.status === 'revoked' ? 'text-loss' : share.status === 'expired' ? 'text-text-muted' : 'text-profit'}`}>
                      {STATUS_LABEL[share.status] || share.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted">
                    עד {isolateLtr(formatDateTime(share.expiresAt))}
                  </p>
                  {active && revokeId !== share.id && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {SHARE_DAY_OPTIONS.map((days) => (
                        <button key={days} type="button" className={choiceClass(choice === String(days))} onClick={() => setExtendChoice((prev) => ({ ...prev, [share.id]: String(days) }))}>
                          {days}
                        </button>
                      ))}
                      <button type="button" className={choiceClass(choice === 'date')} onClick={() => setExtendChoice((prev) => ({ ...prev, [share.id]: 'date' }))}>
                        תאריך
                      </button>
                      {choice === 'date' && (
                        <div className="w-full">
                          <DateField
                            size="compact"
                            label="תאריך סיום חדש"
                            value={extendDate[share.id] || ''}
                            min={today}
                            max={latest}
                            onChange={(value) => setExtendDate((prev) => ({ ...prev, [share.id]: value }))}
                          />
                        </div>
                      )}
                      <button type="button" disabled={busy} onClick={() => extendShare(share)} className="h-8 px-2.5 rounded-lg text-xs font-semibold border border-border-primary text-text-primary cursor-pointer disabled:opacity-50">
                        הארכת תוקף
                      </button>
                      <button type="button" disabled={busy} onClick={() => setRevokeId(share.id)} className="h-8 px-2.5 rounded-lg text-xs font-semibold text-loss cursor-pointer disabled:opacity-50">
                        ביטול שיתוף
                      </button>
                    </div>
                  )}
                  {revokeId === share.id && (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs text-text-secondary">לבטל את השיתוף? הקישור יפסיק לעבוד.</p>
                      <button type="button" disabled={busy} onClick={() => revokeShare(share)} className="h-8 px-2.5 rounded-lg text-xs font-bold bg-loss/15 text-loss cursor-pointer">
                        ביטול
                      </button>
                      <button type="button" onClick={() => setRevokeId(null)} className="h-8 px-2.5 rounded-lg text-xs text-text-muted cursor-pointer">
                        חזרה
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </Modal>
  );
}
