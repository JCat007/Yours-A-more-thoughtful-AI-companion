import React, { createContext, useContext, useEffect, useState } from 'react';
import { useLanguage } from './LanguageContext';

export type BellaMode = 'china' | 'world';

interface ModeContextValue {
  mode: BellaMode;
  setMode: (mode: BellaMode) => void;
}

const ModeContext = createContext<ModeContextValue | null>(null);

const STORAGE_KEY = 'bella-mode';

function defaultLangForMode(m: BellaMode): 'zh' | 'en' {
  return m === 'china' ? 'zh' : 'en';
}

export const ModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { syncLangFromModeDefault } = useLanguage();
  const [mode, setModeState] = useState<BellaMode>('china');

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as BellaMode | null;
      const initial: BellaMode = stored === 'world' ? 'world' : 'china';
      setModeState(initial);
      syncLangFromModeDefault(defaultLangForMode(initial));
    } catch {
      // ignore
    }
  }, [syncLangFromModeDefault]);

  const setMode = (m: BellaMode) => {
    setModeState(m);
    try {
      window.localStorage.setItem(STORAGE_KEY, m);
    } catch {
      // ignore
    }
    syncLangFromModeDefault(defaultLangForMode(m));
  };

  return (
    <ModeContext.Provider value={{ mode, setMode }}>
      {children}
    </ModeContext.Provider>
  );
};

export const useMode = () => {
  const ctx = useContext(ModeContext);
  if (!ctx) {
    throw new Error('useMode must be used within ModeProvider');
  }
  return ctx;
};
