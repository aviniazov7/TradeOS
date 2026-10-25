// Review line under the admin reminder generator. The panel has shipped two
// response shapes: `{ facts: { btc, eth, gainers, losers, headlines } }` and
// `{ stats: { weekTrades, openTrades, journalDays, daysSinceLogin } }`.
// Either field, or both, may be missing. Every read is optional — the old
// `hook.facts.headlines` access threw in Safari when `facts` was absent.

function statBits(stats) {
  if (!stats || typeof stats !== 'object') return [];
  const bits = [];
  if (stats.weekTrades > 0) bits.push(stats.weekTrades === 1 ? 'השבוע עסקה אחת' : `השבוע ${stats.weekTrades} עסקאות`);
  if (stats.openTrades > 0) bits.push(stats.openTrades === 1 ? 'עסקה פתוחה אחת' : `${stats.openTrades} עסקאות פתוחות`);
  if (stats.journalDays > 0) bits.push(stats.journalDays === 1 ? 'יום אחד ביומן' : `${stats.journalDays} ימים ביומן`);
  if (Number.isInteger(stats.daysSinceLogin)) {
    bits.push(stats.daysSinceLogin === 0 ? 'נכנס היום' : stats.daysSinceLogin === 1 ? 'כניסה אתמול' : `כניסה לפני ${stats.daysSinceLogin} ימים`);
  }
  return bits;
}

function factBits(facts) {
  if (!facts || typeof facts !== 'object') return { line: '', headline: '' };
  const movers = [
    facts.btc,
    facts.eth,
    ...(Array.isArray(facts.gainers) ? facts.gainers : []),
    ...(Array.isArray(facts.losers) ? facts.losers : []),
  ].filter((row) => row && typeof row === 'object' && row.coin != null);
  const line = movers.map((row) => {
    const change = Number(row.change);
    const sign = Number.isFinite(change) && change > 0 ? '+' : '';
    return `${row.coin} ${sign}${Number.isFinite(change) ? change : ''}%`;
  }).join(' · ');
  const headlines = Array.isArray(facts.headlines) ? facts.headlines : [];
  const headline = typeof headlines[0] === 'string' ? headlines[0] : '';
  return { line, headline };
}

// `{ line, headline }` for the review box. Never throws.
export function reminderHookReview(hook) {
  if (!hook || typeof hook !== 'object') return { line: '', headline: '' };
  const fromStats = statBits(hook.stats).join(' · ');
  const fromFacts = factBits(hook.facts);
  return {
    line: fromStats || fromFacts.line,
    headline: fromFacts.headline,
  };
}
