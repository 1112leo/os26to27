import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  adminSession,
  loginAdmin,
  logoutAdmin,
  watchAdminSession,
  firebaseError,
  type AdminSession,
} from '../lib/firebase';

interface ContextValue {
  session: AdminSession;
  loading: boolean;
  error: string;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}
const Context = createContext<ContextValue | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdminSession>({ authenticated: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void watchAdminSession(
      (next) => {
        if (!disposed) {
          setSession(next);
          setLoading(false);
          setError('');
        }
      },
      (reason) => {
        if (!disposed) {
          setSession({ authenticated: false });
          setLoading(false);
          setError(firebaseError(reason).message);
        }
      },
    )
      .then((stop) => {
        if (disposed) stop();
        else unsubscribe = stop;
      })
      .catch((reason) => {
        if (!disposed) {
          setLoading(false);
          setError(firebaseError(reason).message);
        }
      });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);
  const refresh = useCallback(async () => {
    setSession(await adminSession());
    setLoading(false);
  }, []);
  const login = useCallback(async (email: string, password: string) => {
    setSession(await loginAdmin(email, password));
    setError('');
  }, []);
  const logout = useCallback(async () => {
    await logoutAdmin();
    setSession({ authenticated: false });
  }, []);
  return (
    <Context.Provider value={{ session, loading, error, login, logout, refresh }}>
      {children}
    </Context.Provider>
  );
}
export function useAdmin() {
  const value = useContext(Context);
  if (!value) throw new Error('SessionProvider is missing');
  return value;
}
