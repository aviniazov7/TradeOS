import { PLAN_QUESTIONS, activeQuestionIds } from './planBuilderQuestions';
import { PLAN_PAIR_LIMIT, planPairFromName } from './planSymbols';

const BY_ID = new Map(PLAN_QUESTIONS.map((question) => [question.id, question]));

export function visiblePlanQuestions(answers) {
  return activeQuestionIds(answers || {}).map((id) => BY_ID.get(id)).filter(Boolean);
}

export function planBuilderAnswerList(answers) {
  return visiblePlanQuestions(answers).flatMap((question) => {
    const value = answers[question.id];
    if (value === undefined || value === '') return [];
    return [{ id: question.id, value }];
  });
}

export function planQuestionError(question, value) {
  if (!question) return 'השאלה אינה זמינה';
  if (question.type === 'choice') {
    const ok = question.options?.some((option) => option.id === value);
    return ok ? '' : 'בחרו אפשרות אחת';
  }
  if (question.type === 'symbols') {
    if (!Array.isArray(value) || value.length === 0) return 'בחרו לפחות מטבע אחד';
    if (value.length > PLAN_PAIR_LIMIT) return `עד ${PLAN_PAIR_LIMIT} מטבעות`;
    const canonical = value.map((item) => planPairFromName(item));
    if (canonical.some((pair) => !pair) || new Set(canonical).size !== canonical.length) {
      return 'הבחירה אינה תקינה';
    }
    return '';
  }
  if (question.type === 'multi') {
    if (!Array.isArray(value) || value.length === 0) return 'בחרו לפחות אפשרות אחת';
    const allowed = new Set((question.options || []).map((option) => option.id));
    if (value.some((item) => !allowed.has(item)) || new Set(value).size !== value.length) {
      return 'הבחירה אינה תקינה';
    }
    return '';
  }
  if (question.type === 'text') {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) return 'השלימו את התשובה';
    if (text.length > question.maxLength) return `עד ${question.maxLength} תווים`;
    return '';
  }
  if (question.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'הזינו מספר';
    if (question.integer && !Number.isInteger(value)) return 'הזינו מספר שלם';
    if (value < question.min || value > question.max) return `בין ${question.min} ל-${question.max}`;
    return '';
  }
  return 'התשובה אינה תקינה';
}
