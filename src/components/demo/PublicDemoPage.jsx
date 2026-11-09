import { LoggedOutAuth } from '../../contexts/AuthContext';
import { PUBLIC_DEMO_BANNER } from '../../utils/publicDemo';

// Logged-out shell. It does not mount Firebase Auth, Firestore, or the Worker,
// and it has nowhere to save.
export default function PublicDemoPage() {
  return (
    <LoggedOutAuth>
      <div dir="rtl" className="min-h-screen bg-bg-primary text-text-primary">
        <div
          data-testid="public-demo-banner"
          className="fixed inset-x-0 top-0 z-[70] border-b border-amber-500/40 bg-amber-500/15 px-3 py-2 text-center text-sm font-bold text-amber-200"
        >
          {PUBLIC_DEMO_BANNER}
        </div>
        <main className="flex min-h-screen flex-col items-center justify-center px-4 pt-12 text-center">
          <h1 className="text-2xl font-extrabold">נסה את TradeOS</h1>
          <p className="mt-2 max-w-sm text-sm text-text-secondary">שום דבר לא נשמר. אין כאן חשבון ואין נתוני מסחר.</p>
        </main>
      </div>
    </LoggedOutAuth>
  );
}
