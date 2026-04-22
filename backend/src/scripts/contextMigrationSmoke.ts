import { migrateUserContext } from '../services/agent/context/ContextMigrationService';
import { getSessionTurns, setSessionTurns } from '../services/bellaState';
import { SmokeReporter } from './lib/smokeReport';
const reporter = new SmokeReporter('context-migration-smoke');

function assertOk(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function run() {
  const userId = `phase5-smoke-${Date.now()}`;
  const sessionA = `china:user:${userId}`;
  const sessionB = `world:user:${userId}`;

  const baseTurns = Array.from({ length: 28 }).map((_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: `turn-${i + 1}`,
    ts: Date.now() - (28 - i) * 1000,
  }));
  setSessionTurns(sessionA, baseTurns);
  setSessionTurns(sessionB, baseTurns.slice(0, 10));

  const r1 = await reporter.runCase('strategy:last_20_turns', async () => {
    const result = await migrateUserContext({
      userId,
      sourceFramework: 'openclaw',
      targetFramework: 'hermes',
      strategy: 'last_20_turns',
    });
    return {
      strategy: result.strategy,
      turnsMigrated: result.turnsMigrated,
      summaryIncluded: result.summaryIncluded,
      migratedSessions: result.migratedSessions,
    };
  });
  const sA1 = getSessionTurns(sessionA);
  const sB1 = getSessionTurns(sessionB);
  assertOk(r1.strategy === 'last_20_turns', 'strategy mismatch for last_20_turns');
  assertOk(r1.summaryIncluded === false, 'last_20_turns should not include summary');
  assertOk(r1.migratedSessions === 2, `expected migratedSessions=2, got ${r1.migratedSessions}`);
  assertOk(sA1.length <= 20, `sessionA expected <=20 turns, got ${sA1.length}`);
  assertOk(sB1.length <= 20, `sessionB expected <=20 turns, got ${sB1.length}`);

  const r2 = await reporter.runCase('strategy:full_with_summary', async () => {
    const result = await migrateUserContext({
      userId,
      sourceFramework: 'hermes',
      targetFramework: 'openclaw',
      strategy: 'full_with_summary',
    });
    return {
      strategy: result.strategy,
      turnsMigrated: result.turnsMigrated,
      summaryIncluded: result.summaryIncluded,
      migratedSessions: result.migratedSessions,
    };
  });
  const sA2 = getSessionTurns(sessionA);
  const sB2 = getSessionTurns(sessionB);
  assertOk(r2.strategy === 'full_with_summary', 'strategy mismatch for full_with_summary');
  assertOk(r2.migratedSessions === 2, `expected migratedSessions=2, got ${r2.migratedSessions}`);
  assertOk(sA2.length <= 60, `sessionA expected <=60 turns, got ${sA2.length}`);
  assertOk(sB2.length <= 60, `sessionB expected <=60 turns, got ${sB2.length}`);

  reporter.printSuccess({
    userId,
    phase5: {
      last20: r1,
      fullWithSummary: r2,
    },
  });
}

run().catch((err) => {
  reporter.printFailure(err);
  process.exit(1);
});
