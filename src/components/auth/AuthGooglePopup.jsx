import { useEffect, useRef, useState } from 'react';
import { loginWithGoogleIdToken } from '../../services/authService';
import { authErrorHe } from '../../utils/authErrors';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Google Identity Services is only needed on this popup page, so it is loaded
// here on demand rather than by index.html on every page of the app.
const GIS_SRC = 'https://accounts.google.com/gsi/client';

function waitForGIS(timeout = 8000) {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    if (!document.querySelector(`script[src="${GIS_SRC}"]`)) {
      const s = document.createElement('script');
      s.src = GIS_SRC;
      s.async = true;
      document.head.appendChild(s);
    }
    const start = Date.now();
    const t = setInterval(() => {
      if (window.google?.accounts?.id) { clearInterval(t); resolve(); }
      else if (Date.now() - start > timeout) { clearInterval(t); reject(new Error('GIS timeout')); }
    }, 80);
  });
}

export default function AuthGooglePopup() {
  const btnRef = useRef(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) { setError('GOOGLE_CLIENT_ID חסר'); return; }
    let cancelled = false;

    (async () => {
      try {
        await waitForGIS();
        if (cancelled) return;

        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response) => {
            if (!response?.credential) { setError('לא התקבל credential'); return; }
            setLoading(true);
            try {
              const result = await loginWithGoogleIdToken(response.credential);
              if (result?.user) {
                localStorage.setItem('tradeos-auth-signal', Date.now().toString());
                window.close();
              }
            } catch (err) {
              setError(authErrorHe(err));
              setLoading(false);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: false,
        });

        if (btnRef.current) {
          window.google.accounts.id.renderButton(btnRef.current, {
            theme: 'outline',
            size: 'large',
            type: 'standard',
            text: 'signin_with',
            shape: 'pill',
            locale: 'he',
            width: 280,
          });
        }
      } catch (err) {
        if (!cancelled) setError(authErrorHe(err, 'שירות ההתחברות אינו זמין כעת'));
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0f172a',
      color: 'white',
      fontFamily: 'system-ui, sans-serif',
      gap: 24,
    }}>
      <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>TradeOS</p>

      {loading ? (
        <>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{
            width: 36, height: 36,
            border: '3px solid #007ba7', borderTopColor: 'transparent',
            borderRadius: '50%', animation: 'spin 0.9s linear infinite',
          }} />
          <p style={{ margin: 0, fontSize: 14 }}>מתחבר...</p>
        </>
      ) : error ? (
        <div style={{ textAlign: 'center', maxWidth: 300, padding: '0 16px' }}>
          <p style={{ color: '#f87171', marginBottom: 8, fontWeight: 600 }}>שגיאה</p>
          <p style={{ fontSize: 12, opacity: 0.8, wordBreak: 'break-word' }}>{error}</p>
          <button onClick={() => window.close()} style={{
            marginTop: 16, padding: '8px 20px', background: '#374151',
            border: 'none', borderRadius: 8, color: 'white', cursor: 'pointer',
          }}>סגור</button>
        </div>
      ) : (
        <div ref={btnRef} style={{ minHeight: 44 }} />
      )}
    </div>
  );
}
