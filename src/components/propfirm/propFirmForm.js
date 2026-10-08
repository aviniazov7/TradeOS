import { buildPropFirmRules, getPropFirmPreset } from '../../utils/propFirm';
import { localDayKey } from '../../utils/calculations';

// The settings form keeps every field as a string (controlled inputs); these
// two helpers translate between that and the stored `journal.propFirm` map.

const str = (v) => (v == null || v === '' ? '' : String(v));

function rulesToFields(r) {
  return {
    targetValue: str(r.profitTarget?.value),
    targetUnit: r.profitTarget?.unit || 'pct',
    dailyValue: str(r.maxDailyLoss?.value),
    dailyUnit: r.maxDailyLoss?.unit || 'pct',
    dailyBasis: r.maxDailyLoss?.basis || 'initial',
    ddValue: str(r.maxDrawdown?.value),
    ddUnit: r.maxDrawdown?.unit || 'pct',
    ddType: r.maxDrawdown?.type || 'static',
    ddLock: str(r.maxDrawdown?.lockOffset),
    minTradingDays: str(r.minTradingDays || ''),
    consistencyPct: str(r.consistencyPct),
  };
}

/** Form fields for a fresh preset/phase/size pick (rules refilled from the preset). */
export function presetFields(presetId, phaseId, accountSize) {
  const r = buildPropFirmRules(presetId, phaseId, accountSize);
  return { presetId: r.presetId, phase: r.phase, accountSize: str(r.accountSize), ...rulesToFields(r) };
}

/** Stored map → form state. A journal without one starts disabled on FTMO. */
export function propFirmToForm(stored) {
  if (!stored || typeof stored !== 'object') {
    return { enabled: false, firmName: '', startDate: localDayKey(new Date()), ...presetFields('ftmo', 'phase1') };
  }
  const preset = getPropFirmPreset(stored.presetId) || getPropFirmPreset('custom');
  return {
    enabled: !!stored.enabled,
    presetId: preset.id,
    phase: stored.phase || preset.phases[0].id,
    firmName: stored.firmName || '',
    accountSize: str(stored.accountSize),
    startDate: stored.startDate || '',
    ...rulesToFields(stored),
  };
}

const n = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : null;
};
const amount = (value, unit) => {
  const v = n(value);
  return v != null && v > 0 ? { value: v, unit: unit === 'usd' ? 'usd' : 'pct' } : null;
};

/** Form state → the single `propFirm` map written on the journal document. */
export function formToPropFirm(f) {
  const daily = amount(f.dailyValue, f.dailyUnit);
  const dd = amount(f.ddValue, f.ddUnit);
  const trailing = f.ddType !== 'static';
  const lock = n(f.ddLock);
  const consistency = n(f.consistencyPct);
  return {
    enabled: !!f.enabled,
    presetId: f.presetId,
    phase: f.phase || '',
    firmName: f.presetId === 'custom' ? (f.firmName || '').trim().slice(0, 40) : '',
    accountSize: Math.max(0, n(f.accountSize) || 0),
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(f.startDate || '') ? f.startDate : '',
    profitTarget: amount(f.targetValue, f.targetUnit),
    maxDailyLoss: daily && { ...daily, basis: f.dailyBasis === 'start_of_day' ? 'start_of_day' : 'initial' },
    maxDrawdown: dd && { ...dd, type: f.ddType, lockOffset: trailing && lock != null ? lock : null },
    minTradingDays: Math.max(0, Math.floor(n(f.minTradingDays) || 0)),
    consistencyPct: consistency != null && consistency > 0 && consistency < 100 ? consistency : null,
  };
}
