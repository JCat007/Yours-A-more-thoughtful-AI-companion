import { chatWithAssistant } from '../../assistant';
import type { AgentAdapter, AgentChatParams, CanonicalSessionState } from './AgentAdapter';
import { buildOpenClawExtras } from './AgentAdapter';
import { getSessionTurns, setSessionTurns } from '../../bellaState';

export class OpenClawAdapter implements AgentAdapter {
  readonly framework = 'openclaw' as const;

  async chat(params: AgentChatParams): Promise<string> {
    return chatWithAssistant(
      params.messages,
      '',
      undefined,
      params.mode,
      params.agentId,
      undefined,
      undefined,
      buildOpenClawExtras(params.bellaUserId)
    );
  }

  async exportSessionState(_sessionId: string): Promise<CanonicalSessionState> {
    const turns = getSessionTurns(_sessionId).map((t) => ({ role: t.role, content: t.content }));
    return { recentTurns: turns };
  }

  async importSessionState(_sessionId: string, _payload: CanonicalSessionState): Promise<void> {
    const turns = (_payload.recentTurns || [])
      .filter((t) => t.role === 'user' || t.role === 'assistant')
      .map((t) => ({ role: t.role as 'user' | 'assistant', content: t.content, ts: Date.now() }));
    setSessionTurns(_sessionId, turns);
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    return { ok: true };
  }
}
