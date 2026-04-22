import fs from 'fs';
import os from 'os';
import path from 'path';
import '../loadEnv';
import { SmokeReporter } from './lib/smokeReport';
import { switchUserFramework } from '../services/agent/FrameworkSwitchService';
import { registerUser } from '../services/authService';
import prisma from '../prisma';
import {
  __testOnlyGetDownloadableMetaForSmoke,
  __testOnlyRegisterDownloadableForSmoke,
} from '../routes/assistant';

const reporter = new SmokeReporter('file-download-switch-smoke');

function assertOk(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function run() {
  if (!String(process.env.DATABASE_URL || '').trim()) {
    throw new Error('DATABASE_URL is required for file-download-switch smoke test');
  }

  const ts = Date.now();
  const username = `phase9-file-${ts}`;
  const password = `P@ss-${ts}`;
  const user = await registerUser(username, password);
  const userId = user.id;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bella-file-download-smoke-'));
  const samplePath = path.join(tmpDir, 'report.txt');
  const sampleContent = `file-download-smoke-${ts}`;
  fs.writeFileSync(samplePath, sampleContent, 'utf8');

  let downloadId = '';
  try {
    await reporter.runCase('register_downloadable_before_switch', async () => {
      const meta = __testOnlyRegisterDownloadableForSmoke(samplePath, 'report.txt', 'text/plain');
      downloadId = meta.id;
      assertOk(!!downloadId, 'download id should be generated');
      assertOk(meta.size === Buffer.byteLength(sampleContent, 'utf8'), 'registered size mismatch');
      return { id: meta.id, size: meta.size, name: meta.originalName };
    });

    await reporter.runCase('switch_to_hermes_keeps_downloadable', async () => {
      const switched = await switchUserFramework({
        userId,
        targetFramework: 'hermes',
        contextStrategy: 'last_20_turns',
        activeJobs: 0,
        switchMode: 'runtime_only',
      });
      assertOk(switched.ok, 'switch to hermes should succeed');
      const metaAfter = __testOnlyGetDownloadableMetaForSmoke(downloadId);
      assertOk(!!metaAfter, 'downloadable metadata should remain after switch');
      assertOk(metaAfter?.fullPath === samplePath, 'download path changed unexpectedly');
      assertOk(fs.existsSync(metaAfter!.fullPath), 'downloadable file should still exist');
      return {
        framework: switched.ok ? switched.framework : 'unknown',
        downloadExists: !!metaAfter,
      };
    });

    await reporter.runCase('switch_back_to_openclaw_keeps_downloadable', async () => {
      const switched = await switchUserFramework({
        userId,
        targetFramework: 'openclaw',
        contextStrategy: 'full_with_summary',
        activeJobs: 0,
      });
      assertOk(switched.ok, 'switch back to openclaw should succeed');
      const metaAfter = __testOnlyGetDownloadableMetaForSmoke(downloadId);
      assertOk(!!metaAfter, 'downloadable metadata should remain after second switch');
      assertOk(fs.readFileSync(metaAfter!.fullPath, 'utf8') === sampleContent, 'downloadable file content changed');
      return {
        framework: switched.ok ? switched.framework : 'unknown',
        downloadExists: !!metaAfter,
      };
    });

    reporter.printSuccess({ userId, downloadId });
  } finally {
    await prisma.bellaUser.deleteMany({ where: { id: userId } });
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

run().catch((err) => {
  reporter.printFailure(err);
  process.exit(1);
});
