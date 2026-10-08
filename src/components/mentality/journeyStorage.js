// Per-user browser cache for the development map: the last stage snapshot
// (so the mental-zone tile can show the real stage without subscribing to the
// whole trades collection) and the last AI analysis. Best-effort only — every
// read/write is guarded, and a missing/blocked storage just means "no cache".

const STAGE_KEY = 'tradeos_traderStage_v1';
const AI_KEY = 'tradeos_journeyAi_v1';

const keyFor = (base, uid) => (uid ? `${base}:${uid}` : null);

function read(key) {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage full / blocked — the cache is optional */ }
}

export function readStageSnapshot(uid) {
  const v = read(keyFor(STAGE_KEY, uid));
  return v && typeof v.index === 'number' && typeof v.name === 'string' ? v : null;
}

export function writeStageSnapshot(uid, assessment) {
  if (!assessment) return;
  write(keyFor(STAGE_KEY, uid), {
    index: assessment.stage.index,
    of: assessment.stage.of,
    name: assessment.stage.name,
    nextName: assessment.nextStage?.name || null,
    progress: assessment.stageProgress,
    overall: assessment.overall,
    insufficient: assessment.insufficient,
    at: Date.now(),
  });
}

export function readAiAnalysis(uid) {
  const v = read(keyFor(AI_KEY, uid));
  return v && typeof v.text === 'string' && v.text ? v : null;
}

export function writeAiAnalysis(uid, value) {
  write(keyFor(AI_KEY, uid), value);
}
