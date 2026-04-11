import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { authApi, type BellaAuthUser, type BellaUserSettings } from '../api/auth';

export type BellaAuthContextValue = {
  user: BellaAuthUser | null;
  settings: BellaUserSettings | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateSettings: (patch: { companionMemoryEnabled?: boolean; autoLearnEnabled?: boolean }) => Promise<void>;
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  openAuthModal: () => void;
  memoryModalOpen: boolean;
  setMemoryModalOpen: (open: boolean) => void;
  /** While sign-in modal is open, header can preview the username being typed. */
  authDraftUsername: string;
  setAuthDraftUsername: (name: string) => void;
};

const BellaAuthContext = createContext<BellaAuthContextValue | null>(null);

export function BellaAuthProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [user, setUser] = useState<BellaAuthUser | null>(null);
  const [settings, setSettings] = useState<BellaUserSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [memoryModalOpen, setMemoryModalOpen] = useState(false);
  const [authDraftUsername, setAuthDraftUsername] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const d = await authApi.me();
      setUser(d.user);
      setSettings(d.settings);
    } catch {
      setUser(null);
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (location.pathname === '/bella' || location.pathname === '/bella/memory') {
      void refresh();
    }
  }, [location.pathname, refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const d = await authApi.login(username, password);
    setUser(d.user);
    setSettings(d.settings);
    setAuthModalOpen(false);
    setAuthDraftUsername('');
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    const d = await authApi.register(username, password);
    setUser(d.user);
    setSettings(d.settings);
    setAuthModalOpen(false);
    setAuthDraftUsername('');
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    }
    setUser(null);
    setSettings(null);
    setAuthDraftUsername('');
  }, []);

  const updateSettings = useCallback(
    async (patch: { companionMemoryEnabled?: boolean; autoLearnEnabled?: boolean }) => {
      const d = await authApi.updateSettings(patch);
      setUser(d.user);
      setSettings(d.settings);
    },
    []
  );

  const openAuthModal = useCallback(() => {
    setAuthDraftUsername('');
    setAuthModalOpen(true);
  }, []);

  const value = useMemo(
    () =>
      ({
        user,
        settings,
        loading,
        refresh,
        login,
        register,
        logout,
        updateSettings,
        authModalOpen,
        setAuthModalOpen,
        openAuthModal,
        memoryModalOpen,
        setMemoryModalOpen,
        authDraftUsername,
        setAuthDraftUsername,
      }) satisfies BellaAuthContextValue,
    [
      user,
      settings,
      loading,
      refresh,
      login,
      register,
      logout,
      updateSettings,
      authModalOpen,
      openAuthModal,
      memoryModalOpen,
      authDraftUsername,
    ]
  );

  return <BellaAuthContext.Provider value={value}>{children}</BellaAuthContext.Provider>;
}

export function useBellaAuth(): BellaAuthContextValue {
  const c = useContext(BellaAuthContext);
  if (!c) throw new Error('useBellaAuth must be used within BellaAuthProvider');
  return c;
}

export function useBellaAuthOptional(): BellaAuthContextValue | null {
  return useContext(BellaAuthContext);
}
