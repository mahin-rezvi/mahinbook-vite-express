import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/auth/me').then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  // Theme follows the user's display setting.
  const theme = user?.settings?.theme || 'light';
  useEffect(() => {
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    if (theme !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  const timer = useRef();
  const refresh = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => api('/auth/me').then(setUser).catch(() => {}), 250);
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  }, []);

  const bump = useCallback((key, delta) => setUser((u) => (u ? { ...u, [key]: Math.max(0, (u[key] || 0) + delta) } : u)), []);

  return (
    <AuthCtx.Provider value={{ user, setUser, loading, refresh, logout, bump }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
