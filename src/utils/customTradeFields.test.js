import { describe, expect, it } from 'vitest';
import { computeTagStats } from './tagMistakeStats';
import {
  addCustomField,
  updateCustomField,
  computeCustomFieldStats,
  customFormState,
  customFromCsvRow,
  customPayload,
  normalizeCustomFieldsDoc,
  removeCustomField,
  sanitizeCustomMap,
  tradeMatchesCustom,
  validateApiCustom,
} from './customTradeFields';

const closed = (over) => ({
  status: 'closed',
  result: 'win',
  direction: 'long',
  entryPrice: 100,
  exitPrice: 110,
  netPnl: 40,
  ...over,
});

const textField = { id: 'f1', name: 'סשן', type: 'text' };
const numberField = { id: 'f2', name: 'ציון', type: 'number' };
const selectField = { id: 'f3', name: 'איכות', type: 'select', options: ['A', 'B'] };

describe('custom field definitions', () => {
  it('treats a missing settings doc as no fields', () => {
    expect(normalizeCustomFieldsDoc(null)).toEqual({ fields: [], seq: 0 });
    expect(normalizeCustomFieldsDoc({ fields: 'nope' })).toEqual({ fields: [], seq: 0 });
  });

  it('keeps a valid list and drops a broken field', () => {
    const doc = normalizeCustomFieldsDoc({
      seq: 3,
      fields: [
        textField,
        { id: 'f1', name: 'כפול', type: 'text' },
        { id: 'nope', name: 'רע', type: 'text' },
        { id: 'f4', name: 'בחירה', type: 'select', options: [] },
        selectField,
      ],
    });
    expect(doc.fields.map((field) => field.id)).toEqual(['f1', 'f3']);
    expect(doc.seq).toBe(3);
  });

  it('lets Premium add a field and refuses a free account', () => {
    const first = addCustomField({ fields: [], seq: 0 }, { name: ' סשן ', type: 'text' }, { isPremium: true });
    expect(first.ok).toBe(true);
    expect(first.fields).toEqual([{ id: 'f1', name: 'סשן', type: 'text' }]);
    expect(first.seq).toBe(1);

    const blocked = addCustomField(first, { name: 'עוד', type: 'number' }, { isPremium: false });
    expect(blocked.ok).toBe(false);

    const removed = removeCustomField(first, 'f1');
    const again = addCustomField(removed, { name: 'ציון', type: 'number' }, { isPremium: true });
    expect(again.fields[0].id).toBe('f2');
    expect(again.seq).toBe(2);
  });

  it('requires options for a select field', () => {
    const missing = addCustomField({ fields: [], seq: 0 }, { name: 'איכות', type: 'select', options: ' , ' }, { isPremium: true });
    expect(missing.ok).toBe(false);
    const saved = addCustomField(
      { fields: [], seq: 0 },
      { name: 'איכות', type: 'select', options: 'A, B, A' },
      { isPremium: true },
    );
    expect(saved.fields[0].options).toEqual(['A', 'B']);
    const slashed = addCustomField(
      { fields: [], seq: 0 },
      { name: 'סטאפ', type: 'select', options: 'Breakout / Pullback' },
      { isPremium: true },
    );
    expect(slashed.fields[0].options).toEqual(['Breakout', 'Pullback']);
  });

  it('edits a field in place and keeps its id', () => {
    const first = addCustomField({ fields: [], seq: 0 }, { name: 'סשן', type: 'text' }, { isPremium: true });
    const edited = updateCustomField(first, 'f1', { name: ' סטאפ ', type: 'select', options: 'Breakout, Pullback, Breakout' }, { isPremium: true });
    expect(edited.ok).toBe(true);
    expect(edited.seq).toBe(1);
    expect(edited.fields).toEqual([{ id: 'f1', name: 'סטאפ', type: 'select', options: ['Breakout', 'Pullback'] }]);

    const blocked = updateCustomField(edited, 'f1', { name: 'אחר', type: 'text' }, { isPremium: false });
    expect(blocked.ok).toBe(false);

    const second = addCustomField(edited, { name: 'ציון', type: 'number' }, { isPremium: true });
    const clash = updateCustomField(second, 'f2', { name: 'סטאפ', type: 'text' }, { isPremium: true });
    expect(clash.error).toBe('כבר יש שדה בשם הזה');
    expect(updateCustomField(second, 'f9', { name: 'אחר', type: 'text' }, { isPremium: true }).ok).toBe(false);
    const cleared = updateCustomField(second, 'f1', { name: 'סטאפ', type: 'text' }, { isPremium: true });
    expect(cleared.fields[0]).toEqual({ id: 'f1', name: 'סטאפ', type: 'text' });
    expect(cleared.seq).toBe(2);
  });
});

describe('custom values on a trade', () => {
  const defs = [textField, numberField, selectField];

  it('omits an empty or junk map', () => {
    expect(sanitizeCustomMap(undefined, defs)).toBeNull();
    expect(sanitizeCustomMap('לונדון', defs)).toBeNull();
    expect(sanitizeCustomMap({ f1: '  ', f2: 'לא מספר', nested: { a: 1 } }, defs)).toBeNull();
  });

  it('keeps string and number answers and ignores unknown keys', () => {
    expect(sanitizeCustomMap({
      f1: ' לונדון ',
      f2: '1,5',
      f3: 'A',
      f9: 'זר',
      secret: { apiKey: 'x' },
    }, defs)).toEqual({ f1: 'לונדון', f2: 1.5, f3: 'A' });
  });

  it('still shows a saved select answer that is no longer an option', () => {
    expect(customFormState({ f3: 'C' }, defs).f3).toBe('C');
    expect(customPayload({ f1: '', f2: '', f3: 'C' }, defs)).toEqual({ f3: 'C' });
  });
});

describe('computeCustomFieldStats', () => {
  const defs = [textField, numberField];

  it('adds nothing for trades that have no custom field', () => {
    expect(computeCustomFieldStats([closed({}), closed({ custom: null }), closed({ custom: 'לונדון' })], defs)).toEqual([]);
    expect(computeTagStats([closed({ tags: ['breakout'] })])).toHaveLength(1);
  });

  it('leaves open trades out and groups closed trades by value', () => {
    const stats = computeCustomFieldStats([
      closed({ status: 'open', exitPrice: 0, custom: { f1: 'לונדון' }, netPnl: 80 }),
      closed({ custom: { f1: 'לונדון', f2: 2 }, netPnl: 40, result: 'win' }),
      closed({ custom: { f1: 'לונדון', f2: '2' }, netPnl: -10, result: 'loss' }),
      closed({ custom: { f1: 'ניו יורק' }, netPnl: 5, result: 'win' }),
    ], defs);
    expect(stats.find((group) => group.id === 'f1').rows.map((row) => row.label)).toEqual(['לונדון', 'ניו יורק']);
    expect(stats.find((group) => group.id === 'f1').rows[0]).toMatchObject({
      count: 2, wins: 1, losses: 1, pnl: 30, winRate: 50,
    });
    expect(stats.find((group) => group.id === 'f2').rows).toEqual([
      expect.objectContaining({ label: '2', count: 2, pnl: 30, winRate: 50 }),
    ]);
  });

  it('checks API answers against the defined fields', () => {
    const defs = [textField, numberField, selectField];
    expect(validateApiCustom({ f1: 'לונדון', f2: 2, f3: 'A' }, defs).custom).toEqual({ f1: 'לונדון', f2: 2, f3: 'A' });
    expect(validateApiCustom({}, defs).custom).toBeNull();
    expect(validateApiCustom({ f9: 'x' }, defs).ok).toBe(false);
    expect(validateApiCustom({ f3: 'C' }, defs).ok).toBe(false);
    expect(validateApiCustom({ f3: 'C' }, defs, { f3: 'C' }).custom).toEqual({ f3: 'C' });
    expect(validateApiCustom('לונדון', defs).ok).toBe(false);
  });

  it('reads only defined columns back from a CSV row', () => {
    const defs = [textField, selectField];
    expect(customFromCsvRow({ 'שדה: סשן': ' לונדון ', 'שדה: איכות': 'A', הערות: 'לא שדה' }, defs)).toEqual({
      f1: 'לונדון', f3: 'A',
    });
    expect(customFromCsvRow({ 'שדה: סשן': 'לונדון' }, [])).toBeNull();
    expect(customFromCsvRow({ 'שדה: איכות': 'לא ברשימה' }, defs)).toBeNull();
    expect(customFromCsvRow({ זוג: 'BTCUSDT' }, defs)).toBeNull();
  });

  it('matches a filter only when the trade stores that answer', () => {
    expect(tradeMatchesCustom(closed({}), 'f1', 'לונדון')).toBe(false);
    expect(tradeMatchesCustom(closed({ custom: { f1: ' לונדון ' } }), 'f1', 'לונדון')).toBe(true);
    expect(tradeMatchesCustom(closed({ custom: { f2: 2 } }), 'f2', '2')).toBe(true);
    expect(tradeMatchesCustom(closed({ custom: { f2: 2 } }), 'f2', '3')).toBe(false);
  });
});
