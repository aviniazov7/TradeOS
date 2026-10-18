import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { DEMO_CHANGE_EVENT, readDemoMode, writeDemoMode } from '../utils/demoData';

export function useDemoMode() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [active, setActive] = useState(() => readDemoMode(uid));

  useEffect(() => {
    setActive(readDemoMode(uid));
    const sync = () => setActive(readDemoMode(uid));
    window.addEventListener(DEMO_CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(DEMO_CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [uid]);

  const enter = useCallback(() => writeDemoMode(uid, true), [uid]);
  const exit = useCallback(() => writeDemoMode(uid, false), [uid]);
  return { active, enter, exit };
}
