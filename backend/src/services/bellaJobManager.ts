export type BellaJobStage =
  | 'queued'
  | 'preparing_inputs'
  | 'running_openclaw'
  | 'collecting_outputs'
  | 'generating_final_reply'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type BellaJobEventLevel = 'info' | 'error';

export type BellaJobEvent = {
  ts: number;
  level: BellaJobEventLevel;
  event: string;
  detail?: string;
};

export type BellaJobStatus = {
  jobId: string;
  jobDescription: string;
  stage: BellaJobStage;
  updatedAt: number;
  recentEvents: BellaJobEvent[];
  error?: string;
};

export type BellaJobResult = {
  reply: string;
  imageUrl?: string;
  videoUrl?: string;
  downloads: { id: string; name: string; size: number; url: string }[];
};

type SSEClient = {
  id: string;
  write: (chunk: string) => void;
};

type BellaJobRecord = {
  jobId: string;
  sessionKey: string;
  jobAgentId: string;
  jobDescription: string;
  stage: BellaJobStage;
  updatedAt: number;
  error?: string;
  cancelled: boolean;
  recentEvents: BellaJobEvent[];
  result?: BellaJobResult;
};

function safeLimitEvents(events: BellaJobEvent[], max = 30): BellaJobEvent[] {
  if (events.length <= max) return events;
  return events.slice(events.length - max);
}

export class BellaJobManager {
  private jobs = new Map<string, BellaJobRecord>();
  private jobClients = new Map<string, Set<SSEClient>>();
  private activeJobsBySession = new Map<string, Set<string>>();

  createJob(args: { jobId: string; sessionKey: string; jobAgentId: string; jobDescription: string }) {
    const { jobId, sessionKey, jobAgentId, jobDescription } = args;
    if (this.jobs.has(jobId)) throw new Error(`Job already exists: ${jobId}`);
    const rec: BellaJobRecord = {
      jobId,
      sessionKey,
      jobAgentId,
      jobDescription,
      stage: 'queued',
      updatedAt: Date.now(),
      cancelled: false,
      recentEvents: [],
    };
    this.jobs.set(jobId, rec);
    const set = this.activeJobsBySession.get(sessionKey) || new Set<string>();
    set.add(jobId);
    this.activeJobsBySession.set(sessionKey, set);
    return rec;
  }

  getJobStatus(jobId: string): BellaJobStatus | null {
    const rec = this.jobs.get(jobId);
    if (!rec) return null;
    return {
      jobId: rec.jobId,
      jobDescription: rec.jobDescription,
      stage: rec.stage,
      updatedAt: rec.updatedAt,
      recentEvents: rec.recentEvents,
      error: rec.error,
    };
  }

  getActiveJobsForSession(sessionKey: string): BellaJobStatus[] {
    const set = this.activeJobsBySession.get(sessionKey);
    if (!set) return [];
    return Array.from(set.values())
      .map((jobId) => this.getJobStatus(jobId))
      .filter((x): x is BellaJobStatus => !!x)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  isCancelled(jobId: string): boolean {
    return !!this.jobs.get(jobId)?.cancelled;
  }

  requestCancel(jobId: string) {
    const rec = this.jobs.get(jobId);
    if (!rec) return false;
    rec.cancelled = true;
    rec.stage = rec.stage === 'succeeded' ? 'succeeded' : 'cancelled';
    rec.updatedAt = Date.now();
    rec.recentEvents = safeLimitEvents([
      ...rec.recentEvents,
      { ts: Date.now(), level: 'info', event: 'cancel.requested', detail: `job ${jobId} cancelled by user` },
    ]);
    this.broadcast(jobId, 'job_status', this.serializeStatus(jobId));
    this.cleanupActiveSession(jobId);
    return true;
  }

  pushEvent(jobId: string, ev: BellaJobEvent) {
    const rec = this.jobs.get(jobId);
    if (!rec) return;
    rec.recentEvents = safeLimitEvents([...rec.recentEvents, ev]);
    rec.updatedAt = Date.now();
    this.broadcast(jobId, 'job_status', this.serializeStatus(jobId));
  }

  updateStage(jobId: string, stage: BellaJobStage) {
    const rec = this.jobs.get(jobId);
    if (!rec) return;
    rec.stage = stage;
    rec.updatedAt = Date.now();
    this.broadcast(jobId, 'job_status', this.serializeStatus(jobId));
  }

  setResult(jobId: string, result: BellaJobResult) {
    const rec = this.jobs.get(jobId);
    if (!rec) return;
    rec.result = result;
    rec.stage = 'succeeded';
    rec.updatedAt = Date.now();
    this.broadcast(jobId, 'job_result', result);
    this.cleanupActiveSession(jobId);
  }

  setError(jobId: string, error: string) {
    const rec = this.jobs.get(jobId);
    if (!rec) return;
    rec.error = error;
    rec.stage = 'failed';
    rec.updatedAt = Date.now();
    rec.recentEvents = safeLimitEvents([...rec.recentEvents, { ts: Date.now(), level: 'error', event: 'job.failed', detail: error }]);
    this.broadcast(jobId, 'job_status', this.serializeStatus(jobId));
    this.cleanupActiveSession(jobId);
  }

  getResult(jobId: string): BellaJobResult | null {
    return this.jobs.get(jobId)?.result || null;
  }

  subscribe(jobId: string, client: SSEClient) {
    const set = this.jobClients.get(jobId) || new Set<SSEClient>();
    set.add(client);
    this.jobClients.set(jobId, set);
  }

  unsubscribe(jobId: string, clientId: string) {
    const set = this.jobClients.get(jobId);
    if (!set) return;
    for (const c of set.values()) {
      if (c.id === clientId) {
        set.delete(c);
        break;
      }
    }
    if (set.size === 0) this.jobClients.delete(jobId);
  }

  private serializeStatus(jobId: string): BellaJobStatus {
    const status = this.getJobStatus(jobId);
    if (!status) throw new Error(`serializeStatus missing job: ${jobId}`);
    return status;
  }

  private cleanupActiveSession(jobId: string) {
    const rec = this.jobs.get(jobId);
    if (!rec) return;
    const set = this.activeJobsBySession.get(rec.sessionKey);
    if (!set) return;
    set.delete(jobId);
    if (set.size === 0) this.activeJobsBySession.delete(rec.sessionKey);
  }

  private broadcast(jobId: string, event: string, data: any) {
    const set = this.jobClients.get(jobId);
    if (!set) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of set.values()) client.write(payload);
  }
}

export const bellaJobManager = new BellaJobManager();

