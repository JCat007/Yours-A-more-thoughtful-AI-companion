import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

type SmokePayload = {
  suiteId: string;
  status: 'passed' | 'failed';
  totalDurationMs: number;
  summary: { total: number; passed: number; failed: number };
  cases: Array<{
    id: string;
    status: 'passed' | 'failed';
    durationMs: number;
    details?: Record<string, unknown>;
    error?: string;
  }>;
};

const MARKER_START = '---SMOKE-REPORT-START---';
const MARKER_END = '---SMOKE-REPORT-END---';

async function run() {
  const startedAt = Date.now();
  const suites = [
    'contextMigrationSmoke.ts',
    'frameworkSwitchSmoke.ts',
    'skillResolverSmoke.ts',
    'fileDownloadSwitchSmoke.ts',
  ];
  const reports: SmokePayload[] = [];

  for (const file of suites) {
    const result = await runScript(file);
    reports.push(result.report);
  }

  const totalCases = reports.reduce((n, r) => n + r.summary.total, 0);
  const totalPassed = reports.reduce((n, r) => n + r.summary.passed, 0);
  const totalFailed = reports.reduce((n, r) => n + r.summary.failed, 0);
  const overallStatus: 'passed' | 'failed' = totalFailed === 0 ? 'passed' : 'failed';

  const payload = {
    suiteId: 'phase9-smoke-json',
    status: overallStatus,
    totalDurationMs: Date.now() - startedAt,
    summary: {
      totalSuites: reports.length,
      passedSuites: reports.filter((r) => r.status === 'passed').length,
      failedSuites: reports.filter((r) => r.status === 'failed').length,
      totalCases,
      totalPassed,
      totalFailed,
    },
    reports,
  };

  const reportDir = path.resolve(process.cwd(), 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'phase9-smoke-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2), 'utf8');

  console.log(`✅ phase9 smoke aggregate report written: ${reportPath}`);
  console.log(JSON.stringify(payload, null, 2));

  if (overallStatus !== 'passed') process.exit(1);
}

function runScript(fileName: string): Promise<{ report: SmokePayload; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('tsx', [`src/scripts/${fileName}`], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d: string) => {
      stdout += d;
      process.stdout.write(d);
    });
    child.stderr.on('data', (d: string) => {
      stderr += d;
      process.stderr.write(d);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      const merged = `${stdout}\n${stderr}`;
      const report = parseSmokeReport(merged);
      if (!report) {
        return reject(new Error(`Failed to parse smoke report output for ${fileName}`));
      }
      if (code !== 0 || report.status === 'failed') {
        return reject(new Error(`${fileName} failed`));
      }
      resolve({ report, output: merged });
    });
  });
}

function parseSmokeReport(output: string): SmokePayload | null {
  const s = output.lastIndexOf(MARKER_START);
  const e = output.lastIndexOf(MARKER_END);
  if (s < 0 || e < 0 || e <= s) return null;
  const jsonText = output.slice(s + MARKER_START.length, e).trim();
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText) as SmokePayload;
  } catch {
    return null;
  }
}

run().catch((err) => {
  console.error(`❌ phase9 smoke aggregate failed: ${String((err as any)?.message || err)}`);
  process.exit(1);
});
