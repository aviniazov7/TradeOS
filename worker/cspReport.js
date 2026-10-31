// Content-Security-Policy violation reports, from real browsers, so the policy
// can be tightened from evidence instead of guesses. Pure parsing — index.js
// de-duplicates and logs. Only coarse, non-personal fields are kept: the
// directive, the blocked ORIGIN (never the full URL / query) and the page PATH.

const KEYWORDS = new Set(['inline', 'eval', 'self', 'data', 'blob', 'wasm-eval', 'trusted-types-policy', 'trusted-types-sink']);
const DIRECTIVE_RE = /^[a-z][a-z-]{1,30}$/;
export const MAX_REPORT_ITEMS = 10;

function directiveOf(v) {
  const d = String(v || '').trim().split(/\s+/)[0].toLowerCase();
  return DIRECTIVE_RE.test(d) ? d : null;
}

function blockedOf(v) {
  const s = String(v ?? '').trim();
  if (!s) return 'unknown';
  if (KEYWORDS.has(s)) return s;
  try { return new URL(s).origin; } catch { return 'unknown'; }
}

function pageOf(v) {
  try { return new URL(String(v)).pathname.slice(0, 80) || '/'; } catch { return 'unknown'; }
}

/**
 * Normalises both report formats:
 *   legacy (report-uri):      { "csp-report": { "document-uri", "effective-directive" | "violated-directive", "blocked-uri", "disposition" } }
 *   Reporting API (report-to): [ { type: "csp-violation", body: { documentURL, effectiveDirective, blockedURL, disposition } } ]
 * Returns at most MAX_REPORT_ITEMS { directive, blocked, page, disposition }.
 */
export function parseCspReports(payload) {
  const raw = [];
  if (Array.isArray(payload)) {
    for (const r of payload) {
      if (r?.type !== 'csp-violation' || !r.body) continue;
      raw.push({ d: r.body.effectiveDirective || r.body.violatedDirective, b: r.body.blockedURL, p: r.body.documentURL, x: r.body.disposition });
    }
  } else if (payload && typeof payload === 'object' && payload['csp-report']) {
    const r = payload['csp-report'];
    raw.push({ d: r['effective-directive'] || r['violated-directive'], b: r['blocked-uri'], p: r['document-uri'], x: r.disposition });
  }
  const out = [];
  for (const r of raw) {
    const directive = directiveOf(r.d);
    if (!directive) continue;
    out.push({ directive, blocked: blockedOf(r.b), page: pageOf(r.p), disposition: r.x === 'enforce' ? 'enforce' : 'report' });
    if (out.length >= MAX_REPORT_ITEMS) break;
  }
  return out;
}

/** Same violation → same key, so a report is logged once per hour, not per page view. */
export const cspReportKey = (r) => `${r.directive}|${r.blocked}|${r.page}`;

// Browsers send one of these. Anything else is ignored so a random POST cannot
// fill the log. The body itself is never logged: it can carry the full page URL.
const CSP_REPORT_TYPES = new Set(['application/csp-report', 'application/reports+json']);

export function cspReportCorsHeaders() {
  // Public collector, no cookies. `*` is what Chrome's Reporting API accepts on
  // the preflight (alongside the page origin). A reflected allow-list misses
  // `Origin: null`, and Chrome then never sends the POST.
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function reportContentType(request) {
  return (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
}

/**
 * POST /csp-report. Always answers 204 with CORS headers.
 * A recognised report is logged once per hour (`CSP report …`) unless the
 * cache says it was already logged. A cache failure still logs: the empty
 * catch used to swallow the only line Workers Logs can search for.
 * A recognised content type that does not parse logs `CSP report unparsed`
 * (type and size only, never the body).
 */
export async function handleCspReport(request, { cache = null, log = console.warn } = {}) {
  const headers = cspReportCorsHeaders();
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return new Response(null, { status: 405, headers });

  const contentType = reportContentType(request);
  let raw = '';
  let items = [];
  try {
    raw = (await request.text()).slice(0, 8192);
    items = parseCspReports(raw ? JSON.parse(raw) : null);
  } catch {
    items = [];
  }

  if (!items.length && CSP_REPORT_TYPES.has(contentType)) {
    log(`CSP report unparsed ${JSON.stringify({ contentType, bytes: raw.length })}`);
  }

  for (const it of items) {
    const key = new Request(`https://cache.tradeos.internal/csp/${encodeURIComponent(cspReportKey(it))}`);
    let seen = false;
    if (cache) {
      try { seen = !!(await cache.match(key)); } catch { seen = false; }
    }
    if (seen) continue;
    // One string, so the Workers Logs message field contains "CSP report".
    log(`CSP report ${JSON.stringify(it)}`);
    if (!cache) continue;
    try {
      await cache.put(key, new Response('1', { headers: { 'Cache-Control': 'max-age=3600' } }));
    } catch { /* already logged */ }
  }

  return new Response(null, { status: 204, headers });
}
