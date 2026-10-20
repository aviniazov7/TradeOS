import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isPrivateWorkerRequest } from './workerCachePolicy';

const sw = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');

function swPredicate() {
  const start = sw.indexOf('function isPrivateWorkerRequest');
  const end = sw.indexOf('// END isPrivateWorkerRequest');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return new Function(`${sw.slice(start, end)}\nreturn isPrivateWorkerRequest;`)();
}

describe('worker cache policy', () => {
  const cases = [
    ['https://trade-os.tradeos.workers.dev/exchange/open-orders?exchange=bybit', false, true],
    ['https://trade-os.tradeos.workers.dev/hl/trades?address=0xabc', false, true],
    ['https://trade-os.tradeos.workers.dev/hl/positions?address=0xabc', false, true],
    ['https://trade-os.tradeos.workers.dev/exchange/credentials/status', true, true],
    ['https://trade-os.tradeos.workers.dev/notify-settings', false, true],
    ['https://trade-os.tradeos.workers.dev/cg/simple/price?ids=bitcoin', false, false],
    ['https://trade-os.tradeos.workers.dev/cx/quotes?symbols=BTC', false, false],
    ['https://tradeoslive.web.app/assets/index.js', true, false],
  ];

  it('flags authenticated and per-user Worker GETs, not public market data', () => {
    for (const [url, auth, expected] of cases) {
      expect(isPrivateWorkerRequest(url, auth)).toBe(expected);
    }
  });

  it('keeps the service worker copy in step, and skips caching those requests', () => {
    const fromSw = swPredicate();
    for (const [url, auth, expected] of cases) {
      const request = { url, headers: { has: (name) => auth && name === 'Authorization' } };
      expect(fromSw(request)).toBe(expected);
    }
    expect(sw).toContain('if (isPrivateWorkerRequest(event.request)) return;');
  });
});
