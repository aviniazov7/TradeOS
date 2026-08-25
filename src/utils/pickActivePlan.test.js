import { describe, it, expect } from 'vitest';
import { pickActivePlan } from './pickActivePlan';

// Several active plans is the NORMAL state: every plan is created with
// isActive: true and nothing deactivates the others. Without one deterministic
// rule the analyst page and the AI coach can audit different plans in the same
// session and disagree about the same trades.

const plan = (id, over = {}) => ({ id, isActive: true, ...over });
const at = (iso) => new Date(iso);

describe('pickActivePlan', () => {
  it('prefers active plans over inactive ones', () => {
    const picked = pickActivePlan([
      plan('a', { isActive: false, updatedAt: at('2026-08-10') }),
      plan('b', { updatedAt: at('2026-08-01') }),
    ]);
    expect(picked.id).toBe('b');
  });

  it('falls back to the whole list when NOTHING is active', () => {
    const picked = pickActivePlan([
      plan('a', { isActive: false, updatedAt: at('2026-08-01') }),
      plan('b', { isActive: false, updatedAt: at('2026-08-10') }),
    ]);
    expect(picked.id).toBe('b');
  });

  it('most recently updated wins', () => {
    expect(pickActivePlan([
      plan('old', { updatedAt: at('2026-01-01') }),
      plan('new', { updatedAt: at('2026-08-01') }),
    ]).id).toBe('new');
  });

  it('falls back to createdAt when updatedAt cannot separate them', () => {
    expect(pickActivePlan([
      plan('a', { createdAt: at('2026-01-01') }),
      plan('b', { createdAt: at('2026-08-01') }),
    ]).id).toBe('b');
  });

  it('is deterministic even when every timestamp is missing', () => {
    // Firestore returns documents in doc-ID order, so without the id tiebreak
    // two screens could each pick a different plan from the same list.
    const list = [plan('zeta'), plan('alpha'), plan('mid')];
    expect(pickActivePlan(list).id).toBe('alpha');
    expect(pickActivePlan([...list].reverse()).id).toBe('alpha');
  });

  it('reads Firestore Timestamps as well as Dates and strings', () => {
    expect(pickActivePlan([
      plan('a', { updatedAt: { toDate: () => at('2026-01-01') } }),
      plan('b', { updatedAt: { toDate: () => at('2026-08-01') } }),
    ]).id).toBe('b');
  });

  it('an unparseable timestamp sorts oldest instead of throwing', () => {
    expect(pickActivePlan([
      plan('junk', { updatedAt: 'not a date' }),
      plan('real', { updatedAt: at('2020-01-01') }),
    ]).id).toBe('real');
  });

  it('handles an empty or missing list', () => {
    expect(pickActivePlan([])).toBe(null);
    expect(pickActivePlan(null)).toBe(null);
    expect(pickActivePlan(undefined)).toBe(null);
  });
});
