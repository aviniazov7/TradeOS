// Pull the latest "90 day" altcoin-season number out of the Blockchain Center
// page. The browser used to ask api.codetabs.com to fetch that page; the Worker
// fetches the fixed host itself and returns only the integer.

export function parseAltcoinSeasonIndex(html) {
  const text = String(html || '');
  const markers = [
    { needle: '\\"90\\":{', end: '},\\"' },
    { needle: '"90":{', end: '},"' },
  ];
  let section = '';
  for (const { needle, end } of markers) {
    const at = text.indexOf(needle);
    if (at === -1) continue;
    const chunk = text.slice(at, at + 100000);
    const close = chunk.indexOf(end);
    section = close > 0 ? chunk.slice(0, close) : chunk;
    break;
  }
  if (!section) return null;
  const dates = [...section.matchAll(/\\?"(\d{4}-\d{2}-\d{2})\\?"\s*:\s*\\?"(\d+)\\?"/g)];
  if (!dates.length) return null;
  const last = parseInt(dates[dates.length - 1][2], 10);
  if (!Number.isInteger(last) || last < 0 || last > 100) return null;
  return last;
}
