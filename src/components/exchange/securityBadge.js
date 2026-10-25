// The security tile used to say "read-only key" for every connection. It may
// say that only when each key-based exchange was checked (or the connection
// is a public wallet address, which cannot trade).

export function securityBadge(connections) {
  if (!connections?.length) {
    return { value: '—', sub: 'אין בורסה מחוברת', tone: 'text-text-muted', secure: false };
  }
  const fileOnly = connections.every((c) => c?.authType === 'file');
  if (fileOnly) {
    return { value: 'מוגן', sub: 'ייבוא מקובץ, בלי מפתח', tone: 'text-profit', secure: true };
  }
  const unverified = connections.some((c) => c?.authType !== 'address' && c?.authType !== 'file' && c?.readOnlyVerified !== true);
  if (unverified) {
    return { value: 'חלקי', sub: 'קריאה בלבד לא אומתה', tone: 'text-breakeven', secure: false };
  }
  return { value: 'מוגן', sub: 'מפתח לקריאה בלבד', tone: 'text-profit', secure: true };
}
