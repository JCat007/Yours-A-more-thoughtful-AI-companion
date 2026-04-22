import fs from 'fs';
import os from 'os';
import path from 'path';
import '../loadEnv';
import { SmokeReporter } from './lib/smokeReport';
import { markUserChatRequestFinished, markUserChatRequestStarted } from '../services/agent/frameworkSwitchGate';

const reporter = new SmokeReporter('framework-switch-smoke');

function assertOk(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function run() {
  if (!String(process.env.DATABASE_URL || '').trim()) {
    throw new Error('DATABASE_URL is required for framework switch smoke test');
  }

  const ts = Date.now();
  process.env.BELLA_MEMORY_TURNS = process.env.BELLA_MEMORY_TURNS || '120';
  process.env.BELLA_MEMORY_FILE =
    process.env.BELLA_MEMORY_FILE || path.join(os.tmpdir(), `bella-state-phase9-${ts}.json`);

  const prisma = (await import('../prisma')).default;
  const { registerUser, getUserAgentConfig } = await import('../services/authService');
  const { __testOnlySetPendingBackgroundWrites } = await import('../services/companionMemoryQueue');
  const { setSessionTurns, getSessionTurns } = await import('../services/bellaState');
  const { switchUserFramework } = await import('../services/agent/FrameworkSwitchService');

  const username = `phase9-switch-${ts}`;
  const password = `P@ss-${ts}`;
  const user = await registerUser(username, password);
  const userId = user.id;
  let blocked:
    | { ok: false; code: string; message: string; blocking?: { activeJobs: number } }
    | undefined;
  let sameTarget:
    | { ok: false; code: string; message: string; blocking?: { activeJobs: number } }
    | undefined;
  let toHermes:
    | { ok: true; framework: 'hermes' | 'openclaw'; contextStrategy: 'last_20_turns' | 'full_with_summary'; migration: { strategy: 'last_20_turns' | 'full_with_summary'; turnsMigrated: number; summaryIncluded: boolean } }
    | undefined;
  let toOpenclaw:
    | { ok: true; framework: 'hermes' | 'openclaw'; contextStrategy: 'last_20_turns' | 'full_with_summary'; migration: { strategy: 'last_20_turns' | 'full_with_summary'; turnsMigrated: number; summaryIncluded: boolean } }
    | undefined;
  try {
    const sessionChina = `china:user:${userId}`;
    const sessionWorld = `world:user:${userId}`;
    const turns = Array.from({ length: 48 }).map((_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `phase9-turn-${i + 1}`,
      ts: Date.now() - (48 - i) * 1000,
    }));

    setSessionTurns(sessionChina, turns);
    setSessionTurns(sessionWorld, turns.slice(0, 30));

    blocked = await reporter.runCase('blocked_not_idle', async () => {
      const r = await switchUserFramework({
        userId,
        targetFramework: 'hermes',
        contextStrategy: 'last_20_turns',
        activeJobs: 1,
        switchMode: 'runtime_only',
      });
      assertOk(!r.ok, 'blocked case should return ok=false');
      if (r.ok) throw new Error('blocked case unexpectedly succeeded');
      assertOk(r.code === 'SWITCH_BLOCKED_NOT_IDLE', `unexpected blocked code: ${r.code}`);
      return { code: r.code, activeJobs: r.blocking?.activeJobs ?? 0 };
    }) as any;

    await reporter.runCase('blocked_in_flight_request', async () => {
      markUserChatRequestStarted(userId);
      try {
        const r = await switchUserFramework({
          userId,
          targetFramework: 'hermes',
          contextStrategy: 'last_20_turns',
          activeJobs: 0,
          switchMode: 'runtime_only',
        });
        assertOk(!r.ok, 'in-flight case should return ok=false');
        if (r.ok) throw new Error('in-flight case unexpectedly succeeded');
        assertOk(r.code === 'SWITCH_BLOCKED_NOT_IDLE', `unexpected in-flight code: ${r.code}`);
        assertOk((r.blocking?.inFlightRequests || 0) > 0, 'expected blocking.inFlightRequests > 0');
        return { code: r.code, inFlightRequests: r.blocking?.inFlightRequests || 0 };
      } finally {
        markUserChatRequestFinished(userId);
      }
    });

    sameTarget = await reporter.runCase('blocked_same_target', async () => {
      const r = await switchUserFramework({
        userId,
        targetFramework: 'openclaw',
        contextStrategy: 'last_20_turns',
        activeJobs: 0,
      });
      assertOk(!r.ok, 'same-target case should return ok=false');
      if (r.ok) throw new Error('same-target case unexpectedly succeeded');
      assertOk(r.code === 'SWITCH_TARGET_SAME_AS_CURRENT', `unexpected same-target code: ${r.code}`);
      return { code: r.code };
    }) as any;

    toHermes = await reporter.runCase('switch_to_hermes', async () => {
      const r = await switchUserFramework({
        userId,
        targetFramework: 'hermes',
        contextStrategy: 'last_20_turns',
        activeJobs: 0,
        switchMode: 'runtime_only',
      });
      assertOk(r.ok, 'switch to hermes should succeed');
      if (!r.ok) throw new Error('unreachable');
      assertOk(r.framework === 'hermes', `expected framework=hermes, got ${r.framework}`);
      assertOk(r.contextStrategy === 'last_20_turns', `expected strategy=last_20_turns, got ${r.contextStrategy}`);
      assertOk(r.migration.turnsMigrated > 0, 'expected turnsMigrated > 0');
      assertOk(
        getSessionTurns(sessionChina).length <= 20 && getSessionTurns(sessionWorld).length <= 20,
        'last_20_turns should cap migrated session turns to <=20'
      );
      return {
        framework: r.framework,
        contextStrategy: r.contextStrategy,
        migration: r.migration,
      };
    }) as any;

    await reporter.runCase('persisted_config_after_hermes', async () => {
      const cfg = await getUserAgentConfig(userId);
      assertOk(cfg.framework === 'hermes', 'user framework should persist as hermes');
      assertOk(
        cfg.contextStrategyDefault === 'last_20_turns',
        'context strategy default should persist as last_20_turns'
      );
      return cfg;
    });

    setSessionTurns(sessionChina, turns);
    setSessionTurns(sessionWorld, turns.slice(0, 30));
    __testOnlySetPendingBackgroundWrites(userId, 3);

    toOpenclaw = await reporter.runCase('switch_back_to_openclaw', async () => {
      const r = await switchUserFramework({
        userId,
        targetFramework: 'openclaw',
        contextStrategy: 'full_with_summary',
        activeJobs: 0,
      });
      assertOk(r.ok, 'switch back to openclaw should succeed');
      if (!r.ok) throw new Error('unreachable');
      assertOk(
        r.contextStrategy === 'full_with_summary',
        `expected strategy=full_with_summary, got ${r.contextStrategy}`
      );
      assertOk(typeof r.migration.summaryIncluded === 'boolean', 'summaryIncluded should be boolean');
      assertOk(
        (r.observability?.pendingBackgroundWrites || 0) === 3,
        `expected pendingBackgroundWrites=3, got ${r.observability?.pendingBackgroundWrites || 0}`
      );
      return {
        framework: r.framework,
        contextStrategy: r.contextStrategy,
        migration: r.migration,
        pendingBackgroundWrites: r.observability?.pendingBackgroundWrites || 0,
      };
    }) as any;
    __testOnlySetPendingBackgroundWrites(userId, 0);

    await reporter.runCase('canonical_full_with_summary_contains_summary', async () => {
      const { toCanonicalContext } = await import('../services/agent/context/CanonicalContext');
      const canonical = toCanonicalContext('full_with_summary', {
        recentTurns: Array.from({ length: 48 }).map((_, i) => ({
          role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant' | 'system',
          content: `canonical-turn-${i + 1}`,
        })),
      });
      assertOk(
        typeof canonical.summary === 'string' && canonical.summary.length > 0,
        'full_with_summary canonical payload should include generated summary for long history'
      );
      return { hasSummary: !!canonical.summary, recentTurns: canonical.recentTurns.length };
    });

    await reporter.runCase('persisted_config_after_openclaw', async () => {
      const cfg = await getUserAgentConfig(userId);
      assertOk(cfg.framework === 'openclaw', 'user framework should persist as openclaw');
      assertOk(
        cfg.contextStrategyDefault === 'full_with_summary',
        'context strategy default should persist as full_with_summary'
      );
      return cfg;
    });

    reporter.printSuccess({
      userId,
      blockedCode: blocked?.code,
      sameTargetCode: sameTarget?.code,
      toHermes: toHermes
        ? {
            framework: toHermes.framework,
            contextStrategy: toHermes.contextStrategy,
            migration: toHermes.migration,
          }
        : undefined,
      toOpenclaw: toOpenclaw
        ? {
            framework: toOpenclaw.framework,
            contextStrategy: toOpenclaw.contextStrategy,
            migration: toOpenclaw.migration,
          }
        : undefined,
    });
  } finally {
    await prisma.bellaUser.deleteMany({ where: { id: userId } });
    const stateFile = String(process.env.BELLA_MEMORY_FILE || '');
    if (stateFile && fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
  }
}

run().catch((err) => {
  reporter.printFailure(err);
  process.exit(1);
});
