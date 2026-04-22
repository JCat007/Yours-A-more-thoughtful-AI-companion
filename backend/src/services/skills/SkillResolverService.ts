import fs from 'fs';
import path from 'path';
import type { AgentFramework } from '../authService';
import { getFrameworkSkillStore, readSkillBridgeIndex, writeSkillBridgeIndex } from './SkillBridgeIndexService';
import { syncSkillBridgeIndex } from './SkillSyncService';

export type SkillResolution = {
  requestedSkill: string;
  resolvedRuntime: AgentFramework | null;
  resolvedSkillName: string;
  reason: 'user_pinned' | 'framework_native' | 'last_successful_runtime' | 'latest_updated' | 'unresolved';
};

function hasNativeSkill(framework: AgentFramework, skillName: string): boolean {
  return fs.existsSync(path.join(getFrameworkSkillStore(framework), skillName));
}

function envPinnedRuntime(skillName: string): AgentFramework | null {
  const key = `BELLA_SKILL_PIN_${skillName.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`;
  const val = String(process.env[key] || '').trim().toLowerCase();
  if (val === 'openclaw' || val === 'hermes') return val;
  return null;
}

export function resolveSkillRuntime(currentFramework: AgentFramework, skillName: string): SkillResolution {
  const records = syncSkillBridgeIndex().filter((r) => r.skillName === skillName || r.targetMapping === skillName);
  const pinned = envPinnedRuntime(skillName);
  if (pinned && hasNativeSkill(pinned, skillName)) {
    return { requestedSkill: skillName, resolvedRuntime: pinned, resolvedSkillName: skillName, reason: 'user_pinned' };
  }
  if (hasNativeSkill(currentFramework, skillName)) {
    return {
      requestedSkill: skillName,
      resolvedRuntime: currentFramework,
      resolvedSkillName: skillName,
      reason: 'framework_native',
    };
  }

  const withLast = records.find((r) => r.lastSuccessfulRuntime && hasNativeSkill(r.lastSuccessfulRuntime, r.skillName));
  if (withLast?.lastSuccessfulRuntime) {
    return {
      requestedSkill: skillName,
      resolvedRuntime: withLast.lastSuccessfulRuntime,
      resolvedSkillName: withLast.skillName,
      reason: 'last_successful_runtime',
    };
  }

  const newest = [...records].sort((a, b) => b.mtime - a.mtime)[0];
  if (newest && hasNativeSkill(newest.source, newest.skillName)) {
    return {
      requestedSkill: skillName,
      resolvedRuntime: newest.source,
      resolvedSkillName: newest.skillName,
      reason: 'latest_updated',
    };
  }

  return { requestedSkill: skillName, resolvedRuntime: null, resolvedSkillName: skillName, reason: 'unresolved' };
}

export function markSkillRuntimeSuccess(skillName: string, runtime: AgentFramework) {
  const payload = readSkillBridgeIndex();
  let changed = false;
  for (const r of payload.records) {
    if (r.skillName === skillName || r.targetMapping === skillName) {
      if (r.lastSuccessfulRuntime !== runtime) {
        r.lastSuccessfulRuntime = runtime;
        changed = true;
      }
    }
  }
  if (changed) writeSkillBridgeIndex(payload.records);
}
