import { Outlet } from 'react-router-dom';
import { JournalProvider } from '../../contexts/JournalContext';
import { BacktestProvider } from '../../contexts/BacktestContext';

// Journals and backtests subscribe to Firestore. They wrap the signed-in
// shell only, so opening /login does not import them.
export default function AuthedProviders() {
  return (
    <JournalProvider>
      <BacktestProvider>
        <Outlet />
      </BacktestProvider>
    </JournalProvider>
  );
}
