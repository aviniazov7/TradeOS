import { useState, useEffect } from 'react';
import { Pencil, Trash2, Archive, Coins, LineChart, Upload, Download, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../shared/Modal';
import ConfirmDialog from '../shared/ConfirmDialog';
import ExchangeSearch from '../shared/ExchangeSearch';
import { useJournalContext } from '../../contexts/JournalContext';
import { isUnsetExchange } from '../../utils/constants';
import PropFirmSettings from '../propfirm/PropFirmSettings';
import { propFirmToForm, formToPropFirm } from '../propfirm/propFirmForm';
import { normalizeCommissions } from '../../utils/tradeFormHelpers';
import { dailyLossAlertPatch } from '../../utils/dailyLossAlert';
import {
  journalRiskRulesInput,
  journalRiskRulesInputRejected,
  journalRiskRulesPatch,
  journalRiskRulesSame,
} from '../../utils/journalRiskRules';
import JournalRiskRulesFields from './JournalRiskRulesFields';

export default function JournalSettingsModal({ isOpen, onClose, onArchive, onImport, onExport, canExport, onShare, demoActive = false }) {
  const { journals, activeJournal, activeJournalId, updateJournal, deleteJournal, archiveJournal } = useJournalContext();
  const [form, setForm] = useState({ name: '', exchange: '', initialBalance: '', currency: 'USDT', description: '', riskType: 'percent', riskValue: '', assetClass: 'crypto' });
  const [propForm, setPropForm] = useState(() => propFirmToForm(null));
  // Commission presets (string inputs; normalized on save). See the "עמלות" section.
  const [commissions, setCommissions] = useState({});
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [alertAmount, setAlertAmount] = useState('');
  const [riskForm, setRiskForm] = useState(() => journalRiskRulesInput(null));
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  useEffect(() => {
    if (activeJournal && isOpen) {
      setForm({
        name: activeJournal.name || '',
        exchange: activeJournal.exchange || '',
        initialBalance: activeJournal.initialBalance || '',
        currency: activeJournal.currency || 'USDT',
        description: activeJournal.description || '',
        riskType: activeJournal.riskType || 'percent',
        riskValue: activeJournal.riskValue || '',
        assetClass: activeJournal.assetClass || 'crypto',
      });
      setPropForm(propFirmToForm(activeJournal.propFirm));
      setCommissions(Object.fromEntries(Object.entries(activeJournal.commissions || {}).map(([k, v]) => [k, v ? String(v) : ''])));
      const alert = activeJournal.dailyLossAlert;
      setAlertEnabled(alert?.enabled === true);
      setAlertAmount(alert?.amount > 0 ? String(alert.amount) : '');
      setRiskForm(journalRiskRulesInput(activeJournal.riskRules));
    }
  }, [activeJournal, isOpen]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const propFirm = formToPropFirm(propForm);
    if (propFirm.enabled && !(propFirm.accountSize > 0)) {
      toast.error('הזינו גודל חשבון לחשבון הפרופ');
      return;
    }
    if (alertEnabled && !(Number(alertAmount) > 0)) toast.error('הזינו סכום להתראת ההפסד היומי');
    const alertPatch = dailyLossAlertPatch(activeJournal?.dailyLossAlert, {
      enabled: alertEnabled,
      amount: alertAmount,
    });
    const storedAlert = activeJournal?.dailyLossAlert;
    const alertChanged = !!alertPatch && (
      alertPatch.enabled !== storedAlert?.enabled
      || alertPatch.amount !== (storedAlert?.amount ?? null)
    );
    if (demoActive && alertChanged) toast('במצב דמו ההתראה לא נשמרת.');
    const alertWrite = demoActive ? undefined : alertPatch;
    const storedRules = activeJournal?.riskRules;
    const loadedRules = journalRiskRulesInput(storedRules);
    const rulesDirty = JSON.stringify(riskForm) !== JSON.stringify(loadedRules);
    const rulesChanged = !journalRiskRulesSame(storedRules, riskForm);
    if (rulesDirty && journalRiskRulesInputRejected(riskForm)) toast.error('הזינו ערך תקין לכלל שהפעלתם');
    if (demoActive && rulesChanged) toast('במצב דמו כללי הסיכון לא נשמרים.');
    const rulesPatch = journalRiskRulesPatch(storedRules, riskForm, { demo: demoActive });
    const rulesWrite = rulesChanged ? rulesPatch : undefined;
    setSaving(true);
    try {
      await updateJournal(activeJournalId, {
        name: form.name.trim(),
        exchange: isUnsetExchange(form.exchange) ? '' : form.exchange,
        initialBalance: parseFloat(form.initialBalance) || 0,
        currency: form.currency,
        description: form.description.trim(),
        riskType: form.riskType,
        riskValue: parseFloat(form.riskValue) || 0,
        assetClass: form.assetClass,
        // One map field for the whole prop-firm setup. Journals that never
        // enabled it don't get the field at all; disabling keeps the rules
        // so turning it back on restores them.
        ...(propFirm.enabled || activeJournal?.propFirm ? { propFirm } : {}),
        commissions: normalizeCommissions(commissions),
        ...(alertWrite ? { dailyLossAlert: alertWrite } : {}),
        ...(rulesWrite ? { riskRules: rulesWrite } : {}),
      });
      toast.success('היומן עודכן');
      onClose();
    } catch (err) {
      toast.error(err.code === 'permission-denied' ? 'אין הרשאה לעדכן' : 'שגיאה בעדכון היומן — נסה שוב');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteJournal(activeJournalId);
      toast.success('היומן נמחק');
      setDeleteOpen(false);
      onClose();
    } catch (err) {
      toast.error(err.code === 'permission-denied' ? 'אין הרשאה למחוק' : 'שגיאה במחיקת היומן — נסה שוב');
    }
  };

  const handleArchive = async () => {
    try {
      const name = activeJournal?.name;
      setArchiveOpen(false);
      onClose();
      onArchive?.(name);
      await archiveJournal(activeJournalId);
    } catch (err) {
      toast.error(err.code === 'permission-denied' ? 'אין הרשאה' : 'שגיאה בהעברה לארכיון — נסה שוב');
    }
  };

  // Import/export state + the CSV builder live in TradeJournal; the modal just
  // triggers them via callbacks. Close settings first so the import modal /
  // download prompt isn't stacked behind it.
  const handleImport = () => { onClose(); onImport?.(); };
  const handleExport = () => { onClose(); onExport?.(); };

  const inputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors text-right';
  const labelClass = 'block text-xs text-text-muted mb-1';

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="הגדרות יומן" maxWidth="max-w-md">
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className={labelClass}>שם היומן</label>
            <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={inputClass} placeholder="שם היומן שלך" />
          </div>
          <div>
            <label className={labelClass}>סוג נכס</label>
            <div className="flex rounded-lg overflow-hidden border border-border-primary">
              {[{ id: 'crypto', label: 'קריפטו', Icon: Coins }, { id: 'futures_cme', label: 'חוזים עתידיים', Icon: LineChart }].map((opt) => (
                <button key={opt.id} type="button" onClick={() => setForm((f) => ({ ...f, assetClass: opt.id }))}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
                    form.assetClass === opt.id ? 'bg-accent-primary text-bg-primary' : 'bg-bg-tertiary text-text-muted hover:text-text-primary'
                  }`}>
                  <opt.Icon className="w-3.5 h-3.5" />
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-text-muted mt-1">משפיע על עסקאות חדשות בלבד; עסקאות קיימות שומרות את הסוג שלהן.</p>
          </div>
          <ExchangeSearch
            value={form.exchange}
            onChange={(val) => setForm((f) => ({ ...f, exchange: val }))}
          />
          <div>
            <label className={labelClass}>יתרה התחלתית ($)</label>
            <input type="number" step="any" value={form.initialBalance}
              onChange={(e) => setForm((f) => ({ ...f, initialBalance: e.target.value }))}
              className={inputClass} placeholder="1000" />
          </div>
          <div>
            <label className={labelClass}>תיאור (אופציונלי)</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className={`${inputClass} h-16 resize-none`} placeholder="תיאור קצר של היומן..." />
          </div>
          <div>
            <label className={labelClass}>סוג סיכון</label>
            <div className="flex rounded-lg overflow-hidden border border-border-primary mb-2">
              <button type="button" onClick={() => setForm((f) => ({ ...f, riskType: 'percent' }))}
                className={`flex-1 py-2 text-xs font-medium transition-colors cursor-pointer ${
                  form.riskType === 'percent' ? 'bg-accent-primary text-bg-primary' : 'bg-bg-tertiary text-text-muted hover:text-text-primary'
                }`}>
                % אחוז מהתיק
              </button>
              <button type="button" onClick={() => setForm((f) => ({ ...f, riskType: 'fixed' }))}
                className={`flex-1 py-2 text-xs font-medium transition-colors cursor-pointer ${
                  form.riskType === 'fixed' ? 'bg-accent-primary text-bg-primary' : 'bg-bg-tertiary text-text-muted hover:text-text-primary'
                }`}>
                $ סכום קבוע
              </button>
            </div>
            <input type="number" step="any" value={form.riskValue}
              onChange={(e) => setForm((f) => ({ ...f, riskValue: e.target.value }))}
              className={inputClass}
              placeholder={form.riskType === 'percent' ? 'למשל: 1' : 'למשל: 50'} />
          </div>

          <div className="rounded-xl border border-border-primary p-3 space-y-2">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-xs font-semibold text-text-primary">התראת הפסד יומי</span>
              <input
                type="checkbox"
                checked={alertEnabled}
                onChange={(e) => setAlertEnabled(e.target.checked)}
                className="accent-loss"
              />
            </label>
            <p className="text-[11px] text-text-muted">כשההפסד הנקי של היום מגיע לסכום, מופיע באנר. הרישום נשאר פתוח. לא משנה את תקרת התוכנית או את כללי הפרופ.</p>
            {alertEnabled && (
              <div>
                <label className={labelClass}>הפסד יומי מקסימלי ($)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={alertAmount}
                  onChange={(e) => setAlertAmount(e.target.value)}
                  className={inputClass}
                  placeholder="למשל: 300"
                />
              </div>
            )}
          </div>

          <JournalRiskRulesFields value={riskForm} onChange={setRiskForm} />

          <PropFirmSettings value={propForm} onChange={setPropForm} />
          {/* ── עמלות (commission presets) ── pre-fills the fees field in the trade form. */}
          <div className="rounded-xl border border-border-primary p-3 space-y-2">
            <div>
              <label className={labelClass + ' !mb-0 font-semibold'}>עמלות</label>
              <p className="text-[11px] text-text-muted">טופס העסקה ימלא את שדה העמלות (הלוך-חזור) לפי הפריסט. אפשר לדרוס ידנית בכל עסקה.</p>
            </div>
            {(() => {
              const field = (key, label, placeholder) => (
                <div key={key}>
                  <label className={labelClass}>{label}</label>
                  <input type="number" step="any" min="0" inputMode="decimal" value={commissions[key] ?? ''} placeholder={placeholder}
                    onChange={(e) => setCommissions((c) => ({ ...c, [key]: e.target.value }))} className={inputClass} />
                </div>
              );
              if (form.assetClass === 'futures_cme') {
                return field('futuresPerContractSide', '$ לחוזה לכל צד', '2.25');
              }
              if (form.assetClass === 'stocks') {
                return (
                  <div className="grid grid-cols-2 gap-2">
                    {field('stockPerShare', '$ למניה', '0.005')}
                    {field('stockMinPerOrder', 'מינימום $ להוראה', '1')}
                  </div>
                );
              }
              return (
                <div className="grid grid-cols-2 gap-2">
                  {field('cryptoMakerPct', 'Maker (% מהנומינלי)', '0.02')}
                  {field('cryptoTakerPct', 'Taker (% מהנומינלי)', '0.055')}
                </div>
              );
            })()}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-lg bg-bg-tertiary text-text-primary hover:bg-border-hover transition-colors cursor-pointer text-sm">
              ביטול
            </button>
            <button type="submit" disabled={saving || !form.name.trim()}
              className="flex-1 py-2.5 rounded-lg bg-accent-primary text-black font-semibold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50 text-sm">
              {saving ? 'שומר...' : 'שמור שינויים'}
            </button>
          </div>
        </form>

        <div className="mt-4 pt-4 border-t border-border-primary space-y-2">
          <p className="text-xs font-semibold text-text-primary">שיתוף יומן</p>
          <p className="text-[11px] text-text-muted">שתפו את היומן הפעיל לטווח זמן. הצופה רואה רק את השדות שתבחרו, בלי אפשרות לערוך.</p>
          <button
            type="button"
            onClick={() => onShare?.()}
            data-testid="journal-share-open"
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-bg-tertiary text-text-primary hover:bg-border-hover transition-colors cursor-pointer text-sm font-semibold"
          >
            <Share2 className="w-4 h-4" />
            שיתוף היומן
          </button>
        </div>

        <div className="mt-4 pt-4 border-t border-border-primary space-y-2">
          <p className="text-xs text-text-muted">ייבוא / ייצוא עסקאות</p>
          <button
            type="button"
            onClick={handleImport}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-bg-tertiary text-text-primary hover:bg-border-hover transition-colors cursor-pointer text-sm"
          >
            <Upload className="w-4 h-4" />
            ייבוא עסקאות מ-CSV
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={!canExport}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-bg-tertiary text-text-primary hover:bg-border-hover transition-colors cursor-pointer text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            ייצוא עסקאות ל-CSV
          </button>
        </div>

        <div className="mt-4 pt-4 border-t border-border-primary space-y-2">
          <button
            onClick={() => setArchiveOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-amber-500 hover:bg-amber-500/10 transition-colors cursor-pointer text-sm"
          >
            <Archive className="w-4 h-4" />
            העברה לארכיון
          </button>
          {journals.length > 1 && (
            <button
              onClick={() => setDeleteOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-loss hover:bg-loss/10 transition-colors cursor-pointer text-sm"
            >
              <Trash2 className="w-4 h-4" />
              מחיקת יומן
            </button>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={handleArchive}
        title="העברה לארכיון"
        message={`להעביר את היומן "${activeJournal?.name}" לארכיון? תוכל לשחזר בכל עת.`}
        confirmText="העבר לארכיון"
        confirmColor="amber"
      />

      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="מחיקת יומן"
        message={`למחוק את היומן "${activeJournal?.name}"? העסקאות שבו לא יימחקו.`}
      />
    </>
  );
}
