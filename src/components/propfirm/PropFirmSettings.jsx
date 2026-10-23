import { Trophy, AlertTriangle } from 'lucide-react';
import SelectDropdown from '../shared/SelectDropdown';
import DateField from '../shared/DateField';
import { PROP_FIRM_PRESETS, PROP_FIRM_DD_TYPE_LABELS } from '../../utils/constants';
import { getPropFirmPreset } from '../../utils/propFirm';
import { presetFields } from './propFirmForm';

const textInputClass = 'w-full min-w-0 bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors text-right';
const inputClass = `${textInputClass} num-mono`;
const labelClass = 'block text-xs text-text-muted mb-1';

const PRESET_OPTIONS = PROP_FIRM_PRESETS.map((p) => ({ value: p.id, label: p.market ? `${p.name} · ${p.market}` : p.name }));
const BASIS_OPTIONS = [
  { value: 'initial', label: 'אחוז מהיתרה ההתחלתית' },
  { value: 'start_of_day', label: 'אחוז מיתרת תחילת היום' },
];
const DD_TYPE_OPTIONS = Object.entries(PROP_FIRM_DD_TYPE_LABELS).map(([value, label]) => ({ value, label }));

const sizeLabel = (s) => (s >= 1000 ? `$${s / 1000}K` : `$${s}`);

// Segmented two-way %/$ switch next to a value input.
function UnitToggle({ value, onChange }) {
  return (
    <div className="flex shrink-0 rounded-lg overflow-hidden border border-border-primary" dir="ltr">
      {[{ id: 'pct', label: '%' }, { id: 'usd', label: '$' }].map((u) => (
        <button key={u.id} type="button" onClick={() => onChange(u.id)} aria-pressed={value === u.id}
          className={`w-9 h-[38px] text-xs font-bold transition-colors cursor-pointer ${
            value === u.id ? 'bg-accent-primary text-bg-primary' : 'bg-bg-tertiary text-text-muted hover:text-text-primary'
          }`}>
          {u.label}
        </button>
      ))}
    </div>
  );
}

function AmountField({ label, hint, value, unit, onValue, onUnit, placeholder = 'ללא' }) {
  return (
    <div className="min-w-0">
      <label className={labelClass}>{label}</label>
      <div className="flex gap-1.5 min-w-0">
        <input type="number" step="any" min="0" inputMode="decimal" value={value} placeholder={placeholder}
          onChange={(e) => onValue(e.target.value)} className={`${inputClass} flex-1 min-w-0`} dir="ltr" style={{ textAlign: 'right' }} />
        <UnitToggle value={unit} onChange={onUnit} />
      </div>
      {hint && <p className="text-[11px] text-text-muted mt-1">{hint}</p>}
    </div>
  );
}

/**
 * "חשבון פרופ" section of the journal settings — a controlled sub-form.
 * `value` is the string form state from propFirmForm.js; picking a firm,
 * phase or account size refills the rules from the preset, every rule stays
 * editable afterwards.
 */
export default function PropFirmSettings({ value: f, onChange }) {
  const set = (patch) => onChange({ ...f, ...patch });
  const preset = getPropFirmPreset(f.presetId) || getPropFirmPreset('custom');
  const refill = (presetId, phase, size) => set(presetFields(presetId, phase, size));

  return (
    <div className="mt-4 pt-4 border-t border-border-primary">
      <button type="button" role="switch" aria-checked={f.enabled} onClick={() => set({ enabled: !f.enabled })}
        className="w-full flex items-center justify-between gap-3 cursor-pointer text-right">
        <span className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 shrink-0 grid place-items-center rounded-lg bg-accent-primary/10 border border-accent-primary/25">
            <Trophy className="w-4 h-4 text-accent-hover" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-text-primary">חשבון פרופ</span>
            <span className="block text-[11px] text-text-muted">מעקב אחר כללי אתגר של חברת מימון</span>
          </span>
        </span>
        <span className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${f.enabled ? 'bg-accent-primary' : 'bg-border-primary'}`}>
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white ${f.enabled ? 'right-0.5' : 'left-0.5'}`} />
        </span>
      </button>

      {f.enabled && (
        <div className="mt-3 space-y-3">
          <SelectDropdown label="חברה" value={f.presetId} options={PRESET_OPTIONS}
            onChange={(id) => { if (!id) return; const p = getPropFirmPreset(id); refill(id, p.phases[0].id, p.defaultSize); }} />

          {preset.id === 'custom' && (
            <div>
              <label className={labelClass}>שם החברה</label>
              <input type="text" maxLength={40} value={f.firmName} onChange={(e) => set({ firmName: e.target.value })}
                className={textInputClass} placeholder="למשל: My Funded FX" />
            </div>
          )}

          {preset.phases.length > 1 && (
            <div>
              <label className={labelClass}>שלב</label>
              <div className="flex flex-wrap gap-1.5">
                {preset.phases.map((ph) => (
                  <button key={ph.id} type="button" onClick={() => refill(preset.id, ph.id, f.accountSize)}
                    className={`h-8 px-3 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                      f.phase === ph.id ? 'bg-accent-primary/15 text-accent-primary border-accent-primary/40' : 'bg-bg-tertiary text-text-muted border-border-primary hover:text-text-primary'
                    }`}>
                    {ph.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className={labelClass}>גודל חשבון ($)</label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {preset.sizes.map((s) => (
                <button key={s} type="button" onClick={() => refill(preset.id, f.phase, s)}
                  className={`h-7 px-2.5 rounded-md text-[11px] font-semibold num-mono border transition-colors cursor-pointer ${
                    Number(f.accountSize) === s ? 'bg-accent-primary/15 text-accent-primary border-accent-primary/40' : 'bg-bg-tertiary text-text-muted border-border-primary hover:text-text-primary'
                  }`}>
                  {sizeLabel(s)}
                </button>
              ))}
            </div>
            <input type="number" step="any" min="0" inputMode="decimal" value={f.accountSize}
              onChange={(e) => set({ accountSize: e.target.value })} className={inputClass} dir="ltr" style={{ textAlign: 'right' }} placeholder="100000" />
          </div>

          <div>
            <label className={labelClass}>תאריך תחילת האתגר</label>
            <DateField size="field" label="תאריך תחילת האתגר" value={f.startDate}
              onChange={(v) => set({ startDate: v })} />
            <p className="text-[11px] text-text-muted mt-1">רק עסקאות שנסגרו מתאריך זה נספרות.</p>
          </div>

          {!preset.verified && (
            <p className="flex items-start gap-1.5 rounded-lg border border-breakeven/30 bg-breakeven/10 px-2.5 py-2 text-[11px] text-breakeven">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              ערכי ברירת מחדל — בדקו מול תנאי החברה.
            </p>
          )}

          <div className="rounded-xl border border-border-primary bg-bg-primary/40 p-3 space-y-3">
            <p className="text-xs font-semibold text-text-secondary">כללי האתגר</p>
            <AmountField label="יעד רווח" value={f.targetValue} unit={f.targetUnit}
              onValue={(v) => set({ targetValue: v })} onUnit={(u) => set({ targetUnit: u })}
              hint="ריק = ללא יעד (חשבון ממומן)" />

            <div className="space-y-1.5">
              <AmountField label="הפסד יומי מקסימלי" value={f.dailyValue} unit={f.dailyUnit}
                onValue={(v) => set({ dailyValue: v })} onUnit={(u) => set({ dailyUnit: u })} />
              {f.dailyUnit === 'pct' && (
                <SelectDropdown compact value={f.dailyBasis} options={BASIS_OPTIONS} onChange={(v) => v && set({ dailyBasis: v })} />
              )}
            </div>

            <div className="space-y-1.5">
              <AmountField label="דראודאון מקסימלי" value={f.ddValue} unit={f.ddUnit}
                onValue={(v) => set({ ddValue: v })} onUnit={(u) => set({ ddUnit: u })} />
              <SelectDropdown compact value={f.ddType} options={DD_TYPE_OPTIONS} onChange={(v) => v && set({ ddType: v })} />
              {f.ddType !== 'static' && (
                <div>
                  <label className={labelClass}>הנגרר נעצר ב־ (יתרה התחלתית + $)</label>
                  <input type="number" step="any" inputMode="decimal" value={f.ddLock} placeholder="ללא נעילה"
                    onChange={(e) => set({ ddLock: e.target.value })} className={inputClass} dir="ltr" style={{ textAlign: 'right' }} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0">
                <label className={labelClass}>ימי מסחר מינימליים</label>
                <input type="number" min="0" step="1" inputMode="numeric" value={f.minTradingDays} placeholder="0"
                  onChange={(e) => set({ minTradingDays: e.target.value })} className={inputClass} dir="ltr" style={{ textAlign: 'right' }} />
              </div>
              <div className="min-w-0">
                <label className={labelClass}>עקביות — יום מקס׳ (%)</label>
                <input type="number" min="0" max="99" step="any" inputMode="decimal" value={f.consistencyPct} placeholder="ללא"
                  onChange={(e) => set({ consistencyPct: e.target.value })} className={inputClass} dir="ltr" style={{ textAlign: 'right' }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
