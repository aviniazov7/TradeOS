import DOMPurify from 'dompurify';

// Renders **bold** markdown to sanitized <b> HTML for the AI coach bullet
// points. Shared by AICoachPanel + BacktestAICoachPanel, which carried
// identical copies (issue #216). Only <b>/<i> survive sanitization.
export function renderBulletHtml(text) {
  const html = text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: ['b', 'i'], ALLOWED_ATTR: [] });
}
