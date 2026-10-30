// One rolling window. `prev` is { start, count } or null. The caller persists
// `next` under a lock (the user's Durable Object); this function does not.
export function advanceWindow(prev, now, windowMs) {
  const start = Number(prev?.start);
  const count = Number(prev?.count);
  if (!Number.isFinite(start) || !Number.isFinite(count) || now - start >= windowMs || now < start) {
    return { start: now, count: 1 };
  }
  return { start, count: count + 1 };
}
