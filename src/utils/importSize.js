/**
 * Reconcile the two things a CSV can call "size".
 *
 * positionSize is MONEY. quantity is a COUNT OF UNITS. The importer used to
 * map both onto positionSize and then derive `quantity = positionSize /
 * entryPrice`, which is only correct when the mapped cell really was a dollar
 * notional. For the far more common case — MT5's "Volume" in lots, Binance and
 * Bybit's "Qty" in coins — it divided a unit count by the entry price, so 0.5
 * BTC bought at $60,000 and sold at $61,000 stored a quantity of 0.0000083 and
 * the journal reported a $500 win as a $0.01 win. Rows carrying a broker
 * profit column were rescued downstream (the exchange P&L wins); rows with
 * only entry, exit and qty got a fabricated number.
 *
 * A mapped quantity column wins and the money figure is derived from it. Only
 * without one does the old direction apply.
 */
export function sizeAndQuantity(rawQuantity, rawPositionSize, entryPrice) {
  const qty = Number.isFinite(rawQuantity) && rawQuantity > 0 ? rawQuantity : 0;
  const size = Number.isFinite(rawPositionSize) && rawPositionSize > 0 ? rawPositionSize : 0;
  const price = Number.isFinite(entryPrice) && entryPrice > 0 ? entryPrice : 0;

  if (qty > 0) return { quantity: qty, positionSize: price > 0 ? price * qty : size };
  if (size > 0 && price > 0) return { quantity: size / price, positionSize: size };
  return { quantity: 0, positionSize: size };
}
