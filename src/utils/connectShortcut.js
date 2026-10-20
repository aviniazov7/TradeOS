// The phone bar already has a centre "+" for a new trade. A connect chip
// sits above it only while nothing is connected, so an account that already
// syncs does not grow a second primary action.
export function shouldShowMobileConnectShortcut(connectedCount) {
  return connectedCount === 0;
}
