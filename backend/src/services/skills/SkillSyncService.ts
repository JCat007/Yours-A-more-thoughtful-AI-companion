import type { AgentFramework } from '../authService';
import {
  listFrameworkNativeSkills,
  readSkillBridgeIndex,
  writeSkillBridgeIndex,
  type SkillBridgeIndexRecord,
} from './SkillBridgeIndexService';

export function syncSkillBridgeIndex(): SkillBridgeIndexRecord[] {
  const existing = readSkillBridgeIndex().records;
  const byKey = new Map<string, SkillBridgeIndexRecord>();
  for (const r of existing) byKey.set(`${r.source}:${r.skillName}`, r);

  const frameworks: AgentFramework[] = ['openclaw', 'hermes'];
  for (const fw of frameworks) {
    for (const n of listFrameworkNativeSkills(fw)) {
      const k = `${fw}:${n.skillName}`;
      const prev = byKey.get(k);
      byKey.set(k, {
        skillName: n.skillName,
        source: fw,
        targetMapping: prev?.targetMapping || n.skillName,
        conflictGroup: prev?.conflictGroup || n.skillName,
        mtime: n.mtime,
        lastSuccessfulRuntime: prev?.lastSuccessfulRuntime,
      });
    }
  }

  const records = Array.from(byKey.values()).sort((a, b) =>
    `${a.skillName}:${a.source}`.localeCompare(`${b.skillName}:${b.source}`)
  );
  writeSkillBridgeIndex(records);
  return records;
}
