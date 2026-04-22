import fs from 'fs';
import path from 'path';
import type { AgentFramework } from '../authService';

export type SkillBridgeIndexRecord = {
  skillName: string;
  source: AgentFramework;
  targetMapping?: string;
  conflictGroup?: string;
  mtime: number;
  lastSuccessfulRuntime?: AgentFramework;
};

type SkillBridgeIndexPayload = {
  version: 1;
  updatedAt: number;
  records: SkillBridgeIndexRecord[];
};

export function getSkillStoresRoot(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.openclaw', 'skills');
}

export function getFrameworkSkillStore(framework: AgentFramework): string {
  return path.join(getSkillStoresRoot(), framework);
}

function getBridgeIndexPath(): string {
  return path.join(getSkillStoresRoot(), 'bridge-index.json');
}

function ensureDualStores() {
  fs.mkdirSync(getFrameworkSkillStore('openclaw'), { recursive: true });
  fs.mkdirSync(getFrameworkSkillStore('hermes'), { recursive: true });
}

export function readSkillBridgeIndex(): SkillBridgeIndexPayload {
  ensureDualStores();
  const p = getBridgeIndexPath();
  if (!fs.existsSync(p)) return { version: 1, updatedAt: Date.now(), records: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as SkillBridgeIndexPayload;
    const records = Array.isArray(parsed?.records) ? parsed.records : [];
    return { version: 1, updatedAt: Number(parsed?.updatedAt) || Date.now(), records };
  } catch {
    return { version: 1, updatedAt: Date.now(), records: [] };
  }
}

export function writeSkillBridgeIndex(records: SkillBridgeIndexRecord[]) {
  ensureDualStores();
  const p = getBridgeIndexPath();
  const payload: SkillBridgeIndexPayload = { version: 1, updatedAt: Date.now(), records };
  fs.writeFileSync(p, JSON.stringify(payload, null, 2), 'utf8');
}

export function listFrameworkNativeSkills(framework: AgentFramework): Array<{ skillName: string; mtime: number }> {
  ensureDualStores();
  const dir = getFrameworkSkillStore(framework);
  if (!fs.existsSync(dir)) return [];
  const out: Array<{ skillName: string; mtime: number }> = [];
  for (const de of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!de.isDirectory()) continue;
    const full = path.join(dir, de.name);
    const st = fs.statSync(full);
    out.push({ skillName: de.name, mtime: st.mtimeMs });
  }
  return out;
}
