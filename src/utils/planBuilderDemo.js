// Demo mode for the plan builder. A production build leaves this off even if
// the query flag is present. Preview builds set VITE_PLAN_BUILDER_DEMO=1.
// The returned plan is synthetic and must never be sent to a server.

import { PLAN_BUILDER_DAILY_LIMIT } from './planBuilderQuestions';

export const PLAN_BUILDER_DEMO_BANNER = 'דמו – נתוני דמה';

export function planBuilderDemoEnabled(search = '', env = import.meta.env) {
  const buildAllows = env?.DEV === true || env?.VITE_PLAN_BUILDER_DEMO === '1';
  if (!buildAllows) return false;
  const raw = String(search || '');
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw.replace(/^\?/, '');
  return new URLSearchParams(query).get('planBuilderDemo') === '1';
}

export function planBuilderErrorMessage(status, body = {}) {
  if (status === 403 || body?.premiumRequired) {
    return 'בניית תוכנית עם AI זמינה למנויי Premium בלבד.';
  }
  if (status === 429 || body?.quotaExceeded) {
    return `הגעת למכסת בניית התוכניות להיום (${PLAN_BUILDER_DAILY_LIMIT}). אפשר לנסות שוב מחר.`;
  }
  if (status === 400) return 'התשובות אינן תקינות. חזרו אחורה ובדקו אותן.';
  if (status === 401) return 'יש להתחבר כדי להשתמש בתכונה זו.';
  if (status === 502 || status === 503 || status === 0) {
    return 'לא הצלחנו לבנות את התוכנית כרגע. נסה שוב.';
  }
  return 'לא הצלחנו לבנות את התוכנית כרגע. נסה שוב.';
}

// Fixed synthetic draft. Not a model response and not a saved plan.
export function demoPlanFromAnswers(answers = {}) {
  const swing = answers.style === 'swing';
  return {
    name: 'תוכנית דמה',
    description: 'טיוטה סינתטית להדגמה. אין כאן נתוני מסחר אמיתיים.',
    entryRules: typeof answers.entry === 'string' && answers.entry.trim()
      ? answers.entry.trim()
      : 'כניסה אחרי אישור מבנה על הגרף הסינתטי.',
    exitRules: typeof answers.exit === 'string' && answers.exit.trim()
      ? answers.exit.trim()
      : 'יציאה ביעד שנקבע מראש.',
    riskManagement: typeof answers.risk === 'string' && answers.risk.trim()
      ? answers.risk.trim()
      : 'סיכון קבוע לעסקה בדוגמה הזו.',
    goals: 'עקביות בלבד.',
    notes: PLAN_BUILDER_DEMO_BANNER,
    // No exchange symbols: the plan form would otherwise request a public coin icon.
    pairs: [],
    timeframes: ['15m'],
    sessions: swing ? [] : (Array.isArray(answers.sessions) && answers.sessions.length ? answers.sessions : ['Asia']),
    maxDailyLoss: typeof answers.maxDailyLoss === 'number' ? answers.maxDailyLoss : 2,
    maxPositions: typeof answers.maxPositions === 'number' ? answers.maxPositions : 1,
    checklist: ['בדיקת דמה'],
    isActive: true,
    color: '#06b6d4',
    tradeExamples: [],
    marketConditions: 'שוק לדוגמה',
    mistakesToAvoid: ['עסקת נקמה'],
    dailyRoutine: 'סקירה קצרה',
    tradeManagement: 'הזזת סטופ אחרי יעד ראשון',
  };
}

// The only write path. Demo returns without calling addPlan.
export async function saveBuiltPlan({ demo, addPlan, data }) {
  if (demo) return { saved: false };
  await addPlan(data);
  return { saved: true };
}
