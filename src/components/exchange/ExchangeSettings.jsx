import { useState, useEffect, lazy, Suspense } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import {
  Shield, Eye, EyeOff, ExternalLink, RefreshCw, Zap, Pencil, Plus, Unplug, Link2, Lock, AlertTriangle, Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { getUserSetting, setUserSetting } from '../../services/firestoreService';
import { syncExchangeTrades, syncOpenPositions, fetchExchangeBalance, storeExchangeCredentials, deleteExchangeCredentials, getConnectedExchanges, KEY_PROBLEM_TEXT, isHyperliquidAddress, setHyperliquidAddressCache } from '../../services/exchangeService';
import { useAuth } from '../../contexts/AuthContext';
import { useJournalContext } from '../../contexts/JournalContext';
import { useExchangeImport } from '../../hooks/useExchangeImport';
import { pageVariants, pageTransition } from '../../utils/animations';
import { getExchangeLogo, FREE_LIMITS } from '../../utils/constants';
import LoadingSpinner from '../shared/LoadingSpinner';
import SelectDropdown from '../shared/SelectDropdown';
import Card from '../shared/Card';
import Modal from '../shared/Modal';
import ConfirmDialog from '../shared/ConfirmDialog';
import PageHeader from '../shared/PageHeader';
import StatTile from '../shared/StatTile';
import SectionTitle from '../shared/SectionTitle';
import { EXCHANGES, connectMode, connectionGuideNotes, fileImportLabel } from './exchangeConfig';
import { SyncModal } from './SyncModal';
import { planJournalExchangeBind } from '../../utils/exchangeBinding';
import { writeDemoMode } from '../../utils/demoData';
import { useTrades } from '../../hooks/useTrades';
import { resolveSyncOutcome } from './syncOutcome';
import { securityBadge } from './securityBadge';
import { entryHasPlaintextSecret, migratePlaintextExchangeKeys } from '../../services/exchangeCredentialMigration';

const ImportTrades = lazy(() => import('../journal/ImportTrades'));
const Mt5ImportDialog = lazy(() => import('./Mt5ImportDialog'));

// Import-window options for the exchange sync (value in days; '0' = last 50).
const SYNC_PERIODS = [
  { value: '0', label: '50 אחרונות' },
  { value: '30', label: 'חודש אחרון' },
  { value: '90', label: '3 חודשים' },
  { value: '180', label: '6 חודשים' },
  { value: '365', label: 'שנה' },
];

const fmtUsd = (v) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const DAY_MS = 24 * 60 * 60 * 1000;
// Remind this many days before a key with a fixed lifetime expires.
const EXPIRY_WARN_DAYS = 14;

// What to do about each API-key problem the Worker diagnosed.
const PROBLEM_HELP = {
  key_expired: (ex) => `צור מפתח חדש ב-${ex.name}${ex.renewHint ? ` (או חדש את הקיים: ${ex.renewHint})` : ''} ועדכן אותו כאן.`,
  key_invalid: () => 'ייתכן שהמפתח נמחק בבורסה או הועתק לא במלואו. צור מפתח חדש ועדכן אותו כאן.',
  ip_blocked: () => 'הסר את הגבלת ה-IP מהמפתח בבורסה — TradeOS מתחבר מכתובות משתנות — ועדכן כאן.',
  no_permission: () => 'ודא שלמפתח יש הרשאות קריאה לחשבון ולפקודות של Futures, ועדכן כאן.',
};

// Days left on a key with a fixed lifetime (MEXC), from when it was saved.
const keyDaysLeft = (exchange, marker, now) => (
  exchange.keyLifetimeDays && marker?.connectedAt
    ? Math.ceil(exchange.keyLifetimeDays - (now - marker.connectedAt) / DAY_MS)
    : null
);

// ── Real logo with fallback ───────────────────────────────────────────────────
function ExLogo({ id, size = 48, accent }) {
  const [err, setErr] = useState(false);
  const url = getExchangeLogo(id);
  if (!err && url) return (
    <div className="rounded-xl overflow-hidden flex items-center justify-center shrink-0"
      style={{ width: size, height: size, background: `${accent}22`, border: `1px solid ${accent}40` }}>
      <img src={url} alt={id} width={size * 0.65} height={size * 0.65}
        className="rounded object-contain" onError={() => setErr(true)} />
    </div>
  );
  return (
    <div className="rounded-xl flex items-center justify-center font-black text-white text-sm shrink-0"
      style={{ width: size, height: size, background: accent }}>
      {id[0].toUpperCase()}
    </div>
  );
}

// ── Connected exchange card ───────────────────────────────────────────────────
// The live state of one connection: balance, sync controls, key management.
// No key inputs here — editing keys happens in the connect dialog.
function ConnectedCard({ exchange, balance, syncing, onSync, onEdit, onDisconnect, onRenewed, daysLeft, estimated, index }) {
  const [syncDays, setSyncDays] = useState('0'); // '0' = last 50; else import window in days
  const { id, name, tagline, accent, canSync } = exchange;

  const problem = balance && typeof balance === 'object' ? balance.problem : null;
  const expiringSoon = !problem && daysLeft !== null && daysLeft <= EXPIRY_WARN_DAYS;

  let balanceView;
  if (!canSync) balanceView = <span className="text-sm text-text-muted">{exchange.importKind === 'mt5' ? 'ייבוא מדוח MT5' : 'סנכרון אוטומטי לא נתמך'}</span>;
  else if (balance === undefined || balance === null) balanceView = <span className="block h-8 w-36 rounded-lg bg-bg-tertiary animate-pulse" />;
  else if (typeof balance === 'number') balanceView = <span className="num-mono text-2xl md:text-[28px] font-bold text-text-primary" dir="ltr">{fmtUsd(balance)}</span>;
  else balanceView = <span className="text-sm text-text-muted">היתרה לא זמינה כרגע</span>;

  return (
    <Card
      as={m.div}
      glow
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, type: 'spring', damping: 24, stiffness: 260 }}
      className="relative overflow-hidden p-5 flex flex-col gap-4"
      // Hover beam in the exchange's own colour, not the default brand blue.
      style={{ borderColor: `${accent}40`, '--beam-from': accent, '--beam-to': `${accent}99` }}
    >
      {/* Brand wash from the logo corner + a hairline of the exchange colour */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(120% 90% at 100% 0%, ${accent}1f 0%, transparent 55%)` }} />
      <div className="absolute inset-x-0 top-0 h-px pointer-events-none" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />

      <div className="relative flex items-center gap-3">
        <ExLogo id={id} size={42} accent={accent} />
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-text-primary truncate">{name}</p>
          <p className="text-[11px] text-text-muted truncate" dir="ltr" style={{ textAlign: 'right' }}>{tagline}</p>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 bg-profit/10 text-profit border border-profit/25">
          <m.span animate={{ opacity: [1, 0.35, 1] }} transition={{ repeat: Infinity, duration: 2 }}
            className="w-1.5 h-1.5 rounded-full bg-profit inline-block" />
          מחובר
        </span>
      </div>

      {problem ? (
        // The key itself is the problem (expired / invalid / IP / permission):
        // say so and offer the fix, instead of a silent "balance unavailable".
        <div className="relative rounded-xl border border-loss/30 bg-loss/10 px-3 py-2.5" role="alert">
          <p className="text-sm font-semibold text-loss flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0" />{KEY_PROBLEM_TEXT[problem]}
          </p>
          <p className="text-[11px] text-text-secondary mt-1 leading-relaxed">{PROBLEM_HELP[problem](exchange)}</p>
          <button type="button" onClick={onEdit}
            className="mt-2 h-8 inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold bg-loss/15 text-loss border border-loss/30 hover:bg-loss/25 transition-colors cursor-pointer">
            <Pencil className="w-3.5 h-3.5" />{fileImportLabel(exchange) || 'עדכון מפתחות'}
          </button>
        </div>
      ) : (
        <div className="relative">
          <p className="text-[11px] text-text-muted mb-1">יתרה בבורסה</p>
          {balanceView}
        </div>
      )}

      {expiringSoon && (
        <div className="relative rounded-xl border border-breakeven/30 bg-breakeven/10 px-3 py-2.5">
          <p className="text-sm font-semibold text-breakeven flex items-center gap-1.5">
            <Clock className="w-4 h-4 shrink-0" />
            {daysLeft <= 0 ? 'המפתח פג היום' : `המפתח יפוג בעוד ${daysLeft} ${daysLeft === 1 ? 'יום' : 'ימים'}`}{estimated ? ' (הערכה)' : ''}
          </p>
          <p className="text-[11px] text-text-secondary mt-1 leading-relaxed">
            חדש אותו ב-{name}{exchange.renewHint ? ` (${exchange.renewHint})` : ''} — או צור מפתח חדש ועדכן כאן.
          </p>
          <button type="button" onClick={onRenewed}
            className="mt-2 h-8 inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold bg-breakeven/15 text-breakeven border border-breakeven/30 hover:bg-breakeven/25 transition-colors cursor-pointer">
            חידשתי את המפתח
          </button>
        </div>
      )}

      {canSync ? (
        <div className="relative flex items-stretch gap-2">
          <SelectDropdown compact value={syncDays} onChange={setSyncDays} options={SYNC_PERIODS}
            className="w-32 shrink-0" triggerClassName="h-full rounded-xl" />
          <button onClick={() => onSync(Number(syncDays))} disabled={syncing || !!problem}
            className="flex-1 h-11 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 transition-[filter] hover:brightness-110"
            style={{ background: `${accent}1f`, color: accent, border: `1px solid ${accent}55` }}>
            {syncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Zap className="w-4 h-4" />סנכרן עסקאות</>}
          </button>
        </div>
      ) : (
        <div className="relative h-11 rounded-xl text-xs text-text-muted border border-dashed border-border-primary flex items-center justify-center gap-1.5">
          <Link2 className="w-3.5 h-3.5" />
          {exchange.importKind === 'mt5' ? 'ייבוא עסקאות מדוח MT5' : 'ייבוא עסקאות דרך קובץ CSV בלבד'}
        </div>
      )}

      <div className="relative flex items-center justify-between gap-2 pt-3 border-t border-border-primary">
        <button onClick={onEdit}
          className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer">
          <Pencil className="w-3.5 h-3.5" />{exchange.authType === 'address' ? 'עדכון כתובת' : (fileImportLabel(exchange) || 'עדכון מפתחות')}
        </button>
        {daysLeft !== null && !expiringSoon && !problem && (
          <span className="text-[11px] text-text-muted" title="מפתח MEXC בלי IP מוגבל ל-90 יום">
            בתוקף עוד {daysLeft} ימים{estimated ? ' (הערכה)' : ''}
          </span>
        )}
        <button onClick={onDisconnect}
          className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-loss transition-colors cursor-pointer">
          <Unplug className="w-3.5 h-3.5" />נתק
        </button>
      </div>
    </Card>
  );
}

// ── Available exchange tile ───────────────────────────────────────────────────
function AvailableTile({ exchange, locked, onConnect, index }) {
  const { id, name, tagline, accent, canSync } = exchange;
  return (
    <Card
      as={m.button}
      type="button"
      hover
      spotlight
      onClick={onConnect}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.05 }}
      className="group relative overflow-hidden w-full text-right p-4 flex items-center gap-3"
    >
      <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: `radial-gradient(90% 120% at 100% 50%, ${accent}17 0%, transparent 60%)` }} />
      <ExLogo id={id} size={40} accent={accent} />
      <div className="relative flex-1 min-w-0">
        <p className="text-sm font-semibold text-text-primary truncate">{name}</p>
        <p className="text-[11px] text-text-muted truncate" dir="ltr" style={{ textAlign: 'right' }}>{tagline}</p>
        {!canSync && (
          <p className="text-[10px] text-text-muted mt-0.5">
            {exchange.importKind === 'mt5' ? 'ייבוא דוח MT5' : 'ללא סנכרון אוטומטי'}
          </p>
        )}
      </div>
      <span className="relative inline-flex items-center gap-1 shrink-0 h-8 px-3 rounded-lg text-xs font-semibold text-accent-primary border border-accent-primary/40 group-hover:bg-accent-primary/10 transition-colors">
        {locked ? <><Lock className="w-3.5 h-3.5" />Premium</> : (fileImportLabel(exchange, { short: true }) || <><Plus className="w-3.5 h-3.5" />חבר</>)}
      </span>
    </Card>
  );
}

// ── Connect / edit-keys dialog ────────────────────────────────────────────────
function SecretInput({ value, onChange, placeholder, accent, secret = false }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={secret && !show ? 'password' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        dir="ltr"
        className={`w-full h-11 bg-bg-tertiary border border-border-primary rounded-xl px-3 ${secret ? 'pr-10' : ''} text-sm text-text-primary outline-none transition-all placeholder-text-muted font-mono`}
        onFocus={(e) => { e.target.style.borderColor = accent; e.target.style.boxShadow = `0 0 0 3px ${accent}25`; }}
        onBlur={(e) => { e.target.style.borderColor = ''; e.target.style.boxShadow = ''; }}
      />
      {secret && (
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'הסתר' : 'הצג'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer transition-colors">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
}

export function ConnectDialog({ exchange, editing, data, saving, onUpdate, onSave, onClose, onOpenCsv }) {
  const isOpen = !!exchange;
  // Keep the last exchange while the close animation plays.
  const [shown, setShown] = useState(exchange);
  if (exchange && exchange !== shown) setShown(exchange);
  const ex = exchange || shown;
  if (!ex) return null;

  const { name, tagline, accent, glow, apiUrl, steps, extraField, addressField } = ex;
  const mode = connectMode(ex);
  const byAddress = mode === 'address';
  const csvOnly = mode === 'csv';
  const mt5 = mode === 'mt5';
  const fileOnly = csvOnly || mt5;
  const notes = connectionGuideNotes(ex);
  const address = (data?.address || '').trim();
  const addressInvalid = byAddress && address.length > 0 && !isHyperliquidAddress(address);
  // Saving requires both fields freshly entered (we can't prefill the secret),
  // plus the extra field (OKX/Bitget passphrase) when the exchange requires it.
  // Address-based venues (Hyperliquid) need just a valid wallet address.
  const hasKeys = byAddress
    ? isHyperliquidAddress(address)
    : (data?.apiKey || '').length > 0 && (data?.apiSecret || '').length > 0;
  const missingExtra = !!extraField?.required && hasKeys && (data?.[extraField.key] || '').trim().length === 0;
  const canSave = hasKeys && !missingExtra && !saving;

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-lg"
      title={fileOnly ? `ייבוא מ-${name}` : editing ? (byAddress ? `עדכון כתובת · ${name}` : `עדכון מפתחות · ${name}`) : `חיבור ${name}`}>
      {/* Guide first on every width — on a phone it used to sit under the
          fields, so the Read-Only / no-IP notes were easy to miss. */}
      <div className="flex flex-col gap-5">
        <aside data-testid="connection-guide" className="rounded-xl bg-bg-tertiary/60 border border-border-primary p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs font-semibold text-text-primary">{fileOnly ? 'איך מייצאים את הקובץ' : byAddress ? 'איפה מוצאים את הכתובת' : 'איך יוצרים מפתח API'}</p>
            {apiUrl && (
              <a href={apiUrl} target="_blank" rel="noopener noreferrer"
                className="text-[11px] inline-flex items-center gap-1 hover:opacity-80 transition-opacity shrink-0"
                style={{ color: accent }}>
                {fileOnly ? 'להיסטוריה' : 'לדף ה-API'} <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          {notes.length > 0 && (
            <ul className="mb-3 space-y-1.5">
              {notes.map((note) => (
                <li key={note} className="flex items-start gap-2 rounded-lg px-2 py-1.5 bg-profit/10 text-[12px] text-text-primary leading-snug">
                  <Shield className="w-3.5 h-3.5 text-profit shrink-0 mt-0.5" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          )}
          <ol className="space-y-1.5">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5"
                style={{ background: step.warn ? 'rgba(239,68,68,0.07)' : step.ok ? `${accent}12` : 'transparent' }}>
                <span className="text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-px"
                  style={{
                    background: step.warn ? 'rgba(239,68,68,0.2)' : step.ok ? `${accent}30` : 'var(--color-bg-secondary)',
                    color: step.warn ? 'var(--color-loss)' : step.ok ? accent : 'var(--color-text-muted)',
                  }}>
                  {step.n}
                </span>
                <span className={`text-[12px] leading-snug ${step.warn ? 'text-loss' : step.ok ? 'text-text-primary' : 'text-text-secondary'}`}>
                  {step.text}
                </span>
              </li>
            ))}
          </ol>
        </aside>

        <form data-testid="connection-fields" className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); if (fileOnly) onOpenCsv?.(); else if (canSave) onSave(); }}>
          <div className="flex items-center gap-3 pb-1">
            <ExLogo id={ex.id} size={40} accent={accent} />
            <div className="min-w-0">
              <p className="text-sm font-bold text-text-primary">{name}</p>
              <p className="text-[11px] text-text-muted" dir="ltr" style={{ textAlign: 'right' }}>{tagline}</p>
            </div>
          </div>
          {fileOnly ? (
            <p className="text-xs text-text-secondary leading-relaxed">
              {mt5
                ? 'בלי מפתח API. אחרי הייבוא היומן יסומן כ-Vantage והעסקאות ייכנסו עם המקור Vantage (MT5).'
                : `בלי מפתח API. אחרי הייבוא היומן יסומן כ-${name} והעסקאות ייכנסו אליו.`}
            </p>
          ) : (
            <>
              {editing && !byAddress && <p className="text-xs text-text-muted">מטעמי אבטחה המפתחות הקיימים לא מוצגים — הזן מפתחות חדשים כדי להחליף אותם.</p>}

              {byAddress ? (
                <label className="block">
                  <span className="block text-[11px] text-text-muted mb-1">{addressField?.label || 'כתובת ארנק'}</span>
                  <SecretInput value={data?.address || ''} onChange={(v) => onUpdate('address', v)} placeholder={addressField?.placeholder || '0x…'} accent={accent} />
                  {addressInvalid && <span className="block text-xs text-loss mt-1">כתובת לא תקינה — 0x ואחריו 40 תווים (0-9, a-f)</span>}
                </label>
              ) : (
                <>
                  <label className="block">
                    <span className="block text-[11px] text-text-muted mb-1">API Key</span>
                    <SecretInput value={data?.apiKey || ''} onChange={(v) => onUpdate('apiKey', v)} placeholder="API Key" accent={accent} />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] text-text-muted mb-1">API Secret</span>
                    <SecretInput value={data?.apiSecret || ''} onChange={(v) => onUpdate('apiSecret', v)} placeholder="API Secret" accent={accent} secret />
                  </label>
                </>
              )}
              {extraField && (
                <label className="block">
                  <span className="block text-[11px] text-text-muted mb-1">{extraField.label}{extraField.required ? ' (חובה)' : ''}</span>
                  <SecretInput value={data?.[extraField.key] || ''} onChange={(v) => onUpdate(extraField.key, v)}
                    placeholder={extraField.placeholder || extraField.label} accent={accent} secret />
                </label>
              )}

              <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 bg-profit/5 border border-profit/20 text-[11px] text-text-secondary leading-relaxed">
                <Shield className="w-3.5 h-3.5 text-profit shrink-0 mt-0.5" />
                <span>
                  {byAddress
                    ? 'כתובת הארנק היא מידע ציבורי (לא סוד) ומאפשרת קריאה בלבד של העסקאות — אי אפשר לסחור או למשוך בעזרתה. היא נשמרת בהגדרות החשבון שלך.'
                    : 'המפתחות נשמרים בשרת ולא נשארים בדפדפן. Read-Only בלבד, בלי הגבלת IP.'}
                </span>
              </div>

              {missingExtra && (
                <p className="text-xs text-breakeven">הזן {extraField.label} כדי לחבר את {name}</p>
              )}
            </>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="h-11 px-5 rounded-xl border border-border-primary text-sm text-text-secondary hover:bg-bg-tertiary transition-colors cursor-pointer">
              ביטול
            </button>
            {fileOnly ? (
              <button type="submit"
                className="flex-1 h-11 rounded-xl text-sm font-bold cursor-pointer flex items-center justify-center gap-2"
                style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, color: '#000', boxShadow: `0 6px 22px -6px ${glow}` }}>
                {fileImportLabel(ex) || 'ייבוא CSV'}
              </button>
            ) : (
              <button type="submit" disabled={!canSave}
                className="flex-1 h-11 rounded-xl text-sm font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, color: '#000', boxShadow: canSave ? `0 6px 22px -6px ${glow}` : 'none' }}>
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : (editing ? (byAddress ? 'שמור כתובת' : 'שמור מפתחות חדשים') : `חבר את ${name}`)}
              </button>
            )}
          </div>
        </form>
      </div>
    </Modal>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
// Per-user cache of the last known connections and balances (device only,
// no secrets) — lets the page open instantly and refresh in the background.
function readExchCache(uid, suffix) {
  try { return uid ? JSON.parse(localStorage.getItem(`tradeos_exch_${uid}${suffix}`) || 'null') : null; } catch { return null; }
}
function writeExchCache(uid, suffix, value) {
  try { if (uid) localStorage.setItem(`tradeos_exch_${uid}${suffix}`, JSON.stringify(value)); } catch { /* private mode */ }
}

export default function ExchangeSettings({ journalId: propJournalId, embedded = false, bare = false } = {}) {
  const { user, isPremium } = useAuth();
  const navigate = useNavigate();
  const {
    journals, activeJournalId: contextJournalId, updateJournal, addJournal, setActiveJournalId,
  } = useJournalContext();
  const activeJournalId = propJournalId ?? contextJournalId;
  const { trades: journalTrades, addTradesBulk } = useTrades(activeJournalId);
  // Shared import logic (upsert on close-order-id overlap) — the standalone
  // /exchange route used to blind-add every synced row as a NEW trade, so a
  // TP1 already imported from the journal's proposal banner got counted twice.
  const { importTrade, existingExternalIds } = useExchangeImport(activeJournalId);
  const [exchanges, setExchanges] = useState({});
  // Last known connections + balances are kept on the device, so the page
  // opens instantly with them and refreshes in the background (it used to
  // show a spinner until the server answered, then wait again for balances).
  const uid = user?.uid;
  const [savedExchanges, setSavedExchanges] = useState(() => readExchCache(uid, '') || {});
  const [loading, setLoading] = useState(() => !readExchCache(uid, ''));
  const [saving, setSaving] = useState(null);
  const [syncing, setSyncing] = useState(null);
  const [syncModal, setSyncModal] = useState(null);
  // Connect / edit-keys dialog: { id, editing } | null
  const [dialog, setDialog] = useState(null);
  const [csvExchangeId, setCsvExchangeId] = useState(null);
  const [mt5Open, setMt5Open] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(null);
  // Futures wallet balance per connected exchange: undefined = loading,
  // number = ok, false = failed.
  const [balances, setBalances] = useState(() => readExchCache(uid, '_bal') || {});
  // Fixed "now" for the key-expiry countdown (render must stay pure).
  const [now] = useState(() => Date.now());
  const [balanceNonce, setBalanceNonce] = useState(0);

  // Load connected exchanges. Credentials live encrypted server-side, so the
  // browser only learns WHICH exchanges are connected (a non-secret marker),
  // never the keys themselves.
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        // Same migration as sign-in (deduped). Runs here too so a user who
        // already has the screen open still gets secrets moved before we
        // read the marker. A failed store leaves the Firestore copy intact.
        await migratePlaintextExchangeKeys(user.uid).catch(() => {});
        const [legacy, connected] = await Promise.all([
          getUserSetting(user.uid, 'exchanges').catch(() => null),
          getConnectedExchanges().catch(() => []),
        ]);
        const markers = {};
        // Keep when each key was saved (drives the expiry reminder) and
        // whether the worker confirmed the key cannot trade.
        const markerFor = (eid) => ({
          connected: true,
          ...(legacy?.[eid]?.connectedAt ? { connectedAt: legacy[eid].connectedAt, connectedAtEstimated: !!legacy[eid].connectedAtEstimated } : {}),
          // Hyperliquid: the public wallet address IS the connection (no keys).
          ...(legacy?.[eid]?.address ? { address: legacy[eid].address } : {}),
          ...(legacy?.[eid]?.readOnlyVerified === true ? { readOnlyVerified: true } : {}),
        });
        for (const eid of connected) markers[eid] = markerFor(eid);
        if (legacy && typeof legacy === 'object') {
          for (const [eid, conf] of Object.entries(legacy)) {
            if (conf?.connected || conf?.address) markers[eid] = markerFor(eid);
          }
        }
        const stillHasSecrets = legacy && typeof legacy === 'object'
          && Object.values(legacy).some((conf) => entryHasPlaintextSecret(conf));
        // Keys with a fixed lifetime connected before this was tracked get
        // "today" as an estimated start — a real expiry is still caught by the
        // balance check, which reports key_expired.
        let stamped = false;
        for (const ex of EXCHANGES) {
          if (ex.keyLifetimeDays && markers[ex.id]?.connected && !markers[ex.id].connectedAt) {
            markers[ex.id] = { ...markers[ex.id], connectedAt: Date.now(), connectedAtEstimated: true };
            stamped = true;
          }
        }
        setHyperliquidAddressCache(markers.hyperliquid?.address || null);
        setSavedExchanges(markers);
        writeExchCache(user.uid, '', markers);
        // merge:false replaces the doc. Never write while plaintext secrets
        // are still there — that would delete the only copy.
        if (stamped && !stillHasSecrets) {
          setUserSetting(user.uid, 'exchanges', markers, false).catch(() => { /* ignore */ });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  // Pull the futures wallet balance of every connected, syncable exchange so
  // its card shows "$1,234" without asking the user to type a starting value.
  // The Worker looks up the stored credentials by uid — no secret sent.
  const balanceIds = EXCHANGES.filter((e) => e.canSync && savedExchanges[e.id]?.connected).map((e) => e.id).join(',');
  useEffect(() => {
    if (!balanceIds) return undefined;
    let cancelled = false;
    balanceIds.split(',').forEach((id) => {
      fetchExchangeBalance(id)
        .then((res) => {
          if (cancelled) return;
          setBalances((b) => {
            const next = { ...b, [id]: typeof res?.balance === 'number' ? res.balance : false };
            // Remember plain numbers only, for the next instant open.
            writeExchCache(uid, '_bal', Object.fromEntries(Object.entries(next).filter(([, v]) => typeof v === 'number')));
            return next;
          });
        })
        .catch((err) => { if (!cancelled) setBalances((b) => ({ ...b, [id]: err?.reason ? { problem: err.reason } : false })); });
    });
    return () => { cancelled = true; };
  }, [balanceIds, balanceNonce, uid]);

  const updateField = (id, field, value) =>
    setExchanges(p => ({ ...p, [id]: { ...p[id], [field]: value } }));

  const connectedCount = EXCHANGES.filter(e => savedExchanges[e.id]?.connected).length;
  const atFreeLimit = !isPremium && connectedCount >= FREE_LIMITS.exchanges;

  const goPremium = () => {
    toast.error(`במסלול החינמי אפשר לחבר בורסה אחת. שדרג ל-Premium לחיבורים ללא הגבלה.`);
    navigate('/premium');
  };

  const openConnect = (id) => {
    const ex = EXCHANGES.find((e) => e.id === id);
    // File import (Binance CSV, Vantage MT5) is not an API connection, so it
    // does not spend the free slot.
    const mode = connectMode(ex);
    if (mode !== 'csv' && mode !== 'mt5' && atFreeLimit && !savedExchanges[id]?.connected) { goPremium(); return; }
    setExchanges(p => ({ ...p, [id]: {} }));
    setDialog({ id, editing: false });
  };
  // The secret is not held client-side, so editing starts from empty inputs.
  const openCsv = (id) => {
    setDialog(null);
    const ex = EXCHANGES.find((e) => e.id === id);
    if (ex?.importKind === 'mt5') setMt5Open(true);
    else setCsvExchangeId(id);
  };
  const openEdit = (id) => {
    const ex = EXCHANGES.find((e) => e.id === id);
    if (connectMode(ex) === 'csv' || connectMode(ex) === 'mt5') { openCsv(id); return; }
    // A wallet address isn't a secret — prefill it; API keys start empty.
    setExchanges(p => ({ ...p, [id]: savedExchanges[id]?.address ? { address: savedExchanges[id].address } : {} }));
    setDialog({ id, editing: true });
  };

  // Point the blank/`other` journal at the venue that was just connected.
  // A journal that already names a real exchange is not retagged.
  const applyExchangeToJournal = async (exchangeId) => {
    const plan = planJournalExchangeBind({ journals, activeJournalId, exchangeId });
    if (plan.action === 'create') {
      const ex = EXCHANGES.find((e) => e.id === exchangeId);
      return addJournal({
        name: ex?.name || 'יומן',
        exchange: exchangeId,
        initialBalance: 0,
        currency: 'USDT',
        assetClass: 'crypto',
      });
    }
    if (plan.action === 'patch') {
      await updateJournal(plan.journalId, { exchange: plan.exchange });
      return plan.journalId;
    }
    if (plan.action === 'select' && plan.journalId !== activeJournalId) setActiveJournalId(plan.journalId);
    return plan.journalId || activeJournalId;
  };

  const autoImportAfterConnect = async (id, journalForImport) => {
    if (!journalForImport) {
      toast.error('הבורסה חוברה, אבל אין יומן לייבוא. צור יומן ואז לחץ סנכרן.');
      return;
    }
    setSyncing(id);
    toast('מייבא עסקאות מהבורסה…', { icon: '⏳' });
    try {
      const [tradesResult, openResult] = await Promise.allSettled([
        syncExchangeTrades(id, { days: 90 }),
        syncOpenPositions(id),
      ]);
      if (tradesResult.status === 'rejected' && openResult.status === 'rejected') throw tradesResult.reason;
      const closedTrades = tradesResult.status === 'fulfilled' ? tradesResult.value : [];
      const openPos = openResult.status === 'fulfilled' ? openResult.value : [];
      const merged = [
        ...openPos.map((p) => ({ ...p, _isOpen: true, pnlFromExchange: null })),
        ...closedTrades,
      ];
      if (!merged.length) {
        toast('הבורסה חוברה. לא נמצאו עסקאות לייבוא כרגע.', { icon: 'ℹ️' });
        return;
      }
      const results = await Promise.allSettled(merged.map((t) => importTrade(t, journalForImport)));
      const imported = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - imported;
      if (imported) toast.success(`יובאו ${imported} עסקאות ליומן`);
      if (failed) toast.error(`לא יובאו ${failed} עסקאות — אפשר לסנכרן שוב מהכרטיס`);
    } catch (err) {
      if (err?.reason) {
        setBalances((b) => ({ ...b, [id]: { problem: err.reason } }));
        toast.error(`${err.message} — לחץ "עדכון מפתחות"`);
      } else {
        toast.error(`הבורסה חוברה, אבל הייבוא נכשל: ${err?.message || 'נסה לסנכרן מהכרטיס'}`);
      }
    } finally {
      setSyncing(null);
    }
  };
  const closeDialog = () => {
    // Drop anything typed — secrets never linger in state after the dialog.
    if (dialog) setExchanges(p => ({ ...p, [dialog.id]: {} }));
    setDialog(null);
  };

  const handleSave = async (id) => {
    // Free tier caps how many exchanges can be connected at once.
    const alreadyConnected = !!savedExchanges[id]?.connected;
    if (!isPremium && !alreadyConnected && connectedCount >= FREE_LIMITS.exchanges) {
      goPremium();
      return;
    }
    const conf = exchanges[id] || {};
    const exDef = EXCHANGES.find(e => e.id === id);
    const extraKey = exDef?.extraField?.key;
    const byAddress = exDef?.authType === 'address';
    const address = (conf.address || '').trim().toLowerCase();
    if (byAddress && !isHyperliquidAddress(address)) {
      toast.error('כתובת ארנק לא תקינה');
      return;
    }
    // Second gate behind the button's canSave check: never store OKX/Bitget
    // credentials without the passphrase — every later sync would fail auth.
    if (exDef?.extraField?.required && !(conf[extraKey] || '').trim()) {
      toast.error(`חסר ${exDef.extraField.label} — חובה לחיבור ${exDef.name}`);
      return;
    }
    setSaving(id);
    try {
      // Send the secret to the encrypted server-side store exactly once.
      // (Address-based venues have no secret: nothing goes to the server.)
      let readOnlyVerified = byAddress;
      if (!byAddress) {
        const stored = await storeExchangeCredentials(id, { apiKey: conf.apiKey, apiSecret: conf.apiSecret, passphrase: extraKey ? conf[extraKey] : undefined });
        readOnlyVerified = stored?.readOnly === true;
      }
      // Persist only a non-secret marker (plus the public wallet address for
      // Hyperliquid); merge:false replaces the doc so no plaintext key can linger.
      const newMarkers = { ...savedExchanges, [id]: { connected: true, connectedAt: Date.now(), readOnlyVerified, ...(byAddress ? { address } : {}) } };
      await setUserSetting(user.uid, 'exchanges', newMarkers, false);
      if (byAddress) setHyperliquidAddressCache(address);
      setSavedExchanges(newMarkers);
      // Drop the typed secret from React state immediately.
      setExchanges(p => ({ ...p, [id]: {} }));
      // New keys → re-read the balance (show the loading state meanwhile).
      setBalances((b) => ({ ...b, [id]: undefined }));
      setBalanceNonce((n) => n + 1);
      setDialog(null);
      toast.success(alreadyConnected ? (byAddress ? 'הכתובת עודכנה ✓' : 'המפתחות עודכנו ✓') : `${exDef?.name || id} חוברה ✓`);
      // First connect of a syncing venue: tag the journal and pull trades
      // now. Updating an existing key keeps the manual "סנכרן" button.
      if (!alreadyConnected && exDef?.canSync) {
        writeDemoMode(user.uid, false);
        try {
          const journalForImport = await applyExchangeToJournal(id);
          await autoImportAfterConnect(id, journalForImport);
        } catch {
          toast.error('הבורסה חוברה, אבל ייבוא העסקאות נכשל. אפשר לסנכרן מהכרטיס.');
        }
      }
    } catch (e) { toast.error(e.message || 'שגיאה בשמירה'); } finally { setSaving(null); }
  };

  const importCsvAndBind = async (rows, onProgress) => {
    writeDemoMode(user.uid, false);
    if (csvExchangeId) await applyExchangeToJournal(csvExchangeId);
    return addTradesBulk(rows, onProgress);
  };

  const handleMt5Import = async (rows) => {
    writeDemoMode(user.uid, false);
    const journalForImport = await applyExchangeToJournal('vantage');
    const results = await Promise.allSettled(rows.map((t) => importTrade(t, journalForImport)));
    const imported = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - imported;
    if (imported) {
      const marker = {
        connected: true,
        connectedAt: savedExchanges.vantage?.connectedAt || Date.now(),
        readOnlyVerified: true,
      };
      const newMarkers = { ...savedExchanges, vantage: marker };
      try {
        await setUserSetting(user.uid, 'exchanges', newMarkers, false);
        setSavedExchanges(newMarkers);
        writeExchCache(user.uid, '', newMarkers);
      } catch { /* Firestore rules for the vantage marker deploy separately. */ }
    }
    if (failed && !imported) {
      const msg = results.find((r) => r.status === 'rejected')?.reason?.message || 'שגיאה בייבוא';
      throw new Error(msg);
    }
    return { imported, failed };
  };

  const handleDisconnect = async (id) => {
    const newMarkers = { ...savedExchanges };
    delete newMarkers[id];
    try {
      if (id !== 'hyperliquid' && id !== 'vantage') await deleteExchangeCredentials(id);
      await setUserSetting(user.uid, 'exchanges', newMarkers, false);
      if (id === 'hyperliquid') setHyperliquidAddressCache(null);
      setSavedExchanges(newMarkers);
      setExchanges(p => ({ ...p, [id]: {} }));
      setBalances((b) => { const next = { ...b }; delete next[id]; return next; });
      toast.success('הבורסה נותקה');
    } catch { toast.error('שגיאה בניתוק'); }
  };

  // "I renewed the key at the exchange" — restart its lifetime countdown.
  const handleRenewed = async (id) => {
    const newMarkers = { ...savedExchanges, [id]: { ...savedExchanges[id], connectedAt: Date.now(), connectedAtEstimated: false } };
    try {
      await setUserSetting(user.uid, 'exchanges', newMarkers, false);
      setSavedExchanges(newMarkers);
      const ex = EXCHANGES.find((e) => e.id === id);
      toast.success(`התזכורת אופסה — ${ex?.keyLifetimeDays || ''} יום מהיום`);
    } catch { toast.error('שגיאה בשמירה'); }
  };

  const handleSync = async (id, days = 0) => {
    // One-time diagnostic: set localStorage.tradeos_sync_debug='1' to log the
    // raw upstream rows to the console (helps map missing fields like SL/TP).
    const debug = typeof localStorage !== 'undefined' && localStorage.getItem('tradeos_sync_debug') === '1';
    setSyncing(id);
    try {
      const [tradesResult, openResult] = await Promise.allSettled([
        syncExchangeTrades(id, { days, debug }),
        syncOpenPositions(id),
      ]);
      const outcome = resolveSyncOutcome(tradesResult, openResult);
      if (outcome.type === 'error') throw outcome.error;
      if (outcome.type === 'empty') { toast('לא נמצאו עסקאות', { icon: 'ℹ️' }); return; }
      if (outcome.partialError) {
        const partial = outcome.partialError;
        if (partial.reason) {
          setBalances((b) => ({ ...b, [id]: { problem: partial.reason } }));
          toast.error(`${partial.message} — לחץ "עדכון מפתחות"`);
        } else {
          toast.error(`שגיאת סנכרון: ${partial.message}`);
        }
      }
      setSyncModal({ exchange: EXCHANGES.find(e => e.id === id)?.name || id, trades: outcome.trades });
    } catch (err) {
      if (err.reason) {
        // Show the key problem on the card too, so the fix is one click away.
        setBalances((b) => ({ ...b, [id]: { problem: err.reason } }));
        toast.error(`${err.message} — לחץ "עדכון מפתחות"`);
      } else {
        toast.error(`שגיאת סנכרון: ${err.message}`);
      }
    } finally { setSyncing(null); }
  };

  const handleImport = async (trades) => {
    if (!activeJournalId) {
      toast.error('בחר יומן לפני הייבוא');
      return;
    }
    const results = await Promise.allSettled(trades.map(t => importTrade(t)));
    const imported = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected');
    setSyncModal(null);
    if (failed.length > 0) {
      const firstErr = failed[0]?.reason?.message || 'שגיאה לא ידועה';
      if (imported > 0) toast.success(`יובאו ${imported} עסקאות ✓`);
      toast.error(`נכשלו ${failed.length}: ${firstErr}`);
    } else {
      toast.success(`🎉 יובאו ${imported} עסקאות בהצלחה!`);
    }
  };

  if (loading) return <LoadingSpinner />;

  const connected = EXCHANGES.filter(e => savedExchanges[e.id]?.connected);
  const available = EXCHANGES.filter(e => !savedExchanges[e.id]?.connected);
  const badge = securityBadge(connected.map((e) => ({
    authType: e.authType === 'address' ? 'address' : (e.canSync === false ? 'file' : e.authType),
    readOnlyVerified: savedExchanges[e.id]?.readOnlyVerified,
  })));
  const problemCount = connected.filter((e) => balances[e.id]?.problem).length;
  const dialogExchange = dialog ? EXCHANGES.find((e) => e.id === dialog.id) : null;
  const disconnectExchange = confirmDisconnect ? EXCHANGES.find((e) => e.id === confirmDisconnect) : null;

  return (
    <>
      <m.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>

        {/* Header: title + at-a-glance numbers. The journal hub hides this
            when the compact connection bar is already on screen. */}
        {!bare && (
          <PageHeader as={embedded ? 'h2' : 'h1'} icon={Link2} title="חיבור בורסות"
            subtitle="חבר את הבורסה שלך וייבא עסקאות ישירות ליומן — בלי להקליד אותן ידנית.">
            <div className="grid grid-cols-2 gap-2 md:gap-2.5 lg:w-[320px]">
              <StatTile inset icon={Link2} label="מחוברות" value={`${connectedCount}/${EXCHANGES.length}`}
                sub={problemCount ? `${problemCount} ${problemCount === 1 ? 'דורשת' : 'דורשות'} טיפול` : (!isPremium ? `חינמי: עד ${FREE_LIMITS.exchanges}` : 'ללא הגבלה')}
                tone={problemCount ? 'text-loss' : 'text-text-primary'} />
              <StatTile inset icon={Shield} label="אבטחה"
                value={badge.value}
                mono={badge.value === '—'}
                tone={badge.tone}
                sub={badge.sub} />
            </div>
          </PageHeader>
        )}

        {/* Connected */}
        <section className="mb-7">
          <SectionTitle aside={connected.length > 0 && <span className="text-[11px] text-text-muted">{connected.length} פעילות</span>}>
            הבורסות שלי
          </SectionTitle>
          {connected.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {connected.map((exchange, i) => (
                <ConnectedCard key={exchange.id} exchange={exchange} index={i}
                  balance={balances[exchange.id]}
                  syncing={syncing === exchange.id}
                  onSync={(days) => handleSync(exchange.id, days)}
                  onEdit={() => openEdit(exchange.id)}
                  onDisconnect={() => setConfirmDisconnect(exchange.id)}
                  onRenewed={() => handleRenewed(exchange.id)}
                  daysLeft={keyDaysLeft(exchange, savedExchanges[exchange.id], now)}
                  estimated={!!savedExchanges[exchange.id]?.connectedAtEstimated} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border-primary px-5 py-8 text-center">
              <Link2 className="w-6 h-6 text-text-muted mx-auto mb-2" />
              <p className="text-sm font-medium text-text-primary">עוד לא חיברת בורסה</p>
              <p className="text-xs text-text-muted mt-1">בחר בורסה מהרשימה למטה — העסקאות שלך ייובאו אוטומטית ליומן.</p>
            </div>
          )}
        </section>

        {/* Available */}
        {available.length > 0 && (
          <section>
            <SectionTitle aside={atFreeLimit && (
              <button onClick={() => navigate('/premium')} className="text-[11px] text-accent-primary hover:underline cursor-pointer">
                שדרג ל-Premium לחיבורים נוספים
              </button>
            )}>
              בורסות זמינות
            </SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {available.map((exchange, i) => (
                <AvailableTile key={exchange.id} exchange={exchange} index={i}
                  locked={atFreeLimit && exchange.canSync !== false}
                  onConnect={() => openConnect(exchange.id)} />
              ))}
            </div>
          </section>
        )}

        {/* Security footer */}
        <div className="mt-8 flex items-center justify-center gap-2 text-[11px] text-text-muted text-center">
          <Shield className="w-3.5 h-3.5 text-profit shrink-0" />
          המפתחות נשמרים בשרת ולא נשארים בדפדפן. מומלץ מפתח API לקריאה בלבד — ללא הרשאות מסחר או משיכה.
        </div>
      </m.div>

      <ConnectDialog
        exchange={dialogExchange}
        editing={!!dialog?.editing}
        data={dialog ? exchanges[dialog.id] : null}
        saving={!!dialog && saving === dialog.id}
        onUpdate={(field, val) => dialog && updateField(dialog.id, field, val)}
        onSave={() => dialog && handleSave(dialog.id)}
        onOpenCsv={() => dialog && openCsv(dialog.id)}
        onClose={closeDialog}
      />

      {csvExchangeId && (
        <Suspense fallback={null}>
          <ImportTrades
            isOpen
            onClose={() => setCsvExchangeId(null)}
            onImportBulk={importCsvAndBind}
            assetClass="crypto"
            existingTrades={journalTrades}
          />
        </Suspense>
      )}

      {mt5Open && (
        <Suspense fallback={null}>
          <Mt5ImportDialog
            isOpen
            onClose={() => setMt5Open(false)}
            existingTrades={journalTrades}
            onImport={handleMt5Import}
          />
        </Suspense>
      )}

      <ConfirmDialog
        isOpen={!!confirmDisconnect}
        onClose={() => setConfirmDisconnect(null)}
        onConfirm={() => handleDisconnect(confirmDisconnect)}
        title={`לנתק את ${disconnectExchange?.name || ''}?`}
        message={disconnectExchange?.importKind === 'mt5'
          ? 'החיבור יוסר מהרשימה. עסקאות שכבר יובאו נשארות ביומן.'
          : disconnectExchange?.authType === 'address'
            ? 'כתובת הארנק תימחק מהחשבון שלך. עסקאות שכבר יובאו נשארות ביומן.'
            : 'המפתחות יימחקו מהשרת. עסקאות שכבר יובאו נשארות ביומן.'}
        confirmText="נתק"
      />

      <AnimatePresence>
        {syncModal && (
          <SyncModal exchange={syncModal.exchange} trades={syncModal.trades}
            onClose={() => setSyncModal(null)} onImport={handleImport}
            existingExternalIds={existingExternalIds} />
        )}
      </AnimatePresence>
    </>
  );
}
