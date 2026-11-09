// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import JournalShareDialog from './JournalShareDialog';
import JournalSharePreview from './JournalSharePreview';
import { SHARE_CREATED_MESSAGE } from '../../utils/journalShareOwner';
import { defaultShareFields } from '../../utils/journalShareFilter';

const TOKEN = 'ab'.repeat(32);
const JOURNAL = {
  id: 'j1',
  name: 'יומן סודי',
  initialBalance: 1000,
  liveBalance: 99999,
  exchangeAddress: '0xSECRETADDRESS',
  propFirm: { accountSize: 5000, apiKey: 'tos_secret' },
};
const TRADES = [
  {
    id: 't1',
    journalId: 'j1',
    pair: 'BTCUSDT',
    direction: 'long',
    status: 'closed',
    result: 'win',
    netPnl: 10,
    pnl: 12,
    notes: 'SECRET-NOTE',
    entryReason: 'SECRET-REASON',
    emotionBefore: 'SECRET-FEAR',
    mistakes: 'SECRET-MISTAKE',
    tradingViewUrls: ['https://www.tradingview.com/chart/SECRET'],
    apiKey: 'tos_trade_secret',
    entryDate: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 't2',
    journalId: 'j2',
    pair: 'ETHSECRET',
    direction: 'short',
    status: 'closed',
    result: 'loss',
    netPnl: -5,
    notes: 'FOREIGN-NOTE',
    entryDate: '2026-01-02T00:00:00.000Z',
  },
];

const EXISTING = {
  id: 'a'.repeat(32),
  journalId: 'j1',
  viewerEmail: 'viewer@example.com',
  fields: defaultShareFields(),
  status: 'active',
  expiresAt: '2026-07-01T09:00:00.000Z',
  createdAt: '2026-06-01T00:00:00.000Z',
  token: 'LIST-TOKEN-MUST-STAY-HIDDEN',
};

function clientWith(state) {
  const calls = [];
  const client = {
    calls,
    async list() {
      calls.push({ op: 'list' });
      return { shares: state.shares };
    },
    async create(body) {
      calls.push({ op: 'create', body });
      state.shares = [
        ...state.shares,
        {
          id: 'c'.repeat(32),
          journalId: body.journalId,
          viewerEmail: body.email,
          fields: body.fields,
          status: 'active',
          expiresAt: '2026-06-22T12:00:00.000Z',
          createdAt: '2026-06-15T12:00:00.000Z',
        },
      ];
      return { ok: true, message: SHARE_CREATED_MESSAGE, token: TOKEN, share: state.shares.at(-1) };
    },
    async update(id, body) {
      calls.push({ op: 'update', id, body });
      return { ok: true };
    },
    async revoke(id) {
      calls.push({ op: 'revoke', id });
      state.shares = state.shares.map((share) => (share.id === id ? { ...share, status: 'revoked' } : share));
      return { ok: true };
    },
  };
  return client;
}

async function mount(node) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(node); });
  return {
    rerender: async (next) => { await act(async () => { root.render(next); }); },
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

function previewText() {
  return document.querySelector('[data-testid="share-preview"]').textContent;
}

function clickLabel(label) {
  const button = [...document.querySelectorAll('[role="switch"]')].find((node) => node.getAttribute('aria-label') === label);
  button.click();
}

async function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function clickText(text) {
  const button = [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === text);
  if (!button) throw new Error(`missing button ${text}`);
  button.click();
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe('journal share preview', () => {
  it('shows only the filtered copy, including a note only after that switch is on', async () => {
    const view = await mount(
      <JournalSharePreview journal={JOURNAL} trades={TRADES} fields={defaultShareFields()} />,
    );
    expect(previewText()).not.toContain('SECRET-NOTE');
    expect(previewText()).not.toContain('SECRET-FEAR');
    expect(previewText()).not.toContain('SECRET');
    expect(previewText()).not.toContain('99999');
    expect(previewText()).not.toContain('0xSECRETADDRESS');
    expect(previewText()).not.toContain('tos_secret');
    expect(previewText()).not.toContain('ETHSECRET');
    expect(previewText()).not.toContain('FOREIGN-NOTE');
    expect(previewText()).not.toContain('יומן סודי');
    expect(previewText()).toContain('אין עסקאות בעותק');
    expect(previewText()).toContain('אין יתרה בעותק');

    await view.rerender(
      <JournalSharePreview
        journal={JOURNAL}
        trades={TRADES}
        fields={{ ...defaultShareFields(), trades: true, balances: true }}
      />,
    );
    expect(previewText()).toContain('BTCUSDT');
    expect(previewText()).toContain('1000');
    expect(previewText()).toContain('5000');
    expect(previewText()).not.toContain('SECRET-NOTE');
    expect(previewText()).not.toContain('99999');
    expect(previewText()).not.toContain('ETHSECRET');

    await view.rerender(
      <JournalSharePreview
        journal={JOURNAL}
        trades={TRADES}
        fields={{ ...defaultShareFields(), trades: true, notes: true, emotions: true, tradingView: true }}
      />,
    );
    expect(previewText()).toContain('SECRET-NOTE');
    expect(previewText()).toContain('SECRET-FEAR');
    expect(previewText()).toContain('tradingview.com/chart/SECRET');
    expect(previewText()).not.toContain('tos_trade_secret');
    expect(previewText()).not.toContain('FOREIGN-NOTE');
    await view.cleanup();
  });
});

describe('journal share dialog', () => {
  it('gives every email the same sentence, shows the token once, and hides it from the list', async () => {
    const state = {
      shares: [EXISTING, {
        id: 'b'.repeat(32),
        journalId: 'j2',
        viewerEmail: 'other-journal@example.com',
        status: 'active',
        expiresAt: '2026-07-01T09:00:00.000Z',
        createdAt: '2026-06-01T00:00:00.000Z',
      }],
    };
    const client = clientWith(state);
    const view = await mount(
      <JournalShareDialog isOpen journal={JOURNAL} trades={TRADES} ownerEmail="owner@example.com" client={client} />,
    );
    expect(document.querySelector('[data-testid="share-list"]').textContent).toContain('viewer@example.com');
    expect(document.body.textContent).not.toContain('other-journal@example.com');
    expect(document.body.textContent).not.toContain('LIST-TOKEN-MUST-STAY-HIDDEN');
    expect(previewText()).not.toContain('SECRET-NOTE');

    const email = document.querySelector('#share-email');
    await typeInto(email, 'Owner@Example.com');
    await act(async () => { clickText('יצירת שיתוף'); });
    expect(client.calls.some((call) => call.op === 'create')).toBe(false);
    expect(document.body.textContent).toContain('אי אפשר לשתף אל הכתובת שלכם');

    await typeInto(email, 'new-viewer@example.com');
    await act(async () => { clickText('יצירת שיתוף'); });
    const created = client.calls.find((call) => call.op === 'create');
    expect(created.body).toMatchObject({
      journalId: 'j1',
      email: 'new-viewer@example.com',
      days: 7,
      fields: defaultShareFields(),
    });
    expect(created.body.expiresOn).toBeUndefined();
    expect(document.querySelector('[data-testid="share-created"]').textContent).toContain(SHARE_CREATED_MESSAGE);
    expect(document.querySelector('[data-testid="share-token"]').value).toBe(TOKEN);
    expect(document.querySelector('[data-testid="share-list"]').textContent).not.toContain(TOKEN);
    expect(document.querySelector('[data-testid="share-list"]').textContent).toContain('new-viewer@example.com');

    await act(async () => { clickLabel('עסקאות'); });
    expect(previewText()).toContain('BTCUSDT');
    expect(previewText()).not.toContain('SECRET-NOTE');
    const notes = [...document.querySelectorAll('[role="switch"]')].find((node) => node.getAttribute('aria-label') === 'הערות');
    expect(notes.disabled).toBe(false);
    await view.cleanup();
  });

  it('does not create a share when the manual end date is empty, and extend or revoke stay on this journal', async () => {
    const state = { shares: [{ ...EXISTING }] };
    const client = clientWith(state);
    const view = await mount(
      <JournalShareDialog isOpen journal={JOURNAL} trades={TRADES} ownerEmail="owner@example.com" client={client} />,
    );
    await typeInto(document.querySelector('#share-email'), 'viewer@example.com');
    await act(async () => { clickText('תאריך'); });
    await act(async () => { clickText('יצירת שיתוף'); });
    expect(client.calls.some((call) => call.op === 'create')).toBe(false);
    expect(document.body.textContent).toContain('בחרו תאריך סיום');

    await act(async () => { clickText('90'); });
    await act(async () => { clickText('הארכת תוקף'); });
    expect(client.calls.find((call) => call.op === 'update')).toEqual({
      op: 'update', id: EXISTING.id, body: { days: 90 },
    });

    await act(async () => { clickText('ביטול שיתוף'); });
    await act(async () => { clickText('ביטול'); });
    expect(client.calls.some((call) => call.op === 'revoke' && call.id === EXISTING.id)).toBe(true);
    expect(document.querySelector('[data-testid="share-list"]').textContent).toContain('בוטל');
    await view.cleanup();
  });
});
