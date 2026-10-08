import { describe, it, expect } from 'vitest';
import { propFirmToForm, formToPropFirm, presetFields } from './propFirmForm';
import { normalizePropFirm } from '../../utils/propFirm';

describe('propFirm settings form', () => {
  it('a journal without prop settings starts disabled on FTMO phase 1', () => {
    const f = propFirmToForm(undefined);
    expect(f.enabled).toBe(false);
    expect(f.presetId).toBe('ftmo');
    expect(f.phase).toBe('phase1');
    expect(f.targetValue).toBe('10');
    expect(f.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('round-trips a stored map through the form unchanged', () => {
    const stored = {
      enabled: true,
      presetId: 'topstep',
      phase: 'combine',
      firmName: '',
      accountSize: 50000,
      startDate: '2026-08-01',
      profitTarget: { value: 3000, unit: 'usd' },
      maxDailyLoss: { value: 1000, unit: 'usd', basis: 'start_of_day' },
      maxDrawdown: { value: 2000, unit: 'usd', type: 'trailing_eod', lockOffset: 0 },
      minTradingDays: 2,
      consistencyPct: 50,
    };
    expect(formToPropFirm(propFirmToForm(stored))).toEqual(stored);
  });

  it('empty fields become "no rule", and the lock is dropped for a static drawdown', () => {
    const f = { ...propFirmToForm(null), enabled: true, targetValue: '', dailyValue: '0', ddType: 'static', ddLock: '100', consistencyPct: '' };
    const out = formToPropFirm(f);
    expect(out.profitTarget).toBeNull();
    expect(out.maxDailyLoss).toBeNull();
    expect(out.maxDrawdown.lockOffset).toBeNull();
    expect(out.consistencyPct).toBeNull();
    // No undefined anywhere — Firestore rejects it.
    expect(JSON.stringify(out)).not.toContain('undefined');
    expect(Object.values(out).every((v) => v !== undefined)).toBe(true);
  });

  it('keeps a custom firm name only for the custom preset', () => {
    const f = { ...propFirmToForm(null), ...presetFields('custom'), enabled: true, firmName: '  My FX  ' };
    expect(formToPropFirm(f).firmName).toBe('My FX');
    expect(normalizePropFirm(formToPropFirm(f)).firmName).toBe('My FX');
    expect(formToPropFirm({ ...f, ...presetFields('ftmo') }).firmName).toBe('');
  });

  it('switching size on a $ preset refills the scaled rules', () => {
    const f = presetFields('topstep', 'combine', 150000);
    expect(f.targetValue).toBe('9000');
    expect(f.ddValue).toBe('4500');
    expect(f.dailyValue).toBe('3000');
  });
});
