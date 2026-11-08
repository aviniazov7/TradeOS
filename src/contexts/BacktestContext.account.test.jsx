// @vitest-environment happy-dom
import { act, useLayoutEffect } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { BACKTEST_JOURNAL_STORAGE_KEY, backtestJournalStorageKey } from '../utils/backtestSelection';

const db = vi.hoisted(() => ({
  user: { uid: 'user-a' },
  rows: {},
  listeners: [],
  writes: [],
  hold: false,
  migrated: {},
  addGate: null,
}));

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user: db.user }),
}));

vi.mock('../services/firestoreService', () => ({
  subscribeToUserCollection: (uid, name, _opts, onData, onError) => {
    const listener = { uid, name, onData, onError, active: true };
    db.listeners.push(listener);
    if (!db.hold) onData(db.rows[`${uid}|${name}`] || []);
    return () => { listener.active = false; };
  },
  seedUserCollection: () => ({ data: [], loading: true }),
  addToUserCollection: async (uid, col, data) => {
    const id = data?.isDefault ? `migrated-${uid}` : `added-${db.writes.length + 1}`;
    db.writes.push({ op: 'add', uid, col, id, data });
    if (db.addGate) await db.addGate;
    return { id };
  },
  updateUserDocument: async (uid, col, id, data) => {
    db.writes.push({ op: 'update', uid, col, id, data });
  },
  deleteUserDocument: async (uid, col, id) => {
    db.writes.push({ op: 'delete', uid, col, id });
  },
  getUserProfile: async (uid) => ({
    exists: true,
    data: { settings: { backtestMigrated: db.migrated[uid] !== false } },
  }),
  patchUserSettings: async (uid, data) => {
    db.writes.push({ op: 'settings', uid, data });
  },
  getRawCollectionSnapshot: async (uid, name) => {
    const docs = (db.rows[`${uid}|${name}`] || []).map((row) => ({
      id: row.id,
      data: () => row,
    }));
    return { empty: docs.length === 0, docs };
  },
  batchUpdateFromSnapshot: async () => {},
  timestamp: () => 'ts',
}));

import { BacktestProvider, useBacktestContext } from './BacktestContext';
import { useBacktests } from '../hooks/useBacktests';

const A_JOURNALS = [
  { id: 'old-a', name: 'בקטסט ראשי', createdAt: 1, entryRules: '' },
  { id: 'btc-a', name: 'BTC', createdAt: 2, entryRules: 'break of structure', pairs: ['BTCUSDT'] },
];
const B_JOURNALS = [
  { id: 'old-b', name: 'אחר', createdAt: 1, entryRules: 'not btc' },
  { id: 'btc-b', name: 'BTC', createdAt: 2, entryRules: 'other account' },
];

function seedRows() {
  db.rows = {
    'user-a|backtestJournals': A_JOURNALS.map((j) => ({ ...j })),
    'user-a|backtests': [
      { id: 'ta-btc', backtestJournalId: 'btc-a', pair: 'BTCUSDT' },
      { id: 'ta-old', backtestJournalId: 'old-a', pair: 'ETHUSDT' },
    ],
    'user-b|backtestJournals': B_JOURNALS.map((j) => ({ ...j })),
    'user-b|backtests': [
      { id: 'tb-btc', backtestJournalId: 'btc-b', pair: 'BTCUSDT' },
      { id: 'tb-old', backtestJournalId: 'old-b', pair: 'ETHUSDT' },
    ],
  };
}

function Probe() {
  const ctx = useBacktestContext();
  const selected = useBacktests(ctx.activeJournalId);
  const all = useBacktests();
  useLayoutEffect(() => {
    if (!db.record) return;
    db.frames.push({
      uid: db.user?.uid || '',
      loading: ctx.loading,
      name: ctx.activeJournal?.name || '',
      trades: selected.backtests.map((t) => t.id).join(','),
      all: all.backtests.map((t) => t.id).join(','),
    });
  });
  return (
    <div>
      <p id="loading">{String(ctx.loading)}</p>
      <p id="name">{ctx.activeJournal?.name || ''}</p>
      <p id="rules">{ctx.activeJournal?.entryRules || ''}</p>
      <p id="journal-id">{ctx.activeJournalId || ''}</p>
      <p id="trades">{selected.backtests.map((t) => t.id).join(',')}</p>
      <p id="all">{all.backtests.map((t) => t.id).join(',')}</p>
      <button
        id="save"
        onClick={() => {
          db.pending = ctx.updateJournal(ctx.activeJournalId, {
            name: ctx.activeJournal?.name,
            entryRules: ctx.activeJournal?.entryRules,
          });
        }}
      >save</button>
      <button
        id="save-foreign"
        onClick={() => {
          db.pending = ctx.updateJournal('btc-a', { entryRules: 'hijack', name: 'BTC' });
        }}
      >foreign</button>
      <button
        id="add"
        onClick={() => {
          db.pending = selected.addBacktest({ pair: 'BTCUSDT' });
        }}
      >add</button>
      <button
        id="create"
        onClick={() => {
          db.pending = ctx.addJournal({ name: 'BTC', entryRules: 'fresh' });
        }}
      >create</button>
    </div>
  );
}

function text(id) {
  return document.getElementById(id)?.textContent || '';
}

async function click(id) {
  let caught = null;
  await act(async () => {
    document.getElementById(id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    try {
      await db.pending;
    } catch (error) {
      caught = error;
    }
  });
  return caught;
}

describe('backtest account switch', () => {
  let root;
  let el;

  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

  beforeEach(() => {
    db.user = { uid: 'user-a' };
    db.listeners = [];
    db.writes = [];
    db.hold = false;
    db.migrated = {};
    db.addGate = null;
    db.pending = null;
    db.record = false;
    db.frames = [];
    seedRows();
    localStorage.clear();
    el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    el.remove();
  });

  async function show() {
    await act(async () => { root.render(<BacktestProvider><Probe /></BacktestProvider>); });
  }

  async function signIn(uid) {
    db.user = { uid };
    await show();
  }

  it('restores BTC settings and trades after A → B → A and does not write', async () => {
    localStorage.setItem(BACKTEST_JOURNAL_STORAGE_KEY, 'btc-a');
    await signIn('user-a');

    expect(text('name')).toBe('BTC');
    expect(text('rules')).toBe('break of structure');
    expect(text('trades')).toBe('ta-btc');
    expect(text('all')).toBe('ta-btc,ta-old');
    expect(localStorage.getItem(backtestJournalStorageKey('user-a'))).toBe('btc-a');
    expect(localStorage.getItem(BACKTEST_JOURNAL_STORAGE_KEY)).toBeNull();

    await signIn('user-b');
    expect(text('loading')).toBe('false');
    expect(text('name')).toBe('אחר');
    expect(text('rules')).toBe('not btc');
    expect(text('trades')).toBe('tb-old');
    expect(text('all')).toBe('tb-btc,tb-old');
    expect(text('all')).not.toContain('ta-');
    expect(localStorage.getItem(backtestJournalStorageKey('user-a'))).toBe('btc-a');

    const stale = db.listeners.find((l) => l.uid === 'user-a' && l.name === 'backtestJournals');
    await act(async () => {
      stale.onData([{ id: 'btc-a', name: 'WIPED', entryRules: '', createdAt: 2 }]);
    });
    expect(text('name')).toBe('אחר');

    await signIn('user-a');
    expect(text('name')).toBe('BTC');
    expect(text('rules')).toBe('break of structure');
    expect(text('journal-id')).toBe('btc-a');
    expect(text('trades')).toBe('ta-btc');
    expect(text('all')).toBe('ta-btc,ta-old');
    expect(db.writes.filter((w) => w.op === 'update' || w.op === 'delete')).toEqual([]);
  });

  it('keeps the other account’s legacy pointer when this account loads first', async () => {
    localStorage.setItem(BACKTEST_JOURNAL_STORAGE_KEY, 'btc-b');
    await signIn('user-a');
    expect(text('name')).toBe('בקטסט ראשי');
    expect(text('trades')).toBe('ta-old');
    expect(localStorage.getItem(BACKTEST_JOURNAL_STORAGE_KEY)).toBe('btc-b');

    await signIn('user-b');
    expect(text('name')).toBe('BTC');
    expect(text('rules')).toBe('other account');
    expect(text('trades')).toBe('tb-btc');
    expect(localStorage.getItem(backtestJournalStorageKey('user-b'))).toBe('btc-b');
    expect(localStorage.getItem(BACKTEST_JOURNAL_STORAGE_KEY)).toBeNull();
  });

  it('does not apply a journal snapshot or migration from the previous account', async () => {
    db.migrated['user-a'] = false;
    db.rows['user-a|backtestJournals'] = [];
    db.rows['user-a|backtests'] = [];
    let release;
    db.addGate = new Promise((resolve) => { release = resolve; });
    localStorage.setItem(backtestJournalStorageKey('user-b'), 'btc-b');

    await signIn('user-a');
    await act(async () => { await Promise.resolve(); });
    expect(db.writes.some((w) => w.op === 'add' && w.uid === 'user-a')).toBe(true);

    await signIn('user-b');
    expect(text('name')).toBe('BTC');
    expect(text('rules')).toBe('other account');

    await act(async () => { release(); await Promise.resolve(); await Promise.resolve(); });
    expect(text('name')).toBe('BTC');
    expect(text('journal-id')).toBe('btc-b');
    expect(text('rules')).toBe('other account');
    expect(db.writes.filter((w) => w.uid === 'user-b').map((w) => w.op)).not.toContain('add');
    expect(db.writes.filter((w) => w.uid === 'user-b').map((w) => w.op)).not.toContain('update');
  });

  it('refuses a save against a journal that is not loaded for this account', async () => {
    localStorage.setItem(backtestJournalStorageKey('user-a'), 'btc-a');
    await signIn('user-a');
    const saved = await click('save');
    expect(saved).toBeNull();
    expect(db.writes.at(-1)).toMatchObject({
      op: 'update',
      uid: 'user-a',
      col: 'backtestJournals',
      id: 'btc-a',
      data: { name: 'BTC', entryRules: 'break of structure' },
    });

    await signIn('user-b');
    const foreign = await click('save-foreign');
    expect(foreign).toBeInstanceOf(Error);
    expect(db.writes.filter((w) => w.id === 'btc-a' && w.uid === 'user-b')).toEqual([]);

    const added = await click('add');
    expect(added).toBeNull();
    expect(db.writes.at(-1)).toMatchObject({
      op: 'add',
      uid: 'user-b',
      col: 'backtests',
      data: { pair: 'BTCUSDT', backtestJournalId: 'old-b' },
    });
  });

  it('does not fall back to the oldest journal while a new one is still echoing', async () => {
    await signIn('user-a');
    expect(text('journal-id')).toBe('old-a');
    const created = await click('create');
    expect(created).toBeNull();
    const createdId = db.writes.find((w) => w.op === 'add' && w.uid === 'user-a')?.id;
    expect(createdId).toBeTruthy();
    expect(text('journal-id')).toBe(createdId);
    expect(text('name')).toBe('');
    expect(text('trades')).toBe('');

    const listener = db.listeners.find((l) => l.active && l.uid === 'user-a' && l.name === 'backtestJournals');
    await act(async () => {
      listener.onData([
        ...A_JOURNALS,
        { id: createdId, name: 'BTC', createdAt: 3, entryRules: 'fresh', pairs: ['BTCUSDT'] },
      ]);
    });
    expect(text('name')).toBe('BTC');
    expect(text('rules')).toBe('fresh');
    expect(text('journal-id')).toBe(createdId);
    expect(localStorage.getItem(backtestJournalStorageKey('user-a'))).toBe(createdId);
  });

  it('does not paint the previous account while the next snapshot is pending', async () => {
    localStorage.setItem(backtestJournalStorageKey('user-a'), 'btc-a');
    await signIn('user-a');
    expect(text('name')).toBe('BTC');
    expect(text('trades')).toBe('ta-btc');

    db.frames = [];
    db.record = true;
    db.hold = true;
    await signIn('user-b');

    const painted = db.frames.filter((frame) => frame.uid === 'user-b');
    expect(painted.length).toBeGreaterThan(0);
    for (const frame of painted) {
      expect(frame.loading).toBe(true);
      expect(frame.name).toBe('');
      expect(frame.trades).not.toContain('ta-');
      expect(frame.all).not.toContain('ta-');
    }
    expect(db.writes.filter((w) => w.op === 'update')).toEqual([]);
    db.record = false;
  });

  it('does not drop the stored journal when the listen fails, then loads it', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.hold = true;
    localStorage.setItem(BACKTEST_JOURNAL_STORAGE_KEY, 'btc-a');
    await signIn('user-a');
    expect(text('loading')).toBe('true');
    expect(text('name')).toBe('');

    const journals = db.listeners.find((l) => l.uid === 'user-a' && l.name === 'backtestJournals');
    await act(async () => { journals.onError(new Error('unavailable')); });
    expect(text('name')).toBe('');
    expect(localStorage.getItem(BACKTEST_JOURNAL_STORAGE_KEY)).toBe('btc-a');
    expect(db.writes).toEqual([]);

    await act(async () => { journals.onData(A_JOURNALS); });
    await act(async () => {
      db.listeners
        .filter((l) => l.active && l.uid === 'user-a' && l.name === 'backtests')
        .forEach((l) => l.onData(db.rows['user-a|backtests']));
    });
    expect(text('name')).toBe('BTC');
    expect(text('rules')).toBe('break of structure');
    expect(text('trades')).toBe('ta-btc');
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
