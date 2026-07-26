import { useEffect, useState } from 'react';
import { isEmailSignInLink, completeEmailLinkSignIn } from '../../services/authService';
import { authErrorHe } from '../../utils/authErrors';

export default function AuthEmailLink() {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const href = window.location.href;
      const urlParams = new URLSearchParams(window.location.search);
      const email = urlParams.get('email') || localStorage.getItem('tradeos-email-link');

      if (!isEmailSignInLink(href)) {
        setError('קישור לא תקין');
        return;
      }
      if (!email) {
        setError('לא נמצא אימייל — נסה שוב מהאפליקציה');
        return;
      }

      try {
        // Complete sign-in in this Safari tab (not blocked here)
        await completeEmailLinkSignIn(email, href);
        setStatus('done');
      } catch (err) {
        setError(authErrorHe(err, 'שגיאה באימות הקישור'));
      }
    })();
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
      textAlign: 'center',
      padding: '0 24px',
      gap: 16,
    }}>
      {error ? (
        <>
          <p style={{ color: '#f87171', fontWeight: 600, fontSize: 16 }}>שגיאה</p>
          <p style={{ fontSize: 13, opacity: 0.8 }}>{error}</p>
        </>
      ) : status === 'done' ? (
        <>
          <p style={{ fontSize: 36 }}>✓</p>
          <p style={{ fontSize: 18, fontWeight: 700 }}>התחברת בהצלחה!</p>
          <p style={{ fontSize: 14, opacity: 0.7, lineHeight: 1.6 }}>
            חזור לאפליקציה TradeOS במסך הביתי —<br />
            תהיה מחובר אוטומטית תוך שניות
          </p>
        </>
      ) : (
        <p style={{ fontSize: 15, opacity: 0.7 }}>מתחבר...</p>
      )}
    </div>
  );
}
