// When KV has no prepared digest (staging has its own namespace and no cron),
// GET /news/digest must not answer 503. These stories are the RSS headlines
// the feed route already fetched. No model call and no secret.

const WHY = 'כותרת מהמקור. התקציר המעובד עדיין לא מוכן.';

export function digestFromArticles(market, payload, limit = 6) {
  const items = (Array.isArray(payload?.items) ? payload.items : [])
    .filter((item) => item && typeof item.title === 'string' && item.title.trim() && typeof item.link === 'string' && item.link.trim())
    .slice(0, limit);
  if (!items.length) return null;
  return {
    market: market === 'stocks' ? 'stocks' : 'crypto',
    updatedAt: Number(payload?.updatedAt) || Date.now(),
    source: 'headlines',
    stories: items.map((item) => ({
      headline: item.title.trim().slice(0, 160),
      why: WHY,
      impact: 'medium',
      category: 'שוק',
      sources: [{
        label: String(item.sourceLabel || item.sourceKey || 'מקור').slice(0, 40),
        link: item.link.trim(),
        title: item.title.trim().slice(0, 200),
      }],
    })),
  };
}
