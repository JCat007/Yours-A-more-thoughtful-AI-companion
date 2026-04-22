import type { AgentAdapter, AgentChatParams, CanonicalSessionState } from './AgentAdapter';
import { runHermesQuery } from '../hermesRuntime';
import { getSessionTurns, setSessionTurns } from '../../bellaState';

export class HermesAdapter implements AgentAdapter {
  readonly framework = 'hermes' as const;

  async chat(params: AgentChatParams): Promise<string> {
    const lastUser = [...params.messages].reverse().find((m) => m.role === 'user')?.content?.trim() || '';
    if (!lastUser) return 'Hermes received an empty user message.';
    const result = await runHermesQuery(lastUser);
    if (!result.ok) {
      throw new Error(result.error || 'Hermes execution failed');
    }
    if (!result.output) {
      throw new Error('Hermes returned empty output');
    }
    return result.output;
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
    const result = await runHermesQuery('Reply with one short line: "Hermes health ok".');
    return result.ok
      ? { ok: true }
      : { ok: false, message: result.error || 'Hermes health check failed' };
  }
}
