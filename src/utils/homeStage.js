// Which home the signed-in user should see.
// fresh    — nothing to read yet, and no exchange. The page leads with connect.
// awaiting — exchange is connected, the book is still empty. Ask for a first trade.
// manual   — closed trades exist, but nothing syncs them. Show the book, and a connect nudge.
// active   — a connected book. The overview comes first.

export function homeStage({ closedTrades = 0, exchangeConnected = false } = {}) {
  const hasTrades = Number(closedTrades) > 0;
  if (hasTrades && exchangeConnected) return 'active';
  if (hasTrades) return 'manual';
  if (exchangeConnected) return 'awaiting';
  return 'fresh';
}
