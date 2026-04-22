import type { AgentFramework } from '../../authService';
import type { OpenClawChatExtras } from '../../assistant';

export type AgentChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type AgentChatParams = {
  framework: AgentFramework;
  messages: AgentChatMessage[];
  mode: 'china' | 'world';
  agentId: string;
  bellaUserId?: string | null;
};

export type CanonicalSessionState = {
  recentTurns: AgentChatMessage[];
  summary?: string;
  fileReferences?: string[];
  memoryPointers?: string[];
};

export interface AgentAdapter {
  readonly framework: AgentFramework;
  chat(params: AgentChatParams): Promise<string>;
  exportSessionState(_sessionId: string): Promise<CanonicalSessionState>;
  importSessionState(_sessionId: string, _payload: CanonicalSessionState): Promise<void>;
  healthCheck(): Promise<{ ok: boolean; message?: string }>;
}

export function buildOpenClawExtras(bellaUserId?: string | null): OpenClawChatExtras {
  return { bellaUserId: bellaUserId || null };
}
