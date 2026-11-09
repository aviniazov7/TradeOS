const inputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors text-right';
const timeClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors text-left';
const labelClass = 'block text-xs text-text-muted mb-1';

const NUMBER_RULES = [
  {
    key: 'weeklyLoss',
    field: 'amount',
    title: 'הפסד שבועי מקסימלי ($)',
    placeholder: '500',
    testId: 'journal-risk-weekly-loss',
  },
  {
    key: 'dailyLossPercent',
    field: 'percent',
    title: 'הפסד יומי מקסימלי (% מיתרת הפתיחה)',
    placeholder: '3',
    testId: 'journal-risk-daily-percent',
  },
  {
    key: 'weeklyLossPercent',
    field: 'percent',
    title: 'הפסד שבועי מקסימלי (% מיתרת הפתיחה)',
    placeholder: '5',
    testId: 'journal-risk-weekly-percent',
  },
  {
    key: 'maxTradesPerDay',
    field: 'count',
    title: 'מקסימום עסקאות סגורות ביום',
    placeholder: '3',
    testId: 'journal-risk-max-trades',
    step: '1',
  },
];

function RuleSwitch({ title, checked, testId, onChange, children }) {
  return (
    <div className="space-y-2">
      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <span className="text-xs font-semibold text-text-primary">{title}</span>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          data-testid={`${testId}-on`}
          className="accent-accent-primary"
        />
      </label>
      {children}
    </div>
  );
}

export default function JournalRiskRulesFields({ value, onChange }) {
  const setRule = (key, patch) => onChange({ ...value, [key]: { ...value[key], ...patch } });

  return (
    <div data-testid="journal-risk-rules" className="rounded-xl border border-border-primary p-3 space-y-3">
      <div>
        <p className="text-xs font-semibold text-text-primary">כללי סיכון</p>
        <p className="text-[11px] text-text-muted">
          כל כלל כבוי עד שמפעילים אותו. ביומן מופיע סטטוס לקריאה בלבד, בלי חסימה של רישום ובלי באנר.
          התראת ההפסד היומי בדולרים נשארת למעלה.
        </p>
      </div>
      {NUMBER_RULES.map((rule) => (
        <RuleSwitch
          key={rule.key}
          title={rule.title}
          checked={value[rule.key].enabled}
          testId={rule.testId}
          onChange={(enabled) => setRule(rule.key, { enabled })}
        >
          {value[rule.key].enabled && (
            <input
              type="number"
              min="0"
              step={rule.step || 'any'}
              inputMode="decimal"
              value={value[rule.key][rule.field]}
              placeholder={rule.placeholder}
              aria-label={rule.title}
              data-testid={rule.testId}
              onChange={(e) => setRule(rule.key, { [rule.field]: e.target.value })}
              className={inputClass}
            />
          )}
        </RuleSwitch>
      ))}
      <RuleSwitch
        title="שעות מסחר (שעון ישראל)"
        checked={value.tradingHours.enabled}
        testId="journal-risk-hours"
        onChange={(enabled) => setRule('tradingHours', { enabled })}
      >
        {value.tradingHours.enabled && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass} htmlFor="journal-risk-hours-start">מהשעה</label>
              <input
                id="journal-risk-hours-start"
                type="time"
                step="60"
                dir="ltr"
                value={value.tradingHours.start}
                data-testid="journal-risk-hours-start"
                onChange={(e) => setRule('tradingHours', { start: e.target.value })}
                className={timeClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="journal-risk-hours-end">עד השעה</label>
              <input
                id="journal-risk-hours-end"
                type="time"
                step="60"
                dir="ltr"
                value={value.tradingHours.end}
                data-testid="journal-risk-hours-end"
                onChange={(e) => setRule('tradingHours', { end: e.target.value })}
                className={timeClass}
              />
            </div>
          </div>
        )}
        {value.tradingHours.enabled && (
          <p className="text-[11px] text-text-muted">סוף החלון לא כלול. חלון יכול לחצות חצות. השעון הוא שעון ישראל.</p>
        )}
      </RuleSwitch>
    </div>
  );
}
