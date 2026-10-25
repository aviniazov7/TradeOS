// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { LazyMotion, domAnimation } from 'framer-motion';
import html from '../../utils/fixtures/mt5-report.html?raw';
import Mt5ImportDialog from './Mt5ImportDialog';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

function shell(node) {
  return <LazyMotion features={domAnimation} strict>{node}</LazyMotion>;
}

async function mount(props) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(shell(<Mt5ImportDialog isOpen onClose={() => {}} existingTrades={[]} onImport={async () => ({ imported: 0, failed: 0 })} {...props} />));
  });
  return {
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

async function chooseFile(contents, name) {
  const input = document.querySelector('[data-testid="mt5-file"]');
  const file = new File([contents], name, { type: 'text/html' });
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('Mt5ImportDialog', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const finished = Promise.resolve();
    window.HTMLElement.prototype.animate = () => ({
      cancel() {}, finish() {}, play() {}, pause() {},
      addEventListener() {}, removeEventListener() {},
      finished, ready: finished, currentTime: 0, playState: 'finished',
    });
  });

  it('shows the Hebrew MT5 export steps', async () => {
    const view = await mount();
    const text = document.querySelector('[data-testid="mt5-instructions"]').textContent;
    expect(text).toContain('History');
    expect(text).toContain('Report');
    expect(text).toContain('טיקט');
    expect(document.documentElement.querySelector('[dir="rtl"]') || document.querySelector('[dir="rtl"]')).toBeTruthy();
    await view.cleanup();
  });

  it('previews parsed trades and skips a ticket already in the journal', async () => {
    const onImport = vi.fn(async () => ({ imported: 2, failed: 0 }));
    const view = await mount({
      onImport,
      existingTrades: [{ externalId: 'mt5-123456789', status: 'closed' }],
    });
    await chooseFile(html, 'report.html');
    const preview = document.querySelector('[data-testid="mt5-preview"]').textContent;
    expect(preview).toContain('EURUSD');
    expect(preview).toContain('GBPUSD');
    expect(preview).toContain('XAUUSD');
    expect(preview).toContain('כבר ביומן');
    expect(preview).toContain('פתוח');
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('ייבא'));
    expect(button.textContent).toContain('2');
    await act(async () => { button.click(); });
    expect(onImport).toHaveBeenCalledTimes(1);
    const rows = onImport.mock.calls[0][0];
    expect(rows.map((t) => t.externalId).sort()).toEqual(['mt5-123456800', 'mt5-123456810']);
    expect(rows.every((t) => t.source === 'Vantage (MT5)')).toBe(true);
    await view.cleanup();
  });

  it('shows a Hebrew error for a file that is not an MT5 report', async () => {
    const view = await mount();
    await chooseFile('<html><body><p>hello</p></body></html>', 'notes.html');
    const alert = document.querySelector('[data-testid="mt5-import-error"]');
    expect(alert).toBeTruthy();
    expect(alert.textContent).toMatch(/[\u0590-\u05FF]/);
    expect(alert.textContent).toContain('MetaTrader 5');
    expect(document.querySelector('[data-testid="mt5-preview"]')).toBeNull();
    await view.cleanup();
  });
});
