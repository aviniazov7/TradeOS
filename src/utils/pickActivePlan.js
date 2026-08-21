const stamp = (v) => {
  if (!v) return 0;
  if (typeof v?.toDate === 'function') return v.toDate().getTime(); // Firestore Timestamp
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/**
 * The ONE rule for deciding which plan a screen is measuring against. Every plan
 * is created with isActive: true (useTradingPlans.addPlan) and nothing
 * deactivates the others, so several active plans is the normal state, not an
 * edge case. Firestore returns documents in doc-ID order, so without this the
 * analyst page and the AI coach could audit two different plans in the same
 * session and disagree about the same trades.
 */
export function pickActivePlan(plans) {
  const list = Array.isArray(plans) ? plans : [];
  if (!list.length) return null;
  const active = list.filter((p) => p.isActive);
  const pool = active.length ? active : list;
  return [...pool].sort((a, b) => (
    (stamp(b.updatedAt) - stamp(a.updatedAt))
    || (stamp(b.createdAt) - stamp(a.createdAt))
    || String(a.id).localeCompare(String(b.id))
  ))[0] || null;
}
