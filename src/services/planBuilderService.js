import { getAuth } from 'firebase/auth';
import { PLAN_BUILDER_VERSION } from '../utils/planBuilderQuestions';
import { planBuilderErrorMessage } from '../utils/planBuilderDemo';

const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://trade-os.tradeos.workers.dev';

// One generation. The worker validates, charges quota, and returns a sanitized
// plan. Nothing here writes to Firestore.
export async function requestPlanBuilder(answers) {
  const user = getAuth().currentUser;
  if (!user) {
    const err = new Error(planBuilderErrorMessage(401));
    err.status = 401;
    throw err;
  }
  const token = await user.getIdToken();
  let res;
  try {
    res = await fetch(`${WORKER_BASE}/ai-plan-builder`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: PLAN_BUILDER_VERSION, answers }),
      signal: AbortSignal.timeout(75000),
    });
  } catch (e) {
    const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    const err = new Error(planBuilderErrorMessage(timedOut ? 503 : 0));
    err.status = timedOut ? 503 : 0;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok || !data?.plan || data.stub !== false) {
    const err = new Error(planBuilderErrorMessage(res.status, data));
    err.status = res.status;
    throw err;
  }
  return data.plan;
}
