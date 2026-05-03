import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function useTheme() {
  const { user } = useAuth();
  const uid = user?.uid;

  const getStoredTheme = () => {
    if (uid) {
      return localStorage.getItem(`tradeos_theme_${uid}`) || 'dark';
    }
    return 'dark';
  };

  const [theme, setTheme] = useState(getStoredTheme);

  // Update theme when user changes (login/logout/switch account)
  useEffect(() => {
    setTheme(getStoredTheme());
  }, [uid]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
    } else {
      root.classList.remove('light');
    }
    if (uid) {
      localStorage.setItem(`tradeos_theme_${uid}`, theme);
    }
  }, [theme, uid]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return { theme, toggleTheme, isDark: theme === 'dark' };
}
