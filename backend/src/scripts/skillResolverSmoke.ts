import fs from 'fs';
import os from 'os';
import path from 'path';
import { SmokeReporter } from './lib/smokeReport';
import { markSkillRuntimeSuccess, resolveSkillRuntime } from '../services/skills/SkillResolverService';
import { readSkillBridgeIndex } from '../services/skills/SkillBridgeIndexService';

const reporter = new SmokeReporter('skill-resolver-smoke');

function assertOk(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function ensureSkillDir(rootHome: string, framework: 'openclaw' | 'hermes', skillName: string) {
  const p = path.join(rootHome, '.openclaw', 'skills', framework, skillName);
  fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(p, 'SKILL.md'), `# ${skillName}\n`, 'utf8');
  return p;
}

async function run() {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bella-skill-resolver-smoke-'));
  const prevHome = process.env.HOME;
  const prevUserProfile = process.env.USERPROFILE;
  const pinKey = 'BELLA_SKILL_PIN_ALPHA_SKILL';
  const prevPin = process.env[pinKey];
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;

  try {
    const openclawAlpha = ensureSkillDir(tmpHome, 'openclaw', 'alpha-skill');
    const hermesAlpha = ensureSkillDir(tmpHome, 'hermes', 'alpha-skill');
    const hermesBeta = ensureSkillDir(tmpHome, 'hermes', 'beta-skill');

    await reporter.runCase('framework_native_priority', async () => {
      const r = resolveSkillRuntime('openclaw', 'alpha-skill');
      assertOk(r.reason === 'framework_native', `expected framework_native, got ${r.reason}`);
      assertOk(r.resolvedRuntime === 'openclaw', `expected openclaw, got ${r.resolvedRuntime}`);
      return r;
    });

    await reporter.runCase('user_pinned_priority', async () => {
      process.env[pinKey] = 'hermes';
      const r = resolveSkillRuntime('openclaw', 'alpha-skill');
      assertOk(r.reason === 'user_pinned', `expected user_pinned, got ${r.reason}`);
      assertOk(r.resolvedRuntime === 'hermes', `expected hermes, got ${r.resolvedRuntime}`);
      return r;
    });
    if (typeof prevPin === 'string') process.env[pinKey] = prevPin;
    else delete process.env[pinKey];

    await reporter.runCase('last_successful_runtime_priority', async () => {
      fs.rmSync(openclawAlpha, { recursive: true, force: true });
      markSkillRuntimeSuccess('alpha-skill', 'hermes');
      const r = resolveSkillRuntime('openclaw', 'alpha-skill');
      assertOk(r.reason === 'last_successful_runtime', `expected last_successful_runtime, got ${r.reason}`);
      assertOk(r.resolvedRuntime === 'hermes', `expected hermes, got ${r.resolvedRuntime}`);
      return r;
    });

    await reporter.runCase('latest_updated_fallback_priority', async () => {
      const now = Date.now();
      fs.utimesSync(hermesAlpha, new Date(now - 20000), new Date(now - 20000));
      fs.utimesSync(hermesBeta, new Date(now), new Date(now));
      const r = resolveSkillRuntime('openclaw', 'beta-skill');
      assertOk(r.reason === 'latest_updated', `expected latest_updated for beta-skill, got ${r.reason}`);
      assertOk(r.resolvedRuntime === 'hermes', `expected hermes, got ${r.resolvedRuntime}`);
      return r;
    });

    await reporter.runCase('mark_success_persists_to_index', async () => {
      markSkillRuntimeSuccess('alpha-skill', 'hermes');
      const index = readSkillBridgeIndex();
      const matched = index.records.filter((x) => x.skillName === 'alpha-skill');
      assertOk(matched.length > 0, 'expected alpha-skill records in bridge index');
      assertOk(
        matched.some((x) => x.lastSuccessfulRuntime === 'hermes'),
        'expected at least one alpha-skill record with lastSuccessfulRuntime=hermes'
      );
      return { records: matched.length, hasHermes: matched.some((x) => x.lastSuccessfulRuntime === 'hermes') };
    });

    reporter.printSuccess({ tmpHome });
  } finally {
    if (typeof prevHome === 'string') process.env.HOME = prevHome;
    else delete process.env.HOME;
    if (typeof prevUserProfile === 'string') process.env.USERPROFILE = prevUserProfile;
    else delete process.env.USERPROFILE;
    if (typeof prevPin === 'string') process.env[pinKey] = prevPin;
    else delete process.env[pinKey];
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
}

run().catch((err) => {
  reporter.printFailure(err);
  process.exit(1);
});
