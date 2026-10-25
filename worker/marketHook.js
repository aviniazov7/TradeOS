// Market-fact helpers, kept so the fact-picking tests still cover the parser.
// Admin reminder emails do not use this module. Their copy is reminderCopy.js:
// a calm personal update, not a market alert.

// Liquid USDT pairs only (24h turnover) — a +40% micro-cap isn't a story.
const MIN_TURNOVER_USD = 20_000_000;
// Stablecoins, wrapped/leveraged tokens and fiat — their moves aren't news.
const EXCLUDE = /^(USDC|USDE|FDUSD|TUSD|DAI|PYUSD|USDD|BUSD|EUR|GBP|TRY|BRL|WBTC|WETH|STETH|WSTETH|CBBTC)$|(\d[LS]|UP|DOWN)$/;

const round1 = (n) => Math.round(n * 10) / 10;

// Bybit spot tickers + the cached news digest → the facts the copy may use.
// tickers: [{ symbol: 'BTCUSDT', lastPrice, price24hPcnt (fraction), turnover24h }]
// digest:  { stories: [{ headline, impact }] } | null
export function pickMarketFacts(tickers = [], digest = null) {
  const rows = [];
  for (const t of tickers) {
    const sym = String(t.symbol || '');
    if (!sym.endsWith('USDT')) continue;
    const coin = sym.slice(0, -4);
    const change = parseFloat(t.price24hPcnt) * 100;
    const price = parseFloat(t.lastPrice);
    const turnover = parseFloat(t.turnover24h);
    if (!coin || EXCLUDE.test(coin) || !Number.isFinite(change) || !(price > 0)) continue;
    rows.push({ coin, price, change: round1(change), turnover: Number.isFinite(turnover) ? turnover : 0 });
  }
  const find = (c) => rows.find((r) => r.coin === c) || null;
  const liquid = rows.filter((r) => r.turnover >= MIN_TURNOVER_USD && r.coin !== 'BTC' && r.coin !== 'ETH');
  const gainers = [...liquid].sort((a, b) => b.change - a.change).filter((r) => r.change > 0).slice(0, 3);
  const losers = [...liquid].sort((a, b) => a.change - b.change).filter((r) => r.change < 0).slice(0, 2);
  const stories = Array.isArray(digest?.stories) ? digest.stories : [];
  const headlines = [...stories.filter((s) => s.impact === 'high'), ...stories.filter((s) => s.impact !== 'high')]
    .map((s) => String(s.headline || '').trim())
    .filter(Boolean)
    .slice(0, 3);
  const strip = ({ coin, price, change }) => ({ coin, price, change });
  return {
    btc: find('BTC') && strip(find('BTC')),
    eth: find('ETH') && strip(find('ETH')),
    gainers: gainers.map(strip),
    losers: losers.map(strip),
    headlines,
  };
}

// Every percentage the facts contain — the only ones the copy may mention.
export function factPercents(facts) {
  return [facts.btc, facts.eth, ...facts.gainers, ...facts.losers]
    .filter(Boolean)
    .map((f) => Math.abs(f.change));
}

export const HOOK_SYSTEM_PROMPT = `אתה קופירייטר של TradeOS — יומן מסחר לסוחרי קריפטו. כתוב הודעה קצרה שתגרום לסוחר לפתוח את האפליקציה עכשיו.
כללים:
- השתמש רק בעובדות שבקלט. אל תמציא מספרים, מטבעות או אירועים. אחוזים — בדיוק כפי שהם בקלט.
- פתח עם התנועה הכי מעניינת בשוק (מספר אמיתי), וחבר אותה לפעולה באפליקציה: לבדוק את העסקאות הפתוחות, לתעד, לנתח, או לקרוא מה הזיז את השוק.
- טון: חד, אנרגטי, לא מתחנף. בלי "לא ראינו אותך". בלי המלצות קנייה/מכירה.
- עברית טבעית. אמוג'י אחד לכל היותר בכותרת.
החזר JSON בלבד:
{"title": "כותרת עד 60 תווים", "push": "טקסט התראה עד 140 תווים", "email": "גוף מייל: 2–3 פסקאות קצרות, מופרדות בשורה ריקה", "cta": "טקסט כפתור עד 22 תווים", "path": "אחד מ: /market /news /journal /"}`;

export function buildHookUserMessage(facts) {
  const line = (f) => `${f.coin} ${f.change > 0 ? '+' : ''}${f.change}% (מחיר ${f.price})`;
  const parts = [];
  if (facts.btc) parts.push(`ביטקוין: ${line(facts.btc)}`);
  if (facts.eth) parts.push(`את'ריום: ${line(facts.eth)}`);
  if (facts.gainers.length) parts.push(`העולים הגדולים ב-24 שעות: ${facts.gainers.map(line).join(', ')}`);
  if (facts.losers.length) parts.push(`היורדים הגדולים: ${facts.losers.map(line).join(', ')}`);
  if (facts.headlines.length) parts.push(`כותרות חמות:\n- ${facts.headlines.join('\n- ')}`);
  return parts.join('\n');
}

const PATHS = ['/market', '/news', '/journal', '/'];

// Model output → clean copy, or null when it's unusable or mentions a
// percentage that isn't in the facts (the model invented a number).
export function validateHook(raw, facts) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title || '').trim().slice(0, 80);
  const push = String(raw.push || '').trim().slice(0, 180);
  const email = String(raw.email || '').trim().slice(0, 1500);
  if (!title || !push || !email) return null;
  const allowed = factPercents(facts);
  const mentioned = [...`${title} ${push} ${email}`.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => parseFloat(m[1]));
  if (mentioned.some((n) => !allowed.some((a) => Math.abs(a - n) <= 0.15))) return null;
  return {
    title,
    push,
    email,
    cta: String(raw.cta || 'לפתוח את TradeOS').trim().slice(0, 30),
    path: PATHS.includes(raw.path) ? raw.path : '/market',
  };
}

// No model, or the model failed validation: still a real, specific hook,
// built straight from the facts.
export function templateHook(facts) {
  const movers = [facts.btc && { ...facts.btc, name: 'ביטקוין' }, ...facts.gainers, ...facts.losers]
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const top = movers[0];
  const sign = (c) => (c > 0 ? '+' : '');
  const name = top ? (top.name || top.coin) : 'השוק';
  const title = top
    ? `${name} ${sign(top.change)}${top.change}% ב-24 שעות ${top.change > 0 ? '🚀' : '📉'}`
    : 'השוק זז — בוא לראות מה קורה 📊';
  const push = top
    ? `${name} ${top.change > 0 ? 'זינק' : 'צנח'} ${Math.abs(top.change)}% היום. בדוק את העסקאות הפתוחות שלך ומה הזיז את השוק.`
    : 'בדוק את העסקאות הפתוחות שלך ומה הזיז את השוק היום.';
  const lines = movers.slice(0, 4).map((m) => `${m.name || m.coin}: ${sign(m.change)}${m.change}%`);
  const email = [
    lines.length ? `מה זז ב-24 השעות האחרונות:\n${lines.join('\n')}` : 'השוק בתנועה.',
    facts.headlines[0] ? `הכותרת החמה: ${facts.headlines[0]}` : '',
    'זה הזמן לבדוק את העסקאות הפתוחות, לתעד את מה שנסגר ולראות איך התנועה הזו משפיעה על התיק שלך.',
  ].filter(Boolean).join('\n\n');
  return { title, push, email, cta: 'לפתוח את TradeOS', path: '/market' };
}
