// Defaults for the scheduled pushes (journal reminder, daily summary, the
// economic-calendar alert, news-impact). Mirrors the Worker's DEFAULT_SETTINGS;
// shared by the profile's notification settings and the news page's calendar
// switch so the two always agree.
export const SCHEDULE_DEFAULTS = {
  journal: { enabled: false, time: '21:00' },
  summary: { enabled: false, time: '22:00' },
  calendar: { enabled: false },
  newsImpact: { enabled: false },
};

/** A schedule from the Worker with every missing section filled in. */
export function withScheduleDefaults(s) {
  return {
    journal: { ...SCHEDULE_DEFAULTS.journal, ...(s?.journal || {}) },
    summary: { ...SCHEDULE_DEFAULTS.summary, ...(s?.summary || {}) },
    calendar: { ...SCHEDULE_DEFAULTS.calendar, ...(s?.calendar || {}) },
    newsImpact: { ...SCHEDULE_DEFAULTS.newsImpact, ...(s?.newsImpact || {}) },
  };
}
