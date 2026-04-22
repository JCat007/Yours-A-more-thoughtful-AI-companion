export type SmokeCaseResult = {
  id: string;
  status: 'passed' | 'failed';
  durationMs: number;
  details?: Record<string, unknown>;
  error?: string;
};

export class SmokeReporter {
  private readonly suiteId: string;
  private readonly startedAt: number;
  private readonly cases: SmokeCaseResult[] = [];

  constructor(suiteId: string) {
    this.suiteId = suiteId;
    this.startedAt = Date.now();
  }

  async runCase<T>(id: string, fn: () => Promise<T> | T): Promise<T> {
    const started = Date.now();
    try {
      const details = await fn();
      this.cases.push({
        id,
        status: 'passed',
        durationMs: Date.now() - started,
        details: asDetails(details),
      });
      return details;
    } catch (error: any) {
      this.cases.push({
        id,
        status: 'failed',
        durationMs: Date.now() - started,
        error: String(error?.message || error),
      });
      throw error;
    }
  }

  printSuccess(extra?: Record<string, unknown>) {
    const payload = this.buildPayload('passed', extra);
    console.log(`✅ ${this.suiteId} passed`);
    printPayload(payload);
  }

  printFailure(error: unknown, extra?: Record<string, unknown>) {
    const payload = this.buildPayload('failed', {
      ...extra,
      failure: String((error as any)?.message || error),
    });
    console.error(`❌ ${this.suiteId} failed: ${String((error as any)?.message || error)}`);
    printPayload(payload, true);
  }

  private buildPayload(status: 'passed' | 'failed', extra?: Record<string, unknown>) {
    const totalDurationMs = Date.now() - this.startedAt;
    const passed = this.cases.filter((c) => c.status === 'passed').length;
    const failed = this.cases.length - passed;
    return {
      suiteId: this.suiteId,
      status,
      totalDurationMs,
      summary: {
        total: this.cases.length,
        passed,
        failed,
      },
      cases: this.cases,
      ...extra,
    };
  }
}

function asDetails(v: unknown): Record<string, unknown> | undefined {
  if (!v || typeof v !== 'object') return undefined;
  return v as Record<string, unknown>;
}

function printPayload(payload: unknown, toStderr = false) {
  const write = toStderr ? console.error : console.log;
  write('---SMOKE-REPORT-START---');
  write(JSON.stringify(payload, null, 2));
  write('---SMOKE-REPORT-END---');
}
