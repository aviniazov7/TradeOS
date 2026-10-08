import { useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Sunrise, Lightbulb } from 'lucide-react';
import JournalPage from './journal/JournalPage';
import {
  OptionGroup, RatingScale, Field, JournalSection, Disclosure, ContextNote,
} from './journal/JournalControls';
import { FactGrid, Answer, SummaryStack, RulesChecklist } from './journal/JournalSummary';
import { EMOTION_OPTIONS, emotionLabel, inputCls, focusCls } from './journal/journalUi';
import { useMentalityJournals } from '../../hooks/useMentalityJournals';
import { useTradingPlans } from '../../hooks/useTradingPlans';
import { pickActivePlan } from '../../utils/pickActivePlan';
import { PRE_MARKET_CHECKLIST } from '../../utils/constants';
import {
  emptyMorningForm, morningFormFromEntry, morningPayload, MORNING_REQUIRED, rulesFromPlan, findYesterdayEntry,
  SLEEP_OPTIONS, BIAS_OPTIONS, labelOf,
} from '../../utils/mentalityJournalForm';

// Morning journal — four short steps on one page:
//   1 מצב          how I feel, readiness 1–10, sleep
//   2 שוק ותוכנית   bias, key levels, what I'll trade, goals
//   3 שגרה וכללים   pre-market routine + the active plan's rules
//   4 כוונה ליום    one intention (+ optional reminder / gratitude)
// Saved → a completed summary with "ערוך" (see JournalPage).

const ROUTINE_OPTIONS = PRE_MARKET_CHECKLIST.map((c) => ({ value: c.key, label: c.label }));
const LABELS = { done: 'יומן הבוקר הושלם', save: 'שמור יומן בוקר', saved: 'יומן הבוקר נשמר', updated: 'יומן הבוקר עודכן' };
const REQUIRED_SECTION = { emotion: 'm-state', readinessLevel: 'm-state', mainGoal: 'm-intent' };
const NEXT_STEP = { to: '/mentality/evening', title: 'יומן ערב', text: 'נפתח ב-19:00 לסיכום יום המסחר' };

const routineLabel = (key) => PRE_MARKET_CHECKLIST.find((c) => c.key === key)?.label || key;

function MorningSummary({ entry }) {
  const routine = Array.isArray(entry.preMarketChecklist) ? entry.preMarketChecklist : [];
  const rulesChecked = Array.isArray(entry.rulesChecked) ? entry.rulesChecked : [];
  const appreciate = (entry.thingsIAppreciate || []).filter((t) => t && t.trim());
  return (
    <SummaryStack>
      <Answer label="הכוונה שלי להיום" text={entry.mainGoal} primary />
      <FactGrid
        facts={[
          { label: 'מצב רגשי', value: emotionLabel(entry.emotion) },
          { label: 'מוכנות', value: entry.readinessLevel ? `${entry.readinessLevel}/10` : '' },
          { label: 'שינה', value: labelOf(SLEEP_OPTIONS, entry.sleepQuality) },
          { label: 'הטיית שוק', value: labelOf(BIAS_OPTIONS, entry.marketBias) },
          { label: 'שגרת בוקר', value: `${routine.length}/${PRE_MARKET_CHECKLIST.length}` },
          { label: 'כללים', value: entry.rulesTotal ? `${rulesChecked.length}/${entry.rulesTotal}` : '' },
        ]}
      />
      <Answer label="מה אני סוחר היום" text={entry.focusToday} />
      <Answer label="רמות מפתח" text={entry.keyLevels} />
      <Answer label="יעדים להיום" text={entry.dailyGoals} />
      {routine.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-text-muted mb-1.5">שגרה שביצעתי</p>
          <ul className="flex flex-wrap gap-1.5">
            {routine.map((k) => (
              <li key={k} className="rounded-lg bg-bg-tertiary border border-border-primary px-2 py-1 text-xs text-text-secondary">{routineLabel(k)}</li>
            ))}
          </ul>
        </div>
      )}
      <Answer label="תזכורת לעצמי" text={entry.motivation} />
      {appreciate.length > 0 && <Answer label="מה אני מעריך" text={appreciate.join(' · ')} />}
    </SummaryStack>
  );
}

export default function MorningJournal() {
  const {
    todayMorning, morningEntries, eveningEntries, loading, saveMorningEntry, deleteMorningEntry,
  } = useMentalityJournals();
  const { plans } = useTradingPlans();
  const { rules, source, planName } = useMemo(() => rulesFromPlan(pickActivePlan(plans)), [plans]);
  const yesterdayLesson = findYesterdayEntry(eveningEntries)?.lessonsLearned?.trim() || '';

  const toPayload = useCallback((form, date) => morningPayload(form, { date, rules, planName }), [rules, planName]);

  const renderForm = ({ form, update }) => {
    const appreciate = form.thingsIAppreciate;
    const hasExtras = !!form.motivation.trim() || appreciate.some((t) => t.trim());
    return (
      <>
        <JournalSection id="m-state" n={1} title="מצב" subtitle="איפה אני עומד לפני שאני ניגש למסך" done={!!form.emotion && form.readinessLevel != null}>
          <Field label="איך אני מרגיש עכשיו?" required>
            {({ labelId }) => (
              <OptionGroup options={EMOTION_OPTIONS} value={form.emotion} onChange={(v) => update('emotion', v)} ariaLabelledBy={labelId} />
            )}
          </Field>
          <Field label="רמת המוכנות שלי למסחר" required>
            {({ labelId }) => (
              <RatingScale value={form.readinessLevel} onChange={(v) => update('readinessLevel', v)} lowLabel="לא מוכן" highLabel="מוכן לגמרי" ariaLabelledBy={labelId} />
            )}
          </Field>
          <Field label="איכות השינה" optional>
            {({ labelId }) => (
              <OptionGroup variant="segmented" allowClear options={SLEEP_OPTIONS} value={form.sleepQuality} onChange={(v) => update('sleepQuality', v)} ariaLabelledBy={labelId} />
            )}
          </Field>
        </JournalSection>

        <JournalSection id="m-market" n={2} title="שוק ותוכנית" subtitle="מה אני רואה ומה אני מתכנן לסחור" optional>
          <Field label="הטיית שוק">
            {({ labelId }) => (
              <OptionGroup variant="segmented" allowClear options={BIAS_OPTIONS} value={form.marketBias} onChange={(v) => update('marketBias', v)} ariaLabelledBy={labelId} />
            )}
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="מה אני סוחר היום">
              {({ id }) => (
                <input id={id} type="text" maxLength={200} value={form.focusToday} onChange={(e) => update('focusToday', e.target.value)} placeholder="לדוגמה: BTC ו-ETH, רק לונגים מאזור ביקוש" className={inputCls} />
              )}
            </Field>
            <Field label="רמות מפתח">
              {({ id }) => (
                <input id={id} type="text" maxLength={200} value={form.keyLevels} onChange={(e) => update('keyLevels', e.target.value)} placeholder="לדוגמה: 61,200 תמיכה · 64,000 התנגדות" className={inputCls} />
              )}
            </Field>
          </div>
          <Field label="יעדים להיום">
            {({ id }) => (
              <textarea id={id} rows={2} maxLength={500} value={form.dailyGoals} onChange={(e) => update('dailyGoals', e.target.value)} placeholder="לדוגמה: עד 3 עסקאות, יציאה ב-1R אם אין המשכיות" className={`${inputCls} resize-none`} />
            )}
          </Field>
        </JournalSection>

        <JournalSection id="m-rules" n={3} title="שגרה וכללים" subtitle="מה כבר עשיתי ולאילו כללים אני מתחייב" optional>
          <Field label="שגרת בוקר שביצעתי">
            {({ labelId }) => (
              <OptionGroup type="multi" options={ROUTINE_OPTIONS} value={form.preMarketChecklist} onChange={(v) => update('preMarketChecklist', v)} ariaLabelledBy={labelId} />
            )}
          </Field>
          <Field
            label={source === 'plan' ? `כללי התוכנית${planName ? `: ${planName}` : ''}` : 'כללי מסחר'}
            hint={source === 'plan' ? null : (
              <>
                כללי ברירת מחדל.{' '}
                <Link to="/plans" className={`text-accent-primary hover:text-accent-hover rounded ${focusCls}`}>הגדר תוכנית מסחר</Link>
                {' '}כדי לראות כאן את הכללים שלך.
              </>
            )}
          >
            {({ labelId }) => (
              <RulesChecklist rules={rules} checked={form.rulesChecked} onChange={(v) => update('rulesChecked', v)} labelledBy={labelId} />
            )}
          </Field>
        </JournalSection>

        <JournalSection id="m-intent" n={4} title="כוונה ליום" subtitle="משפט אחד שילווה אותי עד הסגירה" done={!!form.mainGoal.trim()}>
          <ContextNote icon={Lightbulb} label="הלקח מאתמול" text={yesterdayLesson} />
          <Field label="הכוונה שלי להיום" required>
            {({ id }) => (
              <input id={id} type="text" maxLength={200} value={form.mainGoal} onChange={(e) => update('mainGoal', e.target.value)} placeholder="לדוגמה: נכנס רק לסטאפים שעומדים בכל התנאים, ומכבד את הסטופ" className={inputCls} />
            )}
          </Field>
          <Disclosure title="תזכורת והכרת תודה (רשות)" defaultOpen={hasExtras}>
            <Field label="תזכורת לעצמי">
              {({ id }) => (
                <textarea id={id} rows={2} maxLength={500} value={form.motivation} onChange={(e) => update('motivation', e.target.value)} placeholder="מה חשוב לזכור כשהשוק זז מהר?" className={`${inputCls} resize-none`} />
              )}
            </Field>
            <Field label="שלושה דברים שאני מעריך כסוחר">
              {() => (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <input
                      key={i}
                      type="text"
                      maxLength={140}
                      aria-label={`דבר ${i + 1} שאני מעריך`}
                      value={appreciate[i]}
                      onChange={(e) => update('thingsIAppreciate', appreciate.map((t, j) => (j === i ? e.target.value : t)))}
                      placeholder={['לדוגמה: הסבלנות שלי לחכות לסטאפ', 'לדוגמה: עמדתי בסטופ אתמול', 'לדוגמה: אני לומד כל יום'][i]}
                      className={inputCls}
                    />
                  ))}
                </div>
              )}
            </Field>
          </Disclosure>
        </JournalSection>
      </>
    );
  };

  return (
    <JournalPage
      kind="morning"
      icon={Sunrise}
      title="יומן בוקר"
      labels={LABELS}
      entries={morningEntries}
      todayEntry={todayMorning}
      loading={loading}
      onSave={saveMorningEntry}
      onDelete={deleteMorningEntry}
      emptyForm={emptyMorningForm}
      fromEntry={morningFormFromEntry}
      toPayload={toPayload}
      required={MORNING_REQUIRED}
      requiredSection={REQUIRED_SECTION}
      renderForm={renderForm}
      renderSummary={(entry) => <MorningSummary entry={entry} />}
      nextStep={NEXT_STEP}
    />
  );
}
