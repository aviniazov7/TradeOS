// Client-side mirror of the worker's daily AI question cap (worker/aiQuota.js
// + /ai-usage). The server is authoritative — this only stops the button from
// calling the model once we already know the counter is spent. Wording matches
// the worker's deny bodies so the message is the same with or without the
// pre-check.

export function isDailyAiQuotaExhausted(usage) {
  if (!usage || usage.loading || usage.unlimited) return false;
  const limit = Number(usage.limit);
  if (!Number.isFinite(limit) || limit <= 0) return false;
  return Number(usage.used) >= limit;
}

export function dailyAiQuotaMessage(usage = {}) {
  const limit = Number(usage.limit) || (usage.premium ? 200 : 20);
  if (usage.premium) return `הגעת לתקרה היומית של Premium (${limit}). נסה מחר.`;
  return `הגעת למכסה היומית (${limit} בקשות). שדרג ל-Premium ל-200 בקשות ביום.`;
}

// Chart-image analyses have their own smaller daily budget, on top of the
// shared question counter. Free users never reach this (images are premium).
export function isImageAiQuotaExhausted(usage) {
  if (!usage || usage.loading || !usage.premium) return false;
  const limit = Number(usage.imageLimit);
  if (!Number.isFinite(limit) || limit <= 0) return false;
  return Number(usage.imageUsed) >= limit;
}

export function imageAiQuotaMessage(usage = {}) {
  const limit = Number(usage.imageLimit) || 10;
  return `הגעת למכסת ניתוחי התמונות היומית (${limit}). אפשר להמשיך לשוחח בטקסט, והמכסה תתאפס מחר.`;
}

// The chart tab spends a question AND an image slot. The question cap wins
// when both are spent, matching the worker's check order.
export function chartQuotaBlock(usage) {
  if (isDailyAiQuotaExhausted(usage)) return dailyAiQuotaMessage(usage);
  if (isImageAiQuotaExhausted(usage)) return imageAiQuotaMessage(usage);
  return null;
}
