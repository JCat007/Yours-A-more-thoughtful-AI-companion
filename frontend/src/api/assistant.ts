import client from './client';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  jobId?: string;
  jobDescription?: string;
  imageUrl?: string;
  videoUrl?: string;
  downloads?: { id: string; name: string; size: number; url: string }[];
}

export type BellaMode = 'china' | 'world';
export type AgentFramework = 'openclaw' | 'hermes';
export type ContextStrategy = 'last_20_turns' | 'full_with_summary';
export type FrameworkSwitchMode = 'full_migrate' | 'runtime_only';

/** UI language from `LanguageContext` — weak fallback for reply language when user text is ambiguous. */
export type AssistantUiLocale = 'zh' | 'en';

export interface BellaRuntimeOptions {
  searchBrowserFallbackToBing: boolean;
  enableWebSearch: boolean;
  enableWebFetch: boolean;
}

export interface AssistantConfig {
  mode: BellaMode;
  model: string;
  skills: { id: string; name: string; summary: string }[];
  runtimeOptions: BellaRuntimeOptions;
}

export interface AssistantFrameworkConfig {
  framework: AgentFramework;
  contextStrategyDefault: ContextStrategy;
  availableFrameworks: AgentFramework[];
  availableContextStrategies: ContextStrategy[];
}

export type FrameworkSwitchResponse =
  | {
      ok: true;
      framework: AgentFramework;
      switchMode: FrameworkSwitchMode;
      contextStrategy: ContextStrategy;
      migration: { strategy: ContextStrategy; turnsMigrated: number; summaryIncluded: boolean };
      frameworkMigration?: {
        mode: FrameworkSwitchMode;
        attempted: boolean;
        command?: string;
        durationMs?: number;
        stdoutTail?: string;
        stderrTail?: string;
        followUps?: string[];
      };
      observability?: {
        pendingBackgroundWrites: number;
        gbrainRuntimeStable: boolean;
      };
    }
  | {
      ok: false;
      code:
        | 'SWITCH_BLOCKED_NOT_IDLE'
        | 'SWITCH_TARGET_SAME_AS_CURRENT'
        | 'SWITCH_CONTEXT_EXPORT_FAILED'
        | 'SWITCH_CONTEXT_IMPORT_FAILED'
        | 'SWITCH_HERMES_MIGRATION_FAILED'
        | 'SWITCH_INTERNAL_ERROR';
      message: string;
      blocking?: { activeJobs: number; inFlightRequests?: number };
    };

export interface AssistantDebugInfo {
  provider: string;
  workspace: string;
  dirs: { inputDir: string; outputDir: string };
  counts: {
    uploadedCache: number;
    downloadableCache: number;
    inputFiles: number;
    outputFiles: number;
    memorySessions: number;
    memoryTurns: number;
  };
  bellaMemory?: {
    sessions: number;
    turns: number;
    maxTurns: number;
    maxSessions: number;
    stateFile: string;
  };
  inputFiles: string[];
  outputFiles: string[];
  recentEvents: { ts: number; level: 'info' | 'error'; event: string; detail?: string }[];
}

export interface AssistantSkillsPreflight {
  openclawRoot: string;
  openclawJsonPath: string;
  skillsRoot: string;
  checks: Array<{ skill: string; enabled: boolean; installed: boolean; path: string; ok: boolean; hint: string }>;
  allOk: boolean;
  execApprovalsPath: string;
  hasExecAllowlist: boolean;
  note: string;
}

export const assistantApi = {
  chat: async (
    message: string,
    history: ChatMessage[] = [],
    mode?: BellaMode,
    fileIds: string[] = [],
    uiLocale?: AssistantUiLocale
  ) => {
    const timeoutMs = Number(import.meta.env.VITE_ASSISTANT_CHAT_TIMEOUT_MS || 600000);
    const res = await client.post<{
      reply?: string;
      imageUrl?: string;
      videoUrl?: string;
      downloads?: { id: string; name: string; size: number; url: string }[];
      jobId?: string;
      jobDescription?: string;
      stage?: string;
    }>('/assistant/chat', {
      message,
      history: history.map((m) => ({ role: m.role, content: m.content, imageUrl: m.imageUrl, videoUrl: m.videoUrl })),
      mode,
      fileIds,
      uiLocale,
    }, { timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 600000 });
    return res.data;
  },
  uploadFile: async (
    file: File,
    opts?: {
      signal?: AbortSignal;
      onReadProgress?: (progress01: number) => void;
      onUploadProgress?: (progress01: number) => void;
    }
  ) => {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      let settled = false;
      const safeResolve = (v: string) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };
      const safeReject = (e: any) => {
        if (settled) return;
        settled = true;
        reject(e);
      };
      reader.onerror = () => safeReject(new Error('读取文件失败'));
      reader.onprogress = (ev) => {
        if (ev.lengthComputable && ev.total > 0) {
          const pct = Math.max(0, Math.min(1, ev.loaded / ev.total));
          opts?.onReadProgress?.(pct);
        }
      };
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        const idx = dataUrl.indexOf('base64,');
        safeResolve(idx >= 0 ? dataUrl.slice(idx + 7) : '');
      };
      const onAbort = () => {
        try {
          reader.abort();
        } catch {
          // ignore
        }
        safeReject(new DOMException('Aborted', 'AbortError'));
      };
      if (opts?.signal) {
        if (opts.signal.aborted) {
          onAbort();
          return;
        }
        opts.signal.addEventListener('abort', onAbort, { once: true });
      }
      reader.readAsDataURL(file);
    });
    const res = await client.post<{ fileId: string; name: string; size: number }>('/assistant/upload-file', {
      name: file.name,
      mimeType: file.type,
      dataBase64: base64,
    }, {
      timeout: 120000,
      signal: opts?.signal,
      onUploadProgress: (ev) => {
        if (!ev.total) return;
        const pct = Math.max(0, Math.min(1, ev.loaded / ev.total));
        opts?.onUploadProgress?.(pct);
      },
    });
    return res.data;
  },
  getConfig: async (mode?: BellaMode) => {
    const res = await client.get<AssistantConfig>('/assistant/config', mode ? { params: { mode } } : undefined);
    return res.data;
  },
  getFrameworkConfig: async () => {
    const res = await client.get<AssistantFrameworkConfig>('/assistant/framework/config');
    return res.data;
  },
  initFramework: async (framework: AgentFramework) => {
    const res = await client.post<AssistantFrameworkConfig>('/assistant/framework/init', { framework });
    return res.data;
  },
  switchFramework: async (
    targetFramework: AgentFramework,
    contextStrategy: ContextStrategy = 'last_20_turns',
    options?: { switchMode?: FrameworkSwitchMode; migrateSecrets?: boolean; workspaceTarget?: string }
  ) => {
    const res = await client.post<FrameworkSwitchResponse>('/assistant/framework/switch', {
      targetFramework,
      contextStrategy,
      switchMode: options?.switchMode,
      migrateSecrets: options?.migrateSecrets,
      workspaceTarget: options?.workspaceTarget,
    });
    return res.data;
  },
  getRuntimeOptions: async (mode?: BellaMode) => {
    const res = await client.get<{ mode: BellaMode; runtimeOptions: BellaRuntimeOptions }>(
      '/assistant/runtime-options',
      mode ? { params: { mode } } : undefined
    );
    return res.data;
  },
  updateRuntimeOptions: async (mode: BellaMode, runtimeOptions: Partial<BellaRuntimeOptions>) => {
    const res = await client.post<{ mode: BellaMode; runtimeOptions: BellaRuntimeOptions }>(
      '/assistant/runtime-options',
      { mode, runtimeOptions }
    );
    return res.data;
  },
  resetRuntimeOptions: async (mode: BellaMode) => {
    const res = await client.post<{ mode: BellaMode; runtimeOptions: BellaRuntimeOptions }>(
      '/assistant/runtime-options/reset',
      { mode }
    );
    return res.data;
  },
  getDebugInfo: async () => {
    const res = await client.get<AssistantDebugInfo>('/assistant/debug-files');
    return res.data;
  },
  getDebugExportUrl: () => {
    const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api').replace(/\/$/, '');
    return `${base}/assistant/debug-files/export`;
  },
  getSkillsPreflight: async () => {
    const res = await client.get<AssistantSkillsPreflight>('/assistant/skills-preflight');
    return res.data;
  },
};
