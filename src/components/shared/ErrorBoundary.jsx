import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    // Auto-reload on chunk/MIME errors (stale deploy cache)
    const msg = error?.message || '';
    if (msg.includes('MIME type') || msg.includes('Failed to fetch dynamically imported module') || msg.includes('Loading chunk')) {
      window.location.reload();
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const err = this.state.error;
      const isConfigError =
        err?.code === 'tradeos/firebase-config-missing' ||
        /invalid-api-key|api-key-not-valid/i.test(err?.message || '');

      if (isConfigError) {
        return (
          <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6" dir="rtl">
            <div className="max-w-md w-full text-center space-y-6">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-loss/15 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-loss" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-text-primary mb-2">תצורת Firebase חסרה</h1>
                <p className="text-sm text-text-secondary leading-relaxed">
                  לא הוגדרו משתני סביבה של Firebase בזמן הבנייה.
                  ודא שקובץ <code className="px-1 py-0.5 bg-bg-secondary rounded text-xs">.env</code> מכיל
                  את כל המפתחות הנדרשים, ואז הרץ:
                </p>
                <pre className="mt-3 p-3 bg-bg-secondary rounded-lg text-xs text-text-primary text-left" dir="ltr">npm run deploy</pre>
              </div>
              {err?.message && (
                <details className="text-right">
                  <summary className="text-xs text-text-muted cursor-pointer hover:text-text-secondary">פרטי השגיאה</summary>
                  <pre className="mt-2 p-3 bg-bg-secondary rounded-lg text-xs text-text-muted overflow-auto max-h-32 text-left" dir="ltr">
                    {err.message}
                  </pre>
                </details>
              )}
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6" dir="rtl">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-loss/15 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-loss" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-primary mb-2">משהו השתבש</h1>
              <p className="text-sm text-text-secondary">
                אירעה שגיאה לא צפויה. נסה לרענן את הדף.
              </p>
            </div>
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent-primary text-bg-primary font-semibold rounded-lg hover:bg-accent-hover transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              רענן דף
            </button>
            {err && (
              <details className="text-right">
                <summary className="text-xs text-text-muted cursor-pointer hover:text-text-secondary">פרטי השגיאה</summary>
                <pre className="mt-2 p-3 bg-bg-secondary rounded-lg text-xs text-text-muted overflow-auto max-h-32 text-left" dir="ltr">
                  {err.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
