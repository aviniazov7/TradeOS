import { describe, it, expect } from 'vitest';
import { calendarAlertBody, israelTime, CALENDAR_ALERT_TITLE } from './calendarAlert';

// 2026-10-14 12:30 UTC = 15:30 in Israel (IDT, UTC+3).
const WHEN = '2026-10-14T12:30:00.000Z';

describe('israelTime', () => {
  it('shows the time in Israel, not UTC', () => {
    expect(israelTime(WHEN)).toMatch(/15:30/);
    // Winter: 12:30 UTC = 14:30 in Israel (IST, UTC+2).
    expect(israelTime('2026-12-14T12:30:00.000Z')).toMatch(/14:30/);
  });
});

describe('calendarAlertBody', () => {
  it('names the event in Hebrew with time, forecast, previous and a volatility warning', () => {
    const body = calendarAlertBody([{ title: 'Core CPI m/m', forecast: '0.3%', previous: '0.2%' }], WHEN);
    expect(body).toContain('מדד המחירים לצרכן הליבה (חודשי)');
    expect(body).toContain('(USD)');
    expect(body).toContain('15:30 שעון ישראל');
    expect(body).toContain('תחזית: 0.3%');
    expect(body).toContain('קודם: 0.2%');
    expect(body).toContain('צפי לתנודתיות ⚠️');
  });

  it('falls back to the English title for an event the dictionary lacks', () => {
    expect(calendarAlertBody([{ title: 'Some Brand New Release' }], WHEN)).toContain('Some Brand New Release (USD)');
  });

  it('leaves out forecast / previous that the source does not have', () => {
    const body = calendarAlertBody([{ title: 'Core CPI m/m', forecast: '', previous: '0.2%' }], WHEN);
    expect(body).not.toContain('תחזית');
    expect(body).toContain('קודם: 0.2%');
    expect(calendarAlertBody([{ title: 'Core CPI m/m' }], WHEN)).not.toMatch(/תחזית|קודם/);
  });

  it('merges simultaneous events into one message, de-duplicated', () => {
    const body = calendarAlertBody([
      { title: 'FOMC Statement' },
      { title: 'Federal Funds Rate', forecast: '4.50%', previous: '4.75%' },
      { title: 'FOMC Statement' },
    ], WHEN);
    expect(body.match(/ \+ /g)).toHaveLength(1);
    expect(body).toContain('תחזית: 4.50%');
    expect(body).toContain('צפי לתנודתיות ⚠️');
    expect(body.split('15:30')).toHaveLength(2); // the time appears once
  });

  it('caps how many events it spells out', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ title: `Event ${i}` }));
    expect(calendarAlertBody(many, WHEN)).toContain('ועוד 2');
  });

  it('has a Hebrew title', () => {
    expect(CALENDAR_ALERT_TITLE).toBe('📅 אירוע כלכלי בעוד שעה');
  });
});
