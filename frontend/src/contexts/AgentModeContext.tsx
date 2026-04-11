import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface AgentModeContextValue {
  agentMode: boolean;
  setAgentMode: (v: boolean) => void;
}

const AgentModeContext = createContext<AgentModeContextValue | null>(null);

export function AgentModeProvider({ children }: { children: ReactNode }) {
  const [agentMode, setAgentModeState] = useState(() => {
    try { return sessionStorage.getItem('agentMode') === '1'; } catch { return false; }
  });
  const setAgentMode = useCallback((v: boolean) => {
    setAgentModeState(v);
    try { v ? sessionStorage.setItem('agentMode', '1') : sessionStorage.removeItem('agentMode'); } catch {}
  }, []);
  return (
    <AgentModeContext.Provider value={{ agentMode, setAgentMode }}>
      {children}
    </AgentModeContext.Provider>
  );
}

export function useAgentMode() {
  const ctx = useContext(AgentModeContext);
  if (!ctx) throw new Error('useAgentMode must be used within AgentModeProvider');
  return ctx;
}
