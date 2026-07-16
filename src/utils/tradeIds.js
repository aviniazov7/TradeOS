// Every exchange close-order id a trade carries. Multi-TP rows merged by the
// worker list ALL their closing orders' ids in `externalIds`; older documents
// (and single-close trades) only have the scalar `externalId`. Two rows
// describe the same position when these sets overlap — a position that closed
// across two syncs arrives with the first sync's id plus the new closes' ids.
export function tradeExternalIds(t) {
  const ids = [];
  if (t?.externalId) ids.push(t.externalId);
  if (Array.isArray(t?.externalIds)) {
    for (const id of t.externalIds) if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}
