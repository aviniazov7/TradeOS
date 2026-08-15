// Parser for the AI report contract shared by the coach/analyst prompts:
// four canonical **bold** section headings, each followed by "• " bullets.
export const CANONICAL = ['חוזקות', 'חולשות', 'המלצות לפעולה', 'תובנות מתקדמות'];

function normalizeTitle(raw) {
  const t = raw.replace(/^#+\s*/, '').replace(/^\d+[.)]\s*/, '').replace(/\*\*/g, '').replace(/[:：]\s*$/, '').trim();
  return CANONICAL.find((c) => t === c || t.includes(c) || c.includes(t)) || t;
}

export function parseSections(text) {
  const sections = [];
  let current = null;
  const isHeading = (l) => /^\*\*(.+?)\*\*\s*$/.test(l) || /^#{1,6}\s+\S+/.test(l);
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (isHeading(line)) { current = { title: normalizeTitle(line), bullets: [] }; sections.push(current); continue; }
    if (!current) { current = { title: '', bullets: [] }; sections.push(current); }
    current.bullets.push(line.replace(/^[•\-*]\s*/, ''));
  }
  const known = sections.filter((s) => CANONICAL.includes(s.title) && s.bullets.length);
  known.sort((a, b) => CANONICAL.indexOf(a.title) - CANONICAL.indexOf(b.title));
  return known;
}
