import { describe, it, expect } from 'vitest';
import { SCHEDULE_DEFAULTS, withScheduleDefaults } from './notifySchedule';

describe('withScheduleDefaults', () => {
  it('fills every section when the Worker returned nothing or an older shape', () => {
    expect(withScheduleDefaults(undefined)).toEqual(SCHEDULE_DEFAULTS);
    // A schedule saved before newsImpact existed (the Worker used to drop it).
    const old = withScheduleDefaults({ journal: { enabled: true, time: '20:00' }, calendar: { enabled: true } });
    expect(old.journal).toEqual({ enabled: true, time: '20:00' });
    expect(old.calendar.enabled).toBe(true);
    expect(old.newsImpact).toEqual({ enabled: false });
    expect(old.summary).toEqual({ enabled: false, time: '22:00' });
  });

  it('does not mutate the shared defaults', () => {
    const s = withScheduleDefaults({});
    s.calendar.enabled = true;
    expect(SCHEDULE_DEFAULTS.calendar.enabled).toBe(false);
  });
});
