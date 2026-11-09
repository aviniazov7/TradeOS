import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import Modal from '../shared/Modal';
import PlanSymbolPicker from './PlanSymbolPicker';
import { demoPlanFromAnswers, planBuilderErrorMessage } from '../../utils/planBuilderDemo';
import { planBuilderAnswerList, planQuestionError, visiblePlanQuestions } from '../../utils/planBuilderFlow';

const choiceClass = (on) => `min-h-11 w-full rounded-xl border px-3 py-2 text-start text-sm font-semibold transition-colors cursor-pointer ${on
  ? 'border-accent-primary/50 bg-accent-primary/15 text-text-primary'
  : 'border-border-primary bg-bg-tertiary text-text-secondary hover:border-border-hover'}`;

function QuestionField({ question, value, onChange }) {
  if (question.type === 'symbols') {
    return <PlanSymbolPicker value={value} onChange={onChange} />;
  }
  if (question.type === 'choice' || question.type === 'multi') {
    const selected = question.type === 'multi' ? (Array.isArray(value) ? value : []) : value;
    return (
      <div className="flex flex-col gap-2">
        {question.options.map((option) => {
          const on = question.type === 'multi' ? selected.includes(option.id) : selected === option.id;
          return (
            <button
              key={option.id}
              type="button"
              data-option={option.id}
              aria-pressed={on}
              className={choiceClass(on)}
              onClick={() => {
                if (question.type === 'choice') onChange(option.id);
                else onChange(on ? selected.filter((id) => id !== option.id) : [...selected, option.id]);
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  }
  if (question.type === 'number') {
    return (
      <input
        data-question-input={question.id}
        inputMode={question.integer ? 'numeric' : 'decimal'}
        dir="ltr"
        className="min-h-11 w-full rounded-xl border border-border-primary bg-bg-tertiary px-3 text-sm text-text-primary outline-none focus:border-accent-primary"
        value={typeof value === 'number' ? String(value) : ''}
        onChange={(event) => {
          const raw = event.target.value.trim();
          if (!raw) { onChange(undefined); return; }
          const parsed = question.integer ? Number.parseInt(raw, 10) : Number(raw);
          onChange(Number.isNaN(parsed) ? undefined : parsed);
        }}
      />
    );
  }
  return (
    <textarea
      data-question-input={question.id}
      rows={4}
      maxLength={question.maxLength}
      className="w-full resize-y rounded-xl border border-border-primary bg-bg-tertiary px-3 py-2 text-sm leading-relaxed text-text-primary outline-none focus:border-accent-primary"
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export default function PlanBuilderWizard({ open, demo = false, onClose, onDraft, requestPlan }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [fieldError, setFieldError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const questions = visiblePlanQuestions(answers);
  const index = Math.min(step, Math.max(questions.length - 1, 0));
  const question = questions[index];
  const last = index === questions.length - 1;
  const progress = questions.length ? (index + 1) / questions.length : 0;

  const setValue = (value) => {
    setAnswers((current) => ({ ...current, [question.id]: value }));
    setFieldError('');
  };

  const skip = () => {
    setAnswers((current) => {
      const next = { ...current };
      delete next[question.id];
      return next;
    });
    setStep(index + 1);
    setFieldError('');
    setError('');
  };

  const submit = async () => {
    const problem = planQuestionError(question, answers[question.id]);
    if (problem) { setFieldError(problem); return; }
    if (!last) { setStep(index + 1); setError(''); return; }
    setLoading(true);
    setError('');
    try {
      const list = planBuilderAnswerList(answers);
      const plan = demo ? demoPlanFromAnswers(answers) : await requestPlan(list);
      onDraft(plan);
    } catch (err) {
      setError(err?.status != null ? planBuilderErrorMessage(err.status, err.body) : (err?.message || planBuilderErrorMessage(502)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={loading ? () => {} : onClose} title="בנה תוכנית עם AI" maxWidth="max-w-lg" ariaLabel="בנה תוכנית עם AI">
      <div data-testid="plan-builder-wizard" data-question={question?.id || ''} className="flex flex-col gap-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-text-secondary">
            <span>שאלה <span className="num-mono text-text-primary">{index + 1}</span> מתוך <span className="num-mono text-text-primary">{questions.length}</span></span>
            <Sparkles className="h-3.5 w-3.5 text-accent-hover" aria-hidden />
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-bg-tertiary" aria-hidden>
            <div className="h-full rounded-full bg-accent-primary transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
        {question && (
          <section className="rounded-2xl border border-border-primary bg-bg-secondary p-4">
            <h3 className="text-[17px] font-bold leading-snug text-text-primary">{question.text}</h3>
            {question.optional && <p className="mt-1 text-xs text-text-muted">אפשר לדלג. הטיוטה תציע ניסוח.</p>}
            <div className="mt-3">
              <QuestionField question={question} value={answers[question.id]} onChange={setValue} />
            </div>
            {fieldError && <p className="mt-2 text-sm text-loss" role="alert">{fieldError}</p>}
          </section>
        )}
        {error && <p className="text-sm text-loss" role="alert">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            className="min-h-11 flex-1 rounded-xl border border-border-primary bg-bg-tertiary text-sm font-bold text-text-primary cursor-pointer disabled:opacity-50"
            disabled={loading || index === 0}
            onClick={() => { setStep(index - 1); setFieldError(''); setError(''); }}
          >
            חזרה
          </button>
          {question?.optional && (
            <button
              type="button"
              className="min-h-11 flex-1 rounded-xl border border-border-primary bg-bg-tertiary text-sm font-bold text-text-secondary cursor-pointer disabled:opacity-50"
              disabled={loading}
              onClick={skip}
            >
              דלג
            </button>
          )}
          <button
            type="button"
            className="min-h-11 flex-1 rounded-xl bg-accent-muted text-sm font-bold text-white cursor-pointer hover:bg-accent-primary disabled:opacity-50"
            disabled={loading}
            onClick={submit}
          >
            {loading ? 'בונה את התוכנית...' : last ? 'בנה תוכנית' : 'הבא'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
