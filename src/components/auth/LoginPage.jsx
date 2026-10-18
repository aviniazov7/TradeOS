import { useState, useEffect, useId } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Navigate, useSearchParams, Link } from 'react-router-dom';
import { Mail, Eye, EyeOff, Lock, User, Link2, BarChart3, Sparkles, Check, ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { authErrorHe, authErrorMessage, isSilentAuthError } from '../../utils/authErrors';
// Live checklist on sign-up, so the user sees what is missing before pressing
// the button instead of after.
import { PASSWORD_RULES } from '../../utils/passwordPolicy';
import { loginFieldError } from '../../utils/loginValidation';
import { preloadPopupResolver } from '../../services/authService';
import { exchangeSyncBlurb } from '../exchange/exchangeConfig';
import BrandMark from '../shared/BrandMark';

// One line under the sign-up title on a phone. The desktop panel already
// carries the longer pitch; this is the only value line a 390px screen sees.
export const SIGNUP_VALUE_LINE = 'יומן מסחר בעברית — חבר בורסה, עקוב אחרי כל עסקה, וקבל סוכן AI אישי.';

// What the product does, in three lines — shown beside the form on wide screens.
// The exchange line names auto-sync (MEXC, Bybit) and Binance file import.
// Binance is never described as if trades pull in by themselves.
const FEATURES = [
  { icon: Link2, title: 'חיבור לבורסה', text: exchangeSyncBlurb() },
  { icon: BarChart3, title: 'יומן ואנליטיקה', text: 'רווח/הפסד, R:R, אחוז הצלחה ופילוח לפי מטבע וסשן' },
  { icon: Sparkles, title: 'סוכן AI אישי', text: 'שואלים בעברית ומקבלים תשובה מבוססת על העסקאות שלך' },
];

// Decorative equity curve for the brand panel — same gradient as the splash.
function CurveArt() {
  const uid = useId().replace(/:/g, '');
  const lineId = `lg-line-${uid}`;
  const areaId = `lg-area-${uid}`;
  return (
    <svg viewBox="0 0 400 140" className="w-full h-auto" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={lineId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
        <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[35, 70, 105].map((y) => <line key={y} x1="0" x2="400" y1={y} y2={y} stroke="rgba(255,255,255,0.05)" />)}
      <path d="M0 118 L40 104 L80 110 L120 84 L160 92 L200 66 L240 72 L280 44 L320 52 L360 26 L400 16 L400 140 L0 140 Z" fill={`url(#${areaId})`} />
      <path d="M0 118 L40 104 L80 110 L120 84 L160 92 L200 66 L240 72 L280 44 L320 52 L360 26 L400 16" stroke={`url(#${lineId})`} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="400" cy="16" r="5" fill="#60a5fa" />
    </svg>
  );
}

export default function LoginPage() {
  const { user, loginWithGoogle, registerWithEmail, loginWithEmail, resetPassword } = useAuth();
  const [params] = useSearchParams();
  // Landed here right after deleting the account (ProfilePage redirects with
  // ?deleted=1): confirm once, then drop the flag so a refresh doesn't repeat it.
  const deletedFlag = params.get('deleted') === '1';
  useEffect(() => {
    if (!deletedFlag) return;
    toast.success('החשבון והנתונים נמחקו לצמיתות', { duration: 6000 });
    window.history.replaceState(null, '', '/login');
  }, [deletedFlag]);
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Opt-in to marketing email — unticked by default, never required.
  const [marketingEmails, setMarketingEmails] = useState(false);
  // Error for the last submit, shown inline under the form (role="alert") —
  // a toast alone was easy to miss, so a wrong password looked like nothing
  // happened. Cleared as soon as the user edits a field or switches tab.
  const [formError, setFormError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  // Warm the Google popup resolver after first paint, and again if the
  // pointer reaches the button first. The tap itself must not await the
  // import — Safari blocks window.open once the gesture has been awaited.
  useEffect(() => {
    let idleId = 0;
    let timer = 0;
    const start = () => { preloadPopupResolver(); };
    const schedule = () => {
      if (typeof requestIdleCallback === 'function') {
        idleId = requestIdleCallback(start, { timeout: 1500 });
      }
      timer = window.setTimeout(start, 200);
    };
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });
    return () => {
      window.removeEventListener('load', schedule);
      if (idleId && typeof cancelIdleCallback === 'function') cancelIdleCallback(idleId);
      window.clearTimeout(timer);
    };
  }, []);

  // After a successful login, honour ?redirect=… (used by the coupon share
  // link) but only allow same-app relative paths to avoid open-redirects.
  if (user) {
    const redirect = params.get('redirect');
    const safe = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/';
    return <Navigate to={safe} replace />;
  }

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      // In an installed PWA this does signInWithRedirect (popup is blocked on
      // iOS standalone); getRedirectResult in AuthContext completes the flow.
      await loginWithGoogle();
    } catch (error) {
      setGoogleLoading(false);
      if (isSilentAuthError(error)) return; // the user closed the popup
      console.error('Google login failed:', error);
      setFormError(authErrorHe(error, 'שגיאה בהתחברות עם Google'));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const problem = loginFieldError({ email, password, mode });
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormError('');
    setSubmitting(true);
    try {
      if (mode === 'register') {
        await registerWithEmail(email, password, displayName || email.split('@')[0], { marketingEmails });
        toast.success('החשבון נוצר בהצלחה');
      } else {
        await loginWithEmail(email, password);
      }
    } catch (error) {
      console.error('Auth failed:', error);
      setFormError(authErrorMessage(error, mode));
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

  const isLogin = mode === 'login';
  const input = 'w-full h-11 bg-bg-tertiary border border-border-primary rounded-xl px-3 text-sm text-text-primary placeholder-text-muted outline-none focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 transition-colors';

  const forgot = async () => {
    if (!email) { setFormError('הכנס את האימייל שלך ואז לחץ שוב על "שכחתי סיסמה"'); return; }
    setFormError('');
    try { await resetPassword(email); toast.success('נשלח מייל לאיפוס סיסמה'); } catch (error) { setFormError(authErrorHe(error, 'שליחת המייל נכשלה. נסה שוב')); }
  };

  return (
    <div className="min-h-dvh bg-bg-primary grid lg:grid-cols-2">
      {/* Brand panel — wide screens only */}
      <aside className="hidden lg:flex relative overflow-hidden flex-col items-center justify-between p-12 border-l border-border-primary bg-bg-secondary">
        <div aria-hidden className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(70% 60% at 100% 0%, rgba(37,99,235,0.18) 0%, transparent 60%), radial-gradient(60% 50% at 0% 100%, rgba(56,189,248,0.08) 0%, transparent 60%)' }} />
        <div className="relative"><BrandMark size="lg" /></div>

        {/* Centred in the half, so the pitch sits in the middle of the panel
            rather than hugging its edge. */}
        <div className="relative w-full max-w-lg text-center">
          <h2 className="text-4xl font-extrabold text-text-primary leading-tight">
            יומן המסחר
            <br />
            <span className="text-gradient">שמכיר כל עסקה שלך</span>
          </h2>
          <p className="text-base text-text-secondary mt-4 leading-relaxed">
            מתעדים, מודדים ומשתפרים — הכל במקום אחד, בעברית, מותאם לפיוצ׳רס.
          </p>
          <div className="mt-8 rounded-2xl border border-border-primary bg-bg-primary/60 p-4">
            <CurveArt />
          </div>
          <ul className="mt-8 space-y-5 text-right">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-3.5">
                <span className="w-10 h-10 shrink-0 rounded-xl bg-accent-primary/12 border border-accent-primary/20 grid place-items-center">
                  {f.icon && <f.icon className="w-5 h-5 text-accent-hover" />}
                </span>
                <div>
                  <p className="text-sm font-bold text-text-primary">{f.title}</p>
                  <p className="text-sm text-text-secondary mt-0.5">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-text-muted">TradeOS &copy; {new Date().getFullYear()}</p>
      </aside>

      {/* Form */}
      <main className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="lg:hidden flex justify-center mb-8"><BrandMark size="lg" /></div>

          <h1 className="text-2xl font-extrabold text-text-primary">{isLogin ? 'ברוך שובך' : 'פתיחת חשבון'}</h1>
          <p className="text-sm text-text-secondary mt-1.5">
            {isLogin ? 'התחבר כדי להמשיך ליומן המסחר שלך' : 'חינם, בלי כרטיס אשראי. לוקח פחות מדקה.'}
          </p>
          {!isLogin && (
            <p data-testid="signup-value" className="lg:hidden text-sm text-text-secondary mt-2 leading-relaxed">
              {SIGNUP_VALUE_LINE}
            </p>
          )}

          {/* Mode switch */}
          <div role="tablist" className="mt-6 grid grid-cols-2 p-1 rounded-xl bg-bg-secondary border border-border-primary">
            {[['login', 'התחברות'], ['register', 'הרשמה']].map(([id, label]) => (
              <button key={id} role="tab" aria-selected={mode === id} type="button" onClick={() => { setMode(id); setFormError(''); }}
                className={`h-9 rounded-lg text-sm font-bold transition-colors cursor-pointer ${mode === id ? 'bg-bg-tertiary text-text-primary shadow-sm' : 'text-text-muted hover:text-text-primary'}`}>
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            onPointerEnter={() => preloadPopupResolver()}
            onFocus={() => preloadPopupResolver()}
            onTouchStart={() => preloadPopupResolver()}
            disabled={googleLoading}
            className="mt-5 w-full h-11 flex items-center justify-center gap-3 bg-white text-gray-900 text-sm font-bold rounded-xl hover:bg-gray-100 transition-colors cursor-pointer disabled:opacity-60"
          >
            {googleLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : googleSvg}
            {isLogin ? 'המשך עם Google' : 'הרשמה עם Google'}
          </button>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-border-primary" />
            <span className="text-text-muted text-xs">או עם אימייל</span>
            <div className="flex-1 h-px bg-border-primary" />
          </div>

          <form noValidate onSubmit={handleSubmit} className="space-y-4 text-right">
            {!isLogin && (
              <div>
                <label htmlFor="lp-name" className="block text-xs font-semibold text-text-secondary mb-1.5">שם תצוגה</label>
                <div className="relative">
                  <input id="lp-name" type="text" value={displayName} onChange={(e) => { setDisplayName(e.target.value); setFormError(''); }}
                    placeholder="איך לקרוא לך" autoComplete="nickname" className={`${input} pr-10`} />
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                </div>
              </div>
            )}
            <div>
              <label htmlFor="lp-email" className="block text-xs font-semibold text-text-secondary mb-1.5">אימייל</label>
              <div className="relative">
                <input id="lp-email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setFormError(''); }}
                  placeholder="name@example.com" dir="ltr" autoComplete="email" aria-invalid={formError ? 'true' : undefined}
                  className={`${input} pl-10 text-left`} />
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="lp-pass" className="text-xs font-semibold text-text-secondary">סיסמה</label>
                {isLogin && (
                  <button type="button" onClick={forgot} className="text-xs text-accent-hover hover:underline cursor-pointer">
                    שכחתי סיסמה
                  </button>
                )}
              </div>
              <div className="relative">
                <input id="lp-pass" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => { setPassword(e.target.value); setFormError(''); }}
                  placeholder="••••••••" dir="ltr" autoComplete={isLogin ? 'current-password' : 'new-password'}
                  aria-invalid={formError ? 'true' : undefined}
                  className={`${input} pl-10 pr-10 text-left`} />
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center text-text-muted hover:text-text-primary cursor-pointer">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {!isLogin && (
                <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                  {PASSWORD_RULES.map((r) => {
                    const ok = r.test(password);
                    return (
                      <li key={r.id} className={`flex items-center gap-1 text-xs ${ok ? 'text-profit' : 'text-text-muted'}`}>
                        <Check className={`w-3.5 h-3.5 ${ok ? '' : 'opacity-40'}`} /> {r.label}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {!isLogin && (
              <label className="flex items-start gap-2.5 text-xs text-text-secondary leading-relaxed cursor-pointer select-none">
                <input type="checkbox" checked={marketingEmails} onChange={(e) => setMarketingEmails(e.target.checked)}
                  className="mt-0.5 w-4 h-4 shrink-0 accent-[#3b82f6] cursor-pointer" />
                <span>אשמח לקבל עדכונים והטבות במייל מ-TradeOS. אפשר להסיר בכל רגע.</span>
              </label>
            )}

            {formError && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-loss/30 bg-loss/10 px-3 py-2.5 text-sm text-loss">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
                <span className="min-w-0">{formError}</span>
              </div>
            )}

            <button type="submit" disabled={submitting}
              className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-accent-muted hover:bg-accent-primary text-white text-sm font-bold transition-colors cursor-pointer disabled:opacity-60">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLogin ? 'התחברות' : 'יצירת חשבון'}
            </button>
          </form>

          <div className="mt-8 flex items-center justify-center gap-1.5 text-xs text-text-muted">
            <ShieldCheck className="w-3.5 h-3.5 text-profit" />
            הנתונים שלך מוצפנים ומאוחסנים בצורה מאובטחת
          </div>
          <p className="text-center mt-2">
            <Link to="/accessibility" className="text-text-muted hover:text-accent-hover text-xs transition-colors">הצהרת נגישות</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
