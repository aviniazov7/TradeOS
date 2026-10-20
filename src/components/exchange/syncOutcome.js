// Decide what a manual exchange sync should show. allSettled never rejects,
// so a dead key used to look like an empty journal ("לא נמצאו עסקאות").
// A failed call with no rows is an error. A failed call that still produced
// rows is a partial success: show the rows and the error.

export function resolveSyncOutcome(tradesResult, openResult) {
  const tradesFailed = tradesResult?.status === 'rejected';
  const openFailed = openResult?.status === 'rejected';
  const closed = tradesFailed || !Array.isArray(tradesResult?.value) ? [] : tradesResult.value;
  const open = openFailed || !Array.isArray(openResult?.value) ? [] : openResult.value;
  const failure = () => (
    (tradesFailed && tradesResult.reason)
    || (openFailed && openResult.reason)
    || new Error('הסנכרון נכשל')
  );
  if (tradesFailed && openFailed) return { type: 'error', error: failure() };

  const trades = [
    ...open.map((p) => ({ ...p, _isOpen: true, pnlFromExchange: null })),
    ...closed,
  ];
  if (!trades.length && (tradesFailed || openFailed)) return { type: 'error', error: failure() };
  if (!trades.length) return { type: 'empty' };
  return {
    type: 'ok',
    trades,
    partialError: (tradesFailed || openFailed) ? failure() : null,
  };
}
