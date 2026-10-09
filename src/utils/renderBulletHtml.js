import DOMPurify from 'dompurify';
import { wrapLtrRuns } from './bidiNumbers';

// Renders **bold** markdown to sanitized <b> HTML for the AI coach bullet
// points. Shared by AICoachPanel + BacktestAICoachPanel, which carried
// identical copies (issue #216). Only <b>/<i> and the LTR number spans
// (<span dir="ltr">, so "+200 USDT" doesn't flip in RTL) survive sanitization.
export function renderBulletHtml(text) {
  const html = wrapLtrRuns(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: ['b', 'i', 'span'], ALLOWED_ATTR: ['dir'] });
}
