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
