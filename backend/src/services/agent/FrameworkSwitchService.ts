import { getUserAgentConfig, type AgentFramework, type ContextStrategy, updateUserSettings } from '../authService';
import { getPendingBackgroundWrites } from '../companionMemoryQueue';
import { getGbrainRuntimeSnapshot } from '../gbrainCli';
import { migrateUserContext } from './context/ContextMigrationService';
import { getInFlightChatRequestsForUser } from './frameworkSwitchGate';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export type FrameworkSwitchErrorCode =
  | 'SWITCH_BLOCKED_NOT_IDLE'
  | 'SWITCH_TARGET_SAME_AS_CURRENT'
  | 'SWITCH_CONTEXT_EXPORT_FAILED'
  | 'SWITCH_CONTEXT_IMPORT_FAILED'
  | 'SWITCH_HERMES_MIGRATION_FAILED'
  | 'SWITCH_INTERNAL_ERROR';

export type FrameworkSwitchMode = 'full_migrate' | 'runtime_only';

export type FrameworkMigrationReport = {
  mode: FrameworkSwitchMode;
  attempted: boolean;
  command?: string;
  durationMs?: number;
  stdoutTail?: string;
  stderrTail?: string;
  followUps?: string[];
};

export type FrameworkSwitchBlockedResult = {
  ok: false;
  code: FrameworkSwitchErrorCode;
  message: string;
  blocking?: { activeJobs: number; inFlightRequests?: number };
};

export type FrameworkSwitchSuccessResult = {
  ok: true;
  framework: AgentFramework;
  switchMode: FrameworkSwitchMode;
  contextStrategy: ContextStrategy;
  migration: {
    strategy: ContextStrategy;
    turnsMigrated: number;
    summaryIncluded: boolean;
  };
  frameworkMigration?: FrameworkMigrationReport;
  observability?: {
    pendingBackgroundWrites: number;
    gbrainRuntimeStable: boolean;
  };
};

export type FrameworkSwitchResult = FrameworkSwitchSuccessResult | FrameworkSwitchBlockedResult;

function normalizeFramework(v: unknown): AgentFramework | null {
  if (v === 'openclaw' || v === 'hermes') return v;
  return null;
}

function normalizeContextStrategy(v: unknown): ContextStrategy | null {
  if (v === 'last_20_turns' || v === 'full_with_summary') return v;
  return null;
}

function normalizeSwitchMode(v: unknown): FrameworkSwitchMode {
  return v === 'runtime_only' ? 'runtime_only' : 'full_migrate';
}

function trimTail(text: string, max = 2000): string {
  const normalized = String(text || '').trim();
  if (!normalized) return '';
  return normalized.length <= max ? normalized : normalized.slice(-max);
}

function getCanonicalSoulPath(): string {
  return path.join(__dirname, '../../../docs/templates/Bella-SOUL.md');
}

function getOpenClawWorkspaceCandidatesForSync(): string[] {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const agentId = (process.env.OPENCLAW_AGENT_ID || 'main').trim();
  const envWorkspace = (process.env.OPENCLAW_WORKSPACE || '').trim();
  const baseRoot = path.join(home, '.openclaw');
  const list = [
    envWorkspace,
    path.join(baseRoot, `workspace-${agentId}`),
    path.join(baseRoot, 'workspace-main'),
    path.join(baseRoot, 'workspace'),
  ].filter(Boolean);
  return Array.from(new Set(list));
}

function syncCanonicalSoulToOpenClawWorkspaces(): {
  ok: boolean;
  appliedCount: number;
  targets: string[];
  error?: string;
} {
  const source = getCanonicalSoulPath();
  if (!fs.existsSync(source)) {
    return { ok: false, appliedCount: 0, targets: [], error: `Canonical SOUL template not found: ${source}` };
  }
  const soulText = fs.readFileSync(source, 'utf8');
  const workspaces = getOpenClawWorkspaceCandidatesForSync();
  const targets: string[] = [];
  for (const ws of workspaces) {
    const dest = path.join(ws, 'SOUL.md');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, soulText, 'utf8');
    targets.push(dest);
  }
  return { ok: true, appliedCount: targets.length, targets };
}

function shellQuoteSingle(value: string): string {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function resolveHermesMigrateCommandParts(commandArgs: string[]): {
  command: string;
  args: string[];
  displayCommand: string;
  triedHints: string[];
} {
  const explicit = String(process.env.BELLA_HERMES_MIGRATE_CMD || '').trim();
  if (explicit) {
    const full = `${explicit} ${commandArgs.map(shellQuoteSingle).join(' ')}`.trim();
    return {
      command: '/bin/bash',
      args: ['-lc', full],
      displayCommand: full,
      triedHints: [`BELLA_HERMES_MIGRATE_CMD=${explicit}`],
    };
  }
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const candidates = [
    String(process.env.HERMES_BIN || '').trim(),
    home ? path.join(home, '.local', 'bin', 'hermes') : '',
    home ? path.join(home, '.npm-global', 'bin', 'hermes') : '',
    'hermes',
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  for (const c of candidates) {
    if (c === 'hermes' || fs.existsSync(c)) {
      return {
        command: c,
        args: commandArgs,
        displayCommand: `${c} ${commandArgs.map(shellQuoteSingle).join(' ')}`.trim(),
        triedHints: candidates,
      };
    }
  }
  return {
    command: 'hermes',
    args: commandArgs,
    displayCommand: `hermes ${commandArgs.map(shellQuoteSingle).join(' ')}`.trim(),
    triedHints: candidates,
  };
}

async function runHermesOpenClawMigration(args: {
  migrateSecrets: boolean;
  workspaceTarget?: string;
}): Promise<{
  ok: boolean;
  command: string;
  stdoutTail: string;
  stderrTail: string;
  durationMs: number;
  error?: string;
}> {
  const commandArgs = ['claw', 'migrate', '--yes', '--preset', args.migrateSecrets ? 'full' : 'user-data'];
  const target = String(args.workspaceTarget || '').trim();
  if (target) {
    commandArgs.push('--workspace-target', target);
  }
  const resolved = resolveHermesMigrateCommandParts(commandArgs);
  const command = resolved.displayCommand;
  const timeoutMs = Math.max(60_000, Number(process.env.BELLA_SWITCH_MIGRATE_TIMEOUT_MS || 600_000));
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const child = spawn(resolved.command, resolved.args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    if (child.stdout) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
    }
    if (child.stderr) {
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
    }
    const timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      resolve({
        ok: false,
        command,
        stdoutTail: trimTail(stdout),
        stderrTail: trimTail(stderr),
        durationMs: Date.now() - startedAt,
        error: `Hermes migration timeout after ${timeoutMs}ms`,
      });
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      const hint =
        error.message.includes('ENOENT')
          ? `Hermes migrate command not found. Set BELLA_HERMES_MIGRATE_CMD (or ensure one of these exists in PATH): ${resolved.triedHints.join(', ')}`
          : '';
      resolve({
        ok: false,
        command,
        stdoutTail: trimTail(stdout),
        stderrTail: trimTail(stderr),
        durationMs: Date.now() - startedAt,
        error: `Failed to start hermes migrate: ${error.message}${hint ? `\n${hint}` : ''}`,
      });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const stdoutTail = trimTail(stdout);
      const stderrTail = trimTail(stderr);
      if (code === 0) {
        resolve({
          ok: true,
          command,
          stdoutTail,
          stderrTail,
          durationMs: Date.now() - startedAt,
        });
        return;
      }
      const msg = stderrTail || stdoutTail || `hermes claw migrate exited with code ${code ?? -1}`;
      resolve({
        ok: false,
        command,
        stdoutTail,
        stderrTail,
        durationMs: Date.now() - startedAt,
        error: msg,
      });
    });
  });
}

export async function switchUserFramework(args: {
  userId: string;
  targetFramework: unknown;
  contextStrategy: unknown;
  activeJobs: number;
  switchMode?: unknown;
  migrateSecrets?: boolean;
  workspaceTarget?: string;
}): Promise<FrameworkSwitchResult> {
  const switchTrace = {
    userId: args.userId,
    targetFramework: String(args.targetFramework || ''),
    contextStrategy: String(args.contextStrategy || ''),
    activeJobs: args.activeJobs,
    switchMode: String(args.switchMode || 'full_migrate'),
    migrateSecrets: args.migrateSecrets !== false,
  };
  const nextFramework = normalizeFramework(args.targetFramework);
  const nextStrategy = normalizeContextStrategy(args.contextStrategy);
  const switchMode = normalizeSwitchMode(args.switchMode);
  const migrateSecrets = args.migrateSecrets !== false;
  const workspaceTarget = String(args.workspaceTarget || '').trim() || undefined;
  const gbrainBefore = getGbrainRuntimeSnapshot();
  if (!nextFramework || !nextStrategy) {
    console.warn('[agent.framework.switch.invalid_input]', switchTrace);
    return {
      ok: false,
      code: 'SWITCH_INTERNAL_ERROR',
      message: 'Invalid framework switch input.',
    };
  }

  const current = await getUserAgentConfig(args.userId);
  if (current.framework === nextFramework) {
    console.info('[agent.framework.switch.skipped_same_target]', {
      ...switchTrace,
      currentFramework: current.framework,
    });
    return {
      ok: false,
      code: 'SWITCH_TARGET_SAME_AS_CURRENT',
      message: 'Target framework is the same as current.',
    };
  }

  const inFlightRequests = getInFlightChatRequestsForUser(args.userId);
  if (args.activeJobs > 0 || inFlightRequests > 0) {
    console.info('[agent.framework.switch.blocked_not_idle]', {
      ...switchTrace,
      currentFramework: current.framework,
      inFlightRequests,
    });
    return {
      ok: false,
      code: 'SWITCH_BLOCKED_NOT_IDLE',
      message: 'Current task is still running.',
      blocking: { activeJobs: args.activeJobs, inFlightRequests },
    };
  }

  let migration;
  let frameworkMigration: FrameworkMigrationReport | undefined;
  try {
    console.info('[agent.framework.switch.migration_start]', {
      ...switchTrace,
      sourceFramework: current.framework,
      targetFramework: nextFramework,
      strategy: nextStrategy,
    });
    migration = await migrateUserContext({
      userId: args.userId,
      sourceFramework: current.framework,
      targetFramework: nextFramework,
      strategy: nextStrategy,
    });
    console.info('[agent.framework.switch.migration_done]', {
      ...switchTrace,
      sourceFramework: current.framework,
      targetFramework: nextFramework,
      migration,
    });
  } catch (error: any) {
    const msg = String(error?.message || '');
    console.error('[agent.framework.switch.migration_failed]', {
      ...switchTrace,
      sourceFramework: current.framework,
      targetFramework: nextFramework,
      error: msg,
    });
    return {
      ok: false,
      code: /export/i.test(msg) ? 'SWITCH_CONTEXT_EXPORT_FAILED' : 'SWITCH_CONTEXT_IMPORT_FAILED',
      message: msg || 'Failed to migrate context during framework switch.',
    };
  }

  if (switchMode === 'full_migrate' && current.framework === 'openclaw' && nextFramework === 'hermes') {
    const migrationResult = await runHermesOpenClawMigration({
      migrateSecrets,
      workspaceTarget,
    });
    frameworkMigration = {
      mode: switchMode,
      attempted: true,
      command: migrationResult.command,
      durationMs: migrationResult.durationMs,
      stdoutTail: migrationResult.stdoutTail,
      stderrTail: migrationResult.stderrTail,
      followUps: [
        'Review Hermes migration output for archived items (e.g. HEARTBEAT.md / TOOLS.md).',
        'Start a new Hermes session so imported skills and memory are loaded.',
      ],
    };
    if (!migrationResult.ok) {
      console.error('[agent.framework.switch.hermes_migration_failed]', {
        ...switchTrace,
        sourceFramework: current.framework,
        targetFramework: nextFramework,
        command: migrationResult.command,
        error: migrationResult.error,
      });
      return {
        ok: false,
        code: 'SWITCH_HERMES_MIGRATION_FAILED',
        message: migrationResult.error || 'Hermes migration failed.',
      };
    }
  } else if (switchMode === 'full_migrate' && current.framework === 'hermes' && nextFramework === 'openclaw') {
    const syncResult = syncCanonicalSoulToOpenClawWorkspaces();
    frameworkMigration = {
      mode: switchMode,
      attempted: true,
      durationMs: 0,
      followUps: syncResult.ok
        ? [
            `Synced SOUL.md to ${syncResult.appliedCount} OpenClaw workspace target(s).`,
            'Restart OpenClaw gateway if it is already running to pick up updated SOUL.',
          ]
        : ['SOUL sync failed; framework switch was not committed.'],
    };
    if (!syncResult.ok) {
      console.error('[agent.framework.switch.openclaw_soul_sync_failed]', {
        ...switchTrace,
        sourceFramework: current.framework,
        targetFramework: nextFramework,
        error: syncResult.error,
      });
      return {
        ok: false,
        code: 'SWITCH_INTERNAL_ERROR',
        message: syncResult.error || 'Failed to sync SOUL.md into OpenClaw workspace.',
      };
    }
  } else {
    frameworkMigration = {
      mode: switchMode,
      attempted: false,
      followUps:
        switchMode === 'runtime_only'
          ? ['Runtime-only switch: OpenClaw/Hermes files were not migrated.']
          : ['No framework file migration required for this direction.'],
    };
  }

  await updateUserSettings(args.userId, {
    agentFramework: nextFramework,
    contextStrategyDefault: nextStrategy,
  });
  const gbrainAfter = getGbrainRuntimeSnapshot();
  const gbrainRuntimeStable = JSON.stringify(gbrainBefore) === JSON.stringify(gbrainAfter);
  const pendingBackgroundWrites = getPendingBackgroundWrites(args.userId);
  console.info('[agent.framework.switch.success]', {
    ...switchTrace,
    sourceFramework: current.framework,
    targetFramework: nextFramework,
    migration,
    pendingBackgroundWrites,
    gbrainRuntimeStable,
    gbrainBefore,
    gbrainAfter,
  });

  return {
    ok: true,
    framework: nextFramework,
    switchMode,
    contextStrategy: nextStrategy,
    migration: {
      strategy: migration.strategy,
      turnsMigrated: migration.turnsMigrated,
      summaryIncluded: migration.summaryIncluded,
    },
    frameworkMigration,
    observability: {
      pendingBackgroundWrites,
      gbrainRuntimeStable,
    },
  };
}
