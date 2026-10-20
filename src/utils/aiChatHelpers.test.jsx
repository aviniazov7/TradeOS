// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { formatAIText } from './aiChatHelpers';
import { recentTradesMarkdown, selectRecentClosed } from './recentTradesContext';

function html(text) {
  return renderToStaticMarkup(<div>{formatAIText(text)}</div>);
}

describe('TradeAI markdown', () => {
  it('renders bold and italic and does not leave the markers', () => {
    const out = html('המחיר **עלה** ואז *ירד* ב-__חדות__');
    expect(out).toContain('<strong>עלה</strong>');
    expect(out).toContain('<em>ירד</em>');
    expect(out).toContain('<strong>חדות</strong>');
    expect(out).not.toContain('**');
    expect(out).not.toContain('__');
  });

  it('renders inline code and strips raw HTML', () => {
    const out = html('רמה `LPS` <script>alert(1)</script>');
    expect(out).toContain('<code');
    expect(out).toContain('LPS');
    expect(out).not.toContain('<script');
    expect(out).toContain('&lt;script&gt;');
  });

  it('renders numbered chart headings without literal asterisks', () => {
    const out = html([
      '**הטיה טכנית:** שורי — ודאות בינונית',
      '1. **מבנה כללי**',
      '2. **אזורי מפתח** — תמיכה ב-$0.74 ופריצה',
      '3. *אירועים* בולטים עם **כוכב** לא סגור **',
      'שורה עם `a*b` בקוד',
    ].join('\n'));
    expect(out).toContain('הטיה טכנית');
    expect(out).toContain('<strong>הטיה טכנית:</strong>');
    expect(out).toContain('<strong>מבנה כללי</strong>');
    expect(out).toContain('1. <strong>מבנה כללי</strong>');
    expect(out).toContain('2. אזורי מפתח');
    expect(out).toContain('תמיכה');
    expect(out).toContain('<em>אירועים</em>');
    expect(out).toContain('<strong>כוכב</strong>');
    expect(out).toContain('a*b');
    expect(out).not.toContain('**');
    expect(out.replace(/<code\b[^>]*>[\s\S]*?<\/code>/g, '')).not.toContain('*');
  });

  it('renders a markdown heading and a bullet', () => {
    const out = html('### מבנה\n- נקודה **חשובה**');
    expect(out).toContain('מבנה');
    expect(out).toContain('<strong>חשובה</strong>');
    expect(out).toContain('<ul');
    expect(out).toContain('<li');
    expect(out).not.toContain('**');
  });

  it('renders a GFM table and keeps inline markdown inside cells', () => {
    const out = html([
      'נקודות החוזקה',
      '',
      '| קטגוריה | מדד | תוצאה |',
      '| :--- | ---: | :---: |',
      '| סוגי תנועה | 55 | **Short** |',
      '| סוגים | 32 | `Price action` |',
      '',
      'שורה אחרי | לא טבלה',
    ].join('\n'));
    expect(out).toContain('<table');
    expect(out).toContain('overflow-x-auto');
    expect(out).toContain('<th');
    expect(out).toContain('קטגוריה');
    expect(out).toContain('<td');
    expect(out).toContain('<strong>Short</strong>');
    expect(out).toContain('<code');
    expect(out).toContain('Price action');
    expect(out).toContain('text-left');
    expect(out).toContain('text-center');
    expect(out).not.toContain('|---|');
    expect(out).not.toContain(':---');
    expect(out).toContain('שורה אחרי | לא טבלה');
  });

  it('renders a recent-trades GFM table with five rows', () => {
    const trade = (overrides) => ({
      status: 'closed',
      pair: 'BTCUSDT',
      direction: 'long',
      entryPrice: 100,
      exitPrice: 110,
      stopLoss: 90,
      quantity: 1,
      netPnl: 8,
      exitDate: new Date(2026, 9, 16),
      ...overrides,
    });
    const book = selectRecentClosed([
      trade({ pair: 'BTCUSDT', exitDate: new Date(2026, 9, 16), netPnl: 12, entryPrice: 65000, exitPrice: 66000, stopLoss: 64000 }),
      trade({ pair: 'ETHUSDT', direction: 'short', exitDate: new Date(2026, 9, 15), netPnl: -4, entryPrice: 2000, exitPrice: 2050, stopLoss: 1900 }),
      trade({ pair: 'SOLUSDT', exitDate: new Date(2026, 9, 14), netPnl: 3.5, entryPrice: 140, exitPrice: 150, stopLoss: 130 }),
      trade({ pair: 'ADAUSDT', exitDate: new Date(2026, 9, 13), netPnl: 1, entryPrice: 0.4, exitPrice: 0.45, stopLoss: 0.35 }),
      trade({ pair: 'NEARUSDT', direction: 'short', exitDate: new Date(2026, 9, 12), netPnl: -2, entryPrice: 5, exitPrice: 5.4, stopLoss: 4.5 }),
      trade({ pair: 'XRPUSDT', exitDate: new Date(2026, 9, 1), netPnl: 9 }),
    ]);
    const out = html(recentTradesMarkdown(book.rows, 5));
    expect(out).toContain('<table');
    expect(out).toContain('overflow-x-auto');
    expect(out).toContain('תאריך');
    expect(out).toContain('רווח/הפסד');
    expect(out).toContain('BTC');
    expect(out).toContain('NEAR');
    expect(out).not.toContain('>XRP<');
    expect(out).toContain('Long');
    expect(out).toContain('Short');
    expect(out).toContain('>R<');
    expect(out.match(/<tr/g).length).toBe(6);
  });

  it('puts the sign first on P&L and R cells and colors only those columns', () => {
    const out = html([
      '| תאריך | כניסה | P&L (USD) | R |',
      '| --- | ---: | ---: | ---: |',
      '| 2026-10-16 | 65000 | 11.24- | 1.06- |',
      '| 2026-10-15 | 0.45 | +8.5 | 1.2 |',
      '| 2026-10-14 | 5 | +$1,234.50 | 0 |',
    ].join('\n'));
    expect(out).toContain('dir="ltr"');
    expect(out).toContain('unicode-bidi:isolate');
    expect(out).toContain('num-ltr');
    expect(out).toContain('tabular-nums');
    expect(out).toContain('overflow-x-auto');
    expect(out).toContain('-$11.24');
    expect(out).toContain('-1.06R');
    expect(out).toContain('+$8.50');
    expect(out).toContain('+1.20R');
    expect(out).toContain('+$1,234.50');
    expect(out).toContain('0.00R');
    expect(out).toContain('65000');
    expect(out).toContain('text-loss');
    expect(out).toContain('text-profit');
    expect(out).not.toContain('11.24-');
    expect(out).not.toContain('1.06-');
    // Entry prices are LTR but not painted as P&L.
    const entry = out.split('65000')[0];
    expect(entry.slice(entry.lastIndexOf('<td'))).not.toContain('text-profit');
    expect(entry.slice(entry.lastIndexOf('<td'))).not.toContain('text-loss');
  });

  it('isolates a trailing minus inside a prose line', () => {
    const out = html('הפסד של 11.24- ביומן');
    expect(out).toContain('dir="ltr"');
    expect(out).toContain('class="num-ltr"');
    expect(out).toContain('-11.24');
    expect(out).not.toContain('11.24-');
  });

  it('escapes HTML inside a table cell', () => {
    const out = html('| עמודה |\n| --- |\n| <img src=x onerror=alert(1)> |');
    expect(out).toContain('<table');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });
});