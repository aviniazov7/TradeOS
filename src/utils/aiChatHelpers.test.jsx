// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { formatAIText } from './aiChatHelpers';

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

  it('escapes HTML inside a table cell', () => {
    const out = html('| עמודה |\n| --- |\n| <img src=x onerror=alert(1)> |');
    expect(out).toContain('<table');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });
});