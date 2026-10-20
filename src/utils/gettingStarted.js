// Exchange first. The card used to lead with "add a trade", which sent new
// users into an empty form before they had a connection.
export function gettingStartedModel({ tradeCount = 0, exchangeConnected = false, hasOpeningBalance = false, morningCount = 0 } = {}) {
  return [
    { key: 'exchange', done: !!exchangeConnected },
    { key: 'trade', done: tradeCount > 0 },
    { key: 'balance', done: !!exchangeConnected || !!hasOpeningBalance },
    { key: 'mind', done: morningCount > 0 },
  ];
}
