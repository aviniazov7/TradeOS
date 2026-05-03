import { useEffect, useState } from 'react';
import { auth, db } from '../../services/firebase';
import { isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

const WORKER_URL = import.meta.env.VITE_GOOGLE_AUTH_WORKER_URL || '';

export default function AuthEmailLink() {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const href = window.location.href;
    const urlParams = new URLSearchParams(window.location.search);
    const email = urlParams.get('email') || localStorage.getItem('tradeos-email-link');

    if (!isSignInWithEmailLink(auth, href)) {
      setError('קישור לא תקין');
      return;
    }
    if (!email) {
      setError('לא נמצא אימייל — נסה שוב מהאפליקציה');
      return;
    }
    if (!WORKER_URL) {
      setError('שירות אימות אינו זמין');
      return;
    }

    (async () => {
      try {
        // Complete sign-in in this Safari tab (not blocked here)
        const result = await signInWithEmailLink(auth, email, href);
        const idToken = await result.user.getIdToken();

        // Exchange Firebase ID token for a custom token the PWA can use
        const workerRes = await fetch(`${WORKER_URL}/email-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });
        const workerData = await workerRes.json();
        if (!workerRes.ok || !workerData.customToken) {
          throw new Error(workerData.error || 'שגיאה בקבלת טוקן');
        }

        // Write custom token to Firestore so the PWA can pick it up
        await setDoc(doc(db, 'authBridge', email), {
          customToken: workerData.customToken,
          email,
          exp: Date.now() + 5 * 60 * 1000,
        });

        setStatus('done');
      } catch (err) {
        setError(err.message || 'שגיאה');
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
