import { describe, expect, it } from 'vitest';
import { SHARE_MESSAGE } from '../../worker/journalShare.js';
import { defaultShareFields } from './journalShareFilter';
import {
  SHARE_CREATED_MESSAGE,
  effectiveShareFields,
  journalShareLink,
  isOwnerEmail,
  shareExpiryPatch,
  shareRequestBody,
  sharesForJournal,
} from './journalShareOwner';

describe('journal share owner request', () => {
  it('uses the worker sentence, so the screen cannot invent a second wording', () => {
    expect(SHARE_CREATED_MESSAGE).toBe(SHARE_MESSAGE);
  });

  it('builds a public link that carries the token and no session', () => {
    expect(journalShareLink('ab'.repeat(32), 'https://tradeoslive.web.app/')).toBe(
      `https://tradeoslive.web.app/share/${'ab'.repeat(32)}`,
    );
  });

  it('blocks the owner address without caring about letter case', () => {
    expect(isOwnerEmail('Owner@Example.com', ' owner@example.com ')).toBe(true);
    expect(isOwnerEmail('owner@example.com', 'viewer@example.com')).toBe(false);
    expect(isOwnerEmail('', 'owner@example.com')).toBe(false);
  });

  it('always sends one end date and keeps trade-only fields off until trades is on', () => {
    const quiet = shareRequestBody({
      journalId: 'j1',
      email: 'Viewer@Example.com',
      fields: { ...defaultShareFields(), notes: true, emotions: true },
      expiry: '7',
    });
    expect(quiet.body).toEqual({
      journalId: 'j1',
      email: 'viewer@example.com',
      fields: defaultShareFields(),
      days: 7,
    });
    expect(quiet.body.expiresOn).toBeUndefined();

    const dated = shareRequestBody({
      journalId: 'j1',
      email: 'viewer@example.com',
      fields: { trades: true, notes: true, emotions: false, balances: false, tradingView: false },
      expiry: 'date',
      expiresOn: '2026-12-01',
    });
    expect(dated.body.days).toBeUndefined();
    expect(dated.body.expiresOn).toBe('2026-12-01');
    expect(dated.body.fields.notes).toBe(true);

    expect(shareRequestBody({
      journalId: 'j1', email: 'viewer@example.com', fields: defaultShareFields(), expiry: 'date', expiresOn: '',
    }).error).toBe('בחרו תאריך סיום');
    expect(shareExpiryPatch({ expiry: '14' }).error).toBe('בחרו תוקף');
    expect(effectiveShareFields({ trades: false, notes: true }).notes).toBe(false);
  });

  it('keeps another journal off the owner list for this journal', () => {
    const rows = sharesForJournal([
      { journalId: 'j1', viewerEmail: 'a@example.com' },
      { journalId: 'j2', viewerEmail: 'b@example.com' },
    ], 'j1');
    expect(rows.map((row) => row.viewerEmail)).toEqual(['a@example.com']);
  });
});
