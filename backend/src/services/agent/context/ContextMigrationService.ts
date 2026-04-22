import type { AgentFramework, ContextStrategy } from '../../authService';
import { listSessionKeysByUserId } from '../../bellaState';
import { agentRuntimeRouter } from '../AgentRuntimeRouter';
import { toCanonicalContext } from './CanonicalContext';

export type ContextMigrationResult = {
  strategy: ContextStrategy;
  turnsMigrated: number;
  summaryIncluded: boolean;
  migratedSessions: number;
};

export async function migrateUserContext(args: {
  userId: string;
  sourceFramework: AgentFramework;
  targetFramework: AgentFramework;
  strategy: ContextStrategy;
}): Promise<ContextMigrationResult> {
  const sessionKeys = listSessionKeysByUserId(args.userId);
  if (sessionKeys.length === 0) {
    return {
      strategy: args.strategy,
      turnsMigrated: 0,
      summaryIncluded: args.strategy === 'full_with_summary',
      migratedSessions: 0,
    };
  }

  const sourceAdapter = agentRuntimeRouter.getAdapter(args.sourceFramework);
  const targetAdapter = agentRuntimeRouter.getAdapter(args.targetFramework);
  let turnsMigrated = 0;
  let summaryIncluded = false;

  for (const sessionKey of sessionKeys) {
    const exported = await sourceAdapter.exportSessionState(sessionKey);
    const canonical = toCanonicalContext(args.strategy, exported);
    await targetAdapter.importSessionState(sessionKey, canonical);
    turnsMigrated += canonical.recentTurns.length;
    if (canonical.summary) summaryIncluded = true;
  }

  return {
    strategy: args.strategy,
    turnsMigrated,
    summaryIncluded,
    migratedSessions: sessionKeys.length,
  };
}
