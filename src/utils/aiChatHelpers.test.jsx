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
    expect(out).toContain('<li');
    expect(out).not.toContain('**');
  });
});