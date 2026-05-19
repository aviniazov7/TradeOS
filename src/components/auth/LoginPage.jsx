import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { TrendingUp, Mail, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import BackgroundIcons from '../shared/BackgroundIcons';

export default function LoginPage() {
  const { user, loginWithGoogle, registerWithEmail, loginWithEmail, resetPassword } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      // In an installed PWA this does signInWithRedirect (popup is blocked on
      // iOS standalone); getRedirectResult in AuthContext completes the flow.
      await loginWithGoogle();
    } catch (error) {
      console.error('Google login failed:', error);
      toast.error('שגיאה בהתחברות עם Google');
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setSubmitting(true);
    try {
      if (mode === 'register') {
        if (password.length < 8) {
          toast.error('הסיסמה חייבת להכיל לפחות 8 תווים');
          setSubmitting(false);
          return;
        }
        if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
          toast.error('הסיסמה חייבת להכיל אות גדולה ומספר');
          setSubmitting(false);
          return;
        }
        await registerWithEmail(email, password, displayName || email.split('@')[0]);
        toast.success('החשבון נוצר בהצלחה');
      } else {
        await loginWithEmail(email, password);
      }
    } catch (error) {
      console.error('Auth failed:', error);
      const msg = error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential'
        ? 'אימייל או סיסמה שגויים'
        : error.code === 'auth/email-already-in-use'
        ? 'האימייל כבר רשום במערכת'
        : 'שגיאה בהתחברות';
      toast.error(msg);
    }
    setSubmitting(false);
  };

  const googleSvg = (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      <BackgroundIcons />

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-accent-primary/20 flex items-center justify-center">
              <TrendingUp className="w-7 h-7 text-accent-primary" />
            </div>
            <h1 className="text-3xl font-bold text-text-primary">TradeOS</h1>
          </div>
          <p className="text-text-muted text-sm">מערכת הפעלה למסחר</p>
        </div>

        {/* Auth Card */}
        <div className="bg-bg-secondary border border-border-primary rounded-2xl p-8">
          <h2 className="text-xl font-semibold text-text-primary mb-2 text-center">
            {mode === 'login' ? 'ברוכים הבאים' : 'יצירת חשבון'}
          </h2>
          <p className="text-text-muted text-sm mb-6 text-center">
            {mode === 'login' ? 'התחבר כדי להתחיל לעקוב אחר העסקאות שלך' : 'צור חשבון חדש'}
          </p>

          {/* Google button */}
          <button
            onClick={handleGoogle}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 font-semibold py-3 px-6 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer mb-4 disabled:opacity-50"
          >
            {googleSvg}
            {googleLoading ? 'מתחבר...' : 'התחבר עם Google'}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-border-primary" />
            <span className="text-text-muted text-xs">או</span>
            <div className="flex-1 h-px bg-border-primary" />
          </div>

          {/* Email/Password form */}
          <form onSubmit={handleSubmit} className="space-y-3 text-right">
            {mode === 'register' && (
              <div>
                <label className="block text-xs text-text-muted mb-1">שם תצוגה</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="השם שלך"
                  className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none focus:border-accent-primary transition-colors"
                />
              </div>
            )}
            <div>
              <label className="block text-xs text-text-muted mb-1">אימייל</label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  required
                  dir="ltr"
                  className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none focus:border-accent-primary transition-colors pl-9"
                />
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">סיסמה</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'לפחות 6 תווים' : '••••••'}
                  required
                  dir="ltr"
                  className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none focus:border-accent-primary transition-colors pl-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === 'login' && (
              <button
                type="button"
                onClick={async () => {
                  if (!email) { toast.error('הכנס אימייל קודם'); return; }
                  try { await resetPassword(email); toast.success('נשלח מייל לאיפוס סיסמה'); }
                  catch { toast.error('שגיאה בשליחת מייל'); }
                }}
                className="block text-xs text-accent-primary hover:underline cursor-pointer mt-1"
              >
                שכחתי סיסמה
              </button>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-accent-primary text-bg-primary font-semibold py-2.5 rounded-lg hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50 mt-2"
            >
              {submitting ? '...' : mode === 'login' ? 'התחבר' : 'צור חשבון'}
            </button>
          </form>

          {/* Toggle mode */}
          <p className="text-text-muted text-sm mt-4 text-center">
            {mode === 'login' ? 'אין לך חשבון?' : 'יש לך חשבון?'}
            <button
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="text-accent-primary hover:underline mr-1 cursor-pointer"
            >
              {mode === 'login' ? 'הרשמה' : 'התחברות'}
            </button>
          </p>
        </div>

        {/* Footer */}
        <p className="text-text-muted text-xs text-center mt-6">
          TradeOS &copy; {new Date().getFullYear()} &middot; הנתונים שלך מאוחסנים בצורה מאובטחת ב-Firebase
        </p>
      </div>
    </div>
  );
}
