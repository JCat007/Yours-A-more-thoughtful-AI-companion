import type { ContextStrategy } from '../../authService';
import type { CanonicalSessionState } from '../adapters/AgentAdapter';

export type CanonicalContextPayload = {
  recentTurns: CanonicalSessionState['recentTurns'];
  summary?: string;
  fileReferences?: string[];
  memoryPointers?: string[];
};

export function toCanonicalContext(
  strategy: ContextStrategy,
  source: CanonicalSessionState
): CanonicalContextPayload {
  const turns = source.recentTurns || [];
  if (strategy === 'last_20_turns') {
    return {
      recentTurns: turns.slice(-20),
      fileReferences: source.fileReferences || [],
      memoryPointers: source.memoryPointers || [],
    };
  }
  const clipped = turns.slice(-60);
  const summary = buildLightweightSummary(turns.slice(0, -20));
  return {
    recentTurns: clipped,
    summary: summary || source.summary,
    fileReferences: source.fileReferences || [],
    memoryPointers: source.memoryPointers || [],
  };
}

function buildLightweightSummary(olderTurns: CanonicalSessionState['recentTurns']): string | undefined {
  if (!olderTurns || olderTurns.length === 0) return undefined;
  const first = olderTurns[0]?.content?.trim() || '';
  const last = olderTurns[olderTurns.length - 1]?.content?.trim() || '';
  const firstText = first.slice(0, 120);
  const lastText = last.slice(0, 120);
  return `History summary (${olderTurns.length} turns): started with "${firstText}" and most recently discussed "${lastText}".`;
}
