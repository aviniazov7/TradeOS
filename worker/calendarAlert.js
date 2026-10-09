// The "high-impact USD event in about an hour" push. Pure (no KV / network) so
// the wording is unit-tested; index.js decides WHEN to send and to whom.
//
// Event names come from the same Hebrew dictionary the calendar page uses
// (src/utils/econCalendarTerms.js, a dependency-free module), falling back to
// the English title when an event isn't in it.
import { hebrewEventTitle } from '../src/utils/econCalendarTerms.js';

export const CALENDAR_ALERT_TITLE = '📅 אירוע כלכלי בעוד שעה';
const MAX_NAMED = 3; // a push body is read in a glance — cap how many events it spells out

/** HH:MM in Israel time for an ISO timestamp. */
export function israelTime(dateIso) {
  return new Date(dateIso).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });
}

const hebName = (title) => hebrewEventTitle(title) || title;

function detail(e) {
  const parts = [];
  if (e.forecast) parts.push(`תחזית: ${e.forecast}`);
  if (e.previous) parts.push(`קודם: ${e.previous}`);
  return parts.join(' | ');
}

/**
 * Body for one time slot. `events` are the high-impact USD events that start at
 * the same minute (e.g. "FOMC Statement" + "Federal Funds Rate"), which collapse
 * into a single push.
 */
export function calendarAlertBody(events, dateIso) {
  const time = israelTime(dateIso);
  const byTitle = new Map();
  for (const e of events) if (e?.title && !byTitle.has(e.title)) byTitle.set(e.title, e);
  const named = [...byTitle.values()].map((e) => ({ name: hebName(e.title), detail: detail(e) }));

  if (named.length === 1) {
    const [e] = named;
    return `${e.name} (USD) · ${time} שעון ישראל${e.detail ? ` · ${e.detail}` : ''} · צפי לתנודתיות ⚠️`;
  }
  const shown = named.slice(0, MAX_NAMED).map((e) => (e.detail ? `${e.name} (${e.detail})` : e.name));
  const more = named.length > MAX_NAMED ? ` ועוד ${named.length - MAX_NAMED}` : '';
  return `${shown.join(' + ')}${more} (USD) · ${time} שעון ישראל · צפי לתנודתיות ⚠️`;
}
