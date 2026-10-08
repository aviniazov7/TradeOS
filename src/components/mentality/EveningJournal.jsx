import { useCallback } from 'react';
import { Moon, Target } from 'lucide-react';
import JournalPage from './journal/JournalPage';
import {
  OptionGroup, RatingScale, Field, JournalSection, Disclosure, ContextNote,
} from './journal/JournalControls';
import { FactGrid, Answer, SummaryStack } from './journal/JournalSummary';
import { EMOTION_OPTIONS, emotionLabel, inputCls } from './journal/journalUi';
import { useMentalityJournals } from '../../hooks/useMentalityJournals';
import {
  emptyEveningForm, eveningFormFromEntry, eveningPayload, EVENING_REQUIRED,
  ADHERENCE_OPTIONS, MAX_EVENING_EMOTIONS,
} from '../../utils/mentalityJournalForm';

// Evening journal — four short steps on one page:
//   1 איך היה היום       rating 1–10 + up to two emotions
//   2 תוכנית            followed the plan? yes / partly / no + why
//   3 מה עבד / מה לשפר   two short notes
//   4 לקח אחד למחר       one lesson (+ optional gratitude)
// Saved → a completed summary with "ערוך" (see JournalPage).

const LABELS = { done: 'יומן הערב הושלם', save: 'שמור יומן ערב', saved: 'יומן הערב נשמר', updated: 'יומן הערב עודכן' };
const REQUIRED_SECTION = { dayRating: 'e-day', emotionsAfter: 'e-day', planAdherence: 'e-plan', lessonsLearned: 'e-lesson' };
const NEXT_STEP = { to: '/mentality', title: 'לאזור המנטלי', text: 'הסטרייק, מצב הרוח השבועי והתובנות' };

const ADHERENCE_SUMMARY = { yes: 'עקבתי', partial: 'חלקית', no: 'סטיתי' };

const NOTE_PROMPT = {
  yes: 'מה עזר לי להישאר בתוכנית?',
  partial: 'איפה סטיתי, ולמה?',
  no: 'מה גרם לי לסטות?',
};

function EveningSummary({ entry }) {
  const form = eveningFormFromEntry(entry);
  return (
    <SummaryStack>
      <Answer label="הלקח שלי למחר" text={entry.lessonsLearned} primary />
      <FactGrid
        facts={[
          { label: 'דירוג היום', value: entry.dayRating ? `${entry.dayRating}/10` : '' },
          { label: 'רגש', value: form.emotionsAfter.map(emotionLabel).filter(Boolean).join(' · ') },
          { label: 'תוכנית', value: ADHERENCE_SUMMARY[form.planAdherence] || '' },
        ]}
      />
      <Answer label={NOTE_PROMPT[form.planAdherence] || 'הערה על התוכנית'} text={entry.planNote} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Answer label="מה עבד" text={entry.whatWentWell} />
        <Answer label="מה לשפר" text={entry.whatDidntGoWell} />
      </div>
      <Answer label="אסיר תודה על" text={entry.gratitude} />
    </SummaryStack>
  );
}

export default function EveningJournal() {
  const {
    todayEvening, todayMorning, eveningEntries, loading, saveEveningEntry, deleteEveningEntry,
  } = useMentalityJournals();
  const morningIntention = todayMorning?.mainGoal?.trim() || '';

  const toPayload = useCallback((form, date) => eveningPayload(form, { date }), []);

  const renderForm = ({ form, update }) => (
    <>
      <JournalSection id="e-day" n={1} title="איך היה היום" subtitle="דירוג כללי ומה הרגשתי בסוף" done={form.dayRating != null && form.emotionsAfter.length > 0}>
        <Field label="דירוג היום" required>
          {({ labelId }) => (
            <RatingScale value={form.dayRating} onChange={(v) => update('dayRating', v)} lowLabel="יום קשה" highLabel="יום מצוין" ariaLabelledBy={labelId} />
          )}
        </Field>
        <Field label="איך אני מרגיש עכשיו?" required hint={`אפשר לבחור עד ${MAX_EVENING_EMOTIONS}`}>
          {({ labelId }) => (
            <OptionGroup type="multi" max={MAX_EVENING_EMOTIONS} options={EMOTION_OPTIONS} value={form.emotionsAfter} onChange={(v) => update('emotionsAfter', v)} ariaLabelledBy={labelId} />
          )}
        </Field>
      </JournalSection>

      <JournalSection id="e-plan" n={2} title="תוכנית" subtitle="האם עמדתי במה שתכננתי" done={!!form.planAdherence}>
        <ContextNote icon={Target} label="הכוונה שלך הבוקר" text={morningIntention} />
        <Field label="עקבתי אחרי תוכנית המסחר?" required>
          {({ labelId }) => (
            <OptionGroup variant="segmented" options={ADHERENCE_OPTIONS} value={form.planAdherence} onChange={(v) => update('planAdherence', v)} ariaLabelledBy={labelId} />
          )}
        </Field>
        {form.planAdherence && (
          <Field label={NOTE_PROMPT[form.planAdherence]} optional>
            {({ id }) => (
              <input id={id} type="text" maxLength={200} value={form.planNote} onChange={(e) => update('planNote', e.target.value)} placeholder={form.planAdherence === 'yes' ? 'לדוגמה: חיכיתי לאישור לפני כל כניסה' : 'לדוגמה: נכנסתי בלי אישור אחרי הפסד'} className={inputCls} />
            )}
          </Field>
        )}
      </JournalSection>

      <JournalSection id="e-review" n={3} title="מה עבד / מה לשפר" subtitle="משפט או שניים, לא יותר" optional>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="מה עבד היום">
            {({ id }) => (
              <textarea id={id} rows={3} maxLength={500} value={form.whatWentWell} onChange={(e) => update('whatWentWell', e.target.value)} placeholder="לדוגמה: חיכיתי בסבלנות לסטאפ, יצאתי לפי התוכנית" className={`${inputCls} resize-none`} />
            )}
          </Field>
          <Field label="מה לשפר">
            {({ id }) => (
              <textarea id={id} rows={3} maxLength={500} value={form.whatDidntGoWell} onChange={(e) => update('whatDidntGoWell', e.target.value)} placeholder="לדוגמה: הזזתי סטופ, נכנסתי מוקדם מדי" className={`${inputCls} resize-none`} />
            )}
          </Field>
        </div>
      </JournalSection>

      <JournalSection id="e-lesson" n={4} title="לקח אחד למחר" subtitle="הוא יחכה לך ביומן הבוקר" done={!!form.lessonsLearned.trim()}>
        <Field label="הלקח שלי למחר" required>
          {({ id }) => (
            <input id={id} type="text" maxLength={200} value={form.lessonsLearned} onChange={(e) => update('lessonsLearned', e.target.value)} placeholder="לדוגמה: אחרי שני הפסדים אני סוגר את המסך" className={inputCls} />
          )}
        </Field>
        <Disclosure title="הכרת תודה (רשות)" defaultOpen={!!form.gratitude.trim()}>
          <Field label="על מה אני אסיר תודה היום">
            {({ id }) => (
              <textarea id={id} rows={2} maxLength={500} value={form.gratitude} onChange={(e) => update('gratitude', e.target.value)} placeholder="דבר אחד קטן מספיק" className={`${inputCls} resize-none`} />
            )}
          </Field>
        </Disclosure>
      </JournalSection>
    </>
  );

  return (
    <JournalPage
      kind="evening"
      icon={Moon}
      title="יומן ערב"
      labels={LABELS}
      entries={eveningEntries}
      todayEntry={todayEvening}
      loading={loading}
      onSave={saveEveningEntry}
      onDelete={deleteEveningEntry}
      emptyForm={emptyEveningForm}
      fromEntry={eveningFormFromEntry}
      toPayload={toPayload}
      required={EVENING_REQUIRED}
      requiredSection={REQUIRED_SECTION}
      renderForm={renderForm}
      renderSummary={(entry) => <EveningSummary entry={entry} />}
      nextStep={NEXT_STEP}
    />
  );
}
