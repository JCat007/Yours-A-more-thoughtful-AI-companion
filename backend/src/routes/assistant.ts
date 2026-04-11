import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { assistantRateLimit, requireAssistantApiKey } from '../middleware/assistantSecurity';
import {
  chatWithAssistant,
  planReplyMode,
  wantsWhatDoing,
  wantsVideo,
  wantsSelfie,
  pickRandomWhatDoingScene,
  generateSelfieImage,
  generateSelfieVideo,
  getWorkspaceMediaPath,
  getOpenClawWorkspacePath,
  getOpenClawWorkspaceCandidates,
  getAllowedWorkspaceMediaNames,
} from '../services/assistant';
import { bellaLog } from '../lib/bella-log';
import { buildReplyLanguageSystemMessage, inferReplyLanguage } from '../lib/replyLanguage';
import { composeBellaFinalReply } from '../services/bellaComposer';
import { getBellaRuntimeOptions, resetBellaRuntimeOptions, updateBellaRuntimeOptions } from '../services/bellaRuntimeOptions';
import { getLastIntent, getMemoryStats, getRecentUserTexts, rememberIntent, rememberTurn } from '../services/bellaState';
import { decideBellaRoute } from '../services/bellaIntentClassifier';
import { classifyUrlIntent } from '../services/urlIntentRouter';
import { bellaJobManager, type BellaJobStage, type BellaJobStatus } from '../services/bellaJobManager';
import {
  normalizeBellaStageToStarOfficeState,
  normalizeStateDetailForBellaStage,
  syncStarOfficeState,
} from '../lib/starOfficeSync';
import { optionalBellaAuth } from '../middleware/optionalBellaAuth';
import { buildOpenClawGbrainWriteScopeSystemMessage } from '../lib/openclawCompanionScope';
import { loadCompanionMemoryContext, maybeScheduleCompanionMemoryWrite } from '../services/companionChatBridge';

const router = express.Router();

type StoredFileMeta = {
  id: string;
  originalName: string;
  mimeType: string;
  fullPath: string;
  mirroredPaths: string[];
  size: number;
  createdAt: number;
};

const uploadedFiles = new Map<string, StoredFileMeta>();
const downloadableFiles = new Map<string, StoredFileMeta>();
const MAX_UPLOAD_BYTES = Number(process.env.ASSISTANT_UPLOAD_MAX_BYTES || 20 * 1024 * 1024);
const ALLOWED_EXTS = new Set([
  '.pdf',
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.xlsx',
  '.xls',
  '.docx',
  '.pptx',
  // reference images
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
  '.tiff',
  '.tif',
  '.heic',
  // optional video inputs (for other skills / references)
  '.mp4',
  '.mov',
  '.webm',
]);
const IMAGE_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
  '.tiff',
  '.tif',
  '.heic',
]);
const OPENCLAW_INTERNAL_OUTPUT_NAMES = new Set([
  'AGENTS.md',
  'BOOTSTRAP.md',
  'HEARTBEAT.md',
  'IDENTITY.md',
  'SOUL.md',
  'TOOLS.md',
  'USER.md',
]);
const debugEvents: Array<{ ts: number; level: 'info' | 'error'; event: string; detail?: string }> = [];
const DEBUG_EVENT_LIMIT = 120;
const FILE_TASK_SKILLS = ['pdf', 'docx', 'pptx', 'xlsx', 'canvas-design', 'frontend-design'] as const;
let openClawRateLimitUntil = 0;
const OPENCLAW_RATE_LIMIT_COOLDOWN_MS = Number(process.env.OPENCLAW_RATE_LIMIT_COOLDOWN_MS || 120000);
// With extractScore=3, confidence is 0.55+0.24=0.79; keep threshold <0.8 or the model may still prefer browser when not forced.
const URL_EXTRACT_FORCE_THRESHOLD = 0.78;
const SKILL_BY_EXT: Record<string, string[]> = {
  '.pdf': ['pdf', 'docx'],
  '.docx': ['docx'],
  '.pptx': ['pptx'],
  '.xlsx': ['xlsx'],
  '.xls': ['xlsx'],
  '.txt': ['docx'],
  '.md': ['docx'],
  '.csv': ['xlsx'],
  '.json': ['xlsx', 'docx'],
  // media-image uses reference images for I2I
  '.png': ['media-image'],
  '.jpg': ['media-image'],
  '.jpeg': ['media-image'],
  '.webp': ['media-image'],
  '.gif': ['media-image'],
  '.bmp': ['media-image'],
  '.tiff': ['media-image'],
  '.tif': ['media-image'],
  '.heic': ['media-image'],
};

function pushDebugEvent(level: 'info' | 'error', event: string, detail?: string) {
  debugEvents.push({ ts: Date.now(), level, event, detail });
  if (debugEvents.length > DEBUG_EVENT_LIMIT) {
    debugEvents.splice(0, debugEvents.length - DEBUG_EVENT_LIMIT);
  }
  const line = detail ? `${event} | ${detail}` : event;
  if (level === 'error') console.error(`[assistant-debug] ${line}`);
  else console.log(`[assistant-debug] ${line}`);
}

function timeAgoText(ts: number): string {
  const d = Math.max(0, Date.now() - ts);
  const sec = Math.floor(d / 1000);
  if (sec < 10) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  return `${hr}h`;
}

function isProgressQuery(message: string): boolean {
  const s = (message || '').toLowerCase();
  const keysZh = ['进度', '怎么样', '现在在哪', '做到哪', '还要多久', '多久完成', '完成了吗', '还没完成'];
  const keysEn = [
    'progress',
    'how is it going',
    'how long',
    'eta',
    'status',
    'done yet',
    'finished yet',
    'still working',
  ];
  return keysZh.some((k) => s.includes(k)) || keysEn.some((k) => s.includes(k));
}

function extractJobIdFromMessage(message: string): string | null {
  const s = message || '';
  // Accept job_id=xxx / jobId: xxx / jobId xxx (jobId is a UUID 8-4-4-4-12).
  const m1 = s.match(/job[_\s-]*id\s*[:=]\s*([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/);
  if (m1?.[1]) return m1[1];
  const m2 = s.match(/jobid\s+([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/i);
  if (m2?.[1]) return m2[1];
  return null;
}

function getOpenClawWorkspaceRootForAgent(agentId: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.openclaw', `workspace-${agentId}`);
}

function getWorkspaceDir(...segments: string[]) {
  const ws = getOpenClawWorkspacePath();
  const full = path.join(ws, ...segments);
  fs.mkdirSync(full, { recursive: true });
  return full;
}

function getWorkspaceDirsForAllCandidates(...segments: string[]): string[] {
  const all = getOpenClawWorkspaceCandidates().map((ws) => {
    const full = path.join(ws, ...segments);
    fs.mkdirSync(full, { recursive: true });
    return full;
  });
  return Array.from(new Set(all));
}

function sanitizeFileName(name: string) {
  const base = path.basename(name || 'file');
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
}

function extAllowed(name: string) {
  return ALLOWED_EXTS.has(path.extname(name).toLowerCase());
}

function registerDownloadableFile(fullPath: string, originalName: string, mimeType = 'application/octet-stream') {
  const id = crypto.randomUUID();
  const stat = fs.statSync(fullPath);
  const meta: StoredFileMeta = {
    id,
    originalName,
    mimeType,
    fullPath,
    mirroredPaths: [fullPath],
    size: stat.size,
    createdAt: Date.now(),
  };
  downloadableFiles.set(id, meta);
  return meta;
}

function listOutputFilesWithMtime(dir: string): Map<string, number> {
  const map = new Map<string, number>();
  if (!fs.existsSync(dir)) return map;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (!item.isFile()) continue;
    const full = path.join(dir, item.name);
    const st = fs.statSync(full);
    map.set(item.name, st.mtimeMs);
  }
  return map;
}

function shouldTrackAsDownloadOutput(name: string): boolean {
  const base = path.basename(name || '').trim();
  if (!base) return false;
  // OpenClaw writes internal status docs into job workspaces; do not treat them as user-facing downloads.
  if (OPENCLAW_INTERNAL_OUTPUT_NAMES.has(base)) return false;
  return true;
}

function buildBellaSessionKey(req: express.Request, bellaMode?: 'china' | 'world', userId?: string | null) {
  const mode = bellaMode === 'world' ? 'world' : 'china';
  if (userId) return `${mode}:user:${userId}`;
  const ip = req.ip || 'unknown-ip';
  return `${mode}:anon:${ip}`;
}

function buildDebugSnapshot() {
  const memory = getMemoryStats();
  const inputDir = getWorkspaceDir('bella-inputs');
  const outputDir = getWorkspaceDir('bella-outputs');
  const inputFiles = fs.existsSync(inputDir) ? fs.readdirSync(inputDir).slice(-50) : [];
  const outputFiles = fs.existsSync(outputDir) ? fs.readdirSync(outputDir).slice(-50) : [];
  return {
    provider: (process.env.ASSISTANT_CHAT_PROVIDER || 'openai').toLowerCase().trim(),
    workspace: getOpenClawWorkspacePath(),
    dirs: { inputDir, outputDir },
    counts: {
      uploadedCache: uploadedFiles.size,
      downloadableCache: downloadableFiles.size,
      inputFiles: inputFiles.length,
      outputFiles: outputFiles.length,
      memorySessions: memory.sessions,
      memoryTurns: memory.turns,
    },
    bellaMemory: memory,
    inputFiles,
    outputFiles,
    recentEvents: debugEvents.slice(-40),
    openClawRateLimitUntil,
    openClawRateLimitRemainingMs: Math.max(0, openClawRateLimitUntil - Date.now()),
  };
}

function isRateLimitLike(msg: string): boolean {
  const s = (msg || '').toLowerCase();
  return (
    s.includes('rate limit') ||
    s.includes('too many requests') ||
    s.includes(' api_error: unknown error, 794') ||
    s.includes('429')
  );
}

function isToolDeniedLike(msg: string): boolean {
  const s = (msg || '').toLowerCase();
  return (
    s.includes('exec denied') ||
    s.includes('allowlist miss') ||
    s.includes('exec host not allowed') ||
    s.includes('elevated is not available') ||
    s.includes('browser failed')
  );
}

/** When OpenClaw output shows browser/Chrome MCP failure, trigger one retry with the openclaw profile (no uploads). */
function isBrowserFailureRetryable(msg: string): boolean {
  const s = (msg || '').toLowerCase();
  return (
    s.includes('browser failed') ||
    s.includes('devtoolsactiveport') ||
    s.includes('existing-session attach') ||
    s.includes('could not connect to chrome') ||
    s.includes('chrome mcp')
  );
}

/** After search-chain failure (web_search/web_fetch/browser), force a second round using browser + Bing only. */
function isSearchToolFailureRetryable(msg: string): boolean {
  const s = (msg || '').toLowerCase();
  return (
    s.includes('web_search failed') ||
    s.includes('web_fetch failed') ||
    s.includes('browser failed') ||
    s.includes('fetch failed') ||
    s.includes('search failed')
  );
}

function buildSearchBrowserBingRetrySystemMessage(userQuery: string): string {
  const q = encodeURIComponent((userQuery || '').trim()).replace(/%20/g, '+');
  const bingUrl = `https://www.bing.com/search?q=${q || 'latest+news'}`;
  return (
    '上一轮搜索链路失败。现在只允许使用 browser（openclaw profile）执行，不要调用 web_search / web_fetch。\n' +
    `请直接导航到：${bingUrl}\n` +
    '进入页面后提取可验证结果并给出引用链接。若仍失败，明确返回失败原因和阻塞点。'
  );
}

function buildWebToolPolicySystemMessage(params: {
  enableWebSearch: boolean;
  enableWebFetch: boolean;
}): string | null {
  const lines: string[] = [];
  if (!params.enableWebSearch) lines.push('- 禁止调用 web_search。');
  if (!params.enableWebFetch) lines.push('- 禁止调用 web_fetch。');
  if (lines.length === 0) return null;
  lines.push('- 若需要联网检索，请优先使用 browser(openclaw profile) 或 web-to-markdown。');
  return ['【网页工具策略】', ...lines].join('\n');
}

function buildBrowserFailureRetrySystemMessage(mode: 'china' | 'world'): string {
  const cn =
    mode === 'china'
      ? '国内模式请优先可访问链路，不要用 web_fetch 硬抓 google.com。'
      : '请优先走稳定网页抓取链路，避免依赖受限搜索跳转页。';
  return (
    `上一轮 browser 工具失败（例如 Chrome MCP、user profile 挂载失败，或托管 Chromium 未完成页面任务）。\n` +
    `请严格按顺序重试：\n` +
    `1) 仅使用 OpenClaw 托管 Chromium（profile 选 "openclaw"），禁止再次尝试 profile "user" / 系统 Chrome MCP。\n` +
    `2) 若用户给了具体文章/网页 URL 且需要正文：优先 **web-to-markdown**。\n` +
    `3) 若 web-to-markdown 失败：再尝试 web_fetch；仍失败再尝试 browser（openclaw）。\n` +
    cn
  );
}

function buildUrlExtractSystemMessage(urls: string[], mode: 'china' | 'world'): string {
  const lines = urls.slice(0, 5).map((u, i) => `${i + 1}. ${u}`).join('\n');
  return [
    '用户提供了具体网页 URL，任务目标是抓取网页正文内容。',
    `URL 列表：\n${lines || '(none)'}`,
    '本轮必须优先调用 web-to-markdown（或等价工具名 web_to_markdown）抓正文并输出关键信息。',
    '网页技能调用顺序：web-to-markdown -> web_fetch -> browser(openclaw profile)。',
    '禁止把关键词搜索工具作为网页正文抓取路径。',
    mode === 'china'
      ? '国内模式优先可访问链路；避免用 web_fetch 直接抓 google.com/search 等易受限页面。'
      : '世界模式可正常访问公开站点，但仍优先正文抽取路径。',
  ].join('\n');
}

function buildUrlSemanticRoutingSystemMessage(urls: string[], mode: 'china' | 'world'): string {
  const lines = urls.slice(0, 5).map((u, i) => `${i + 1}. ${u}`).join('\n');
  return [
    '用户消息中包含 URL，请先做语义判断，再选工具：',
    `URL 列表：\n${lines || '(none)'}`,
    'A) 若用户要的是这些 URL 对应页面的正文/摘要/翻译/要点，请优先 web-to-markdown。',
    'B) 若用户要的是“额外查资料/相关新闻/更多来源”，请改用可用网页工具并说明能力边界。',
    '不要机械按关键词；请按用户真实意图判断。',
    mode === 'china'
      ? '国内模式优先可访问链路，避免先走 google.com 直接抓取。'
      : '世界模式保持正常网络抓取策略。',
  ].join('\n');
}

/** When the model returns text that looks like anti-bot/verification/empty pages, trigger a reroute retry. */
function isContentFailureRetryable(replyText: string): boolean {
  const s = (replyText || '').toLowerCase();
  const hints = [
    '环境异常',
    '滑块',
    '验证码',
    '验证',
    'anti-bot',
    'robot check',
    'forbidden',
    'access denied',
    '无法获取完整内容',
    '无法抓取',
    '无法访问该页面',
    '请在浏览器中打开',
    'wechat',
    'mp.weixin.qq.com',
  ];
  return hints.some((k) => s.includes(k.toLowerCase()));
}

function buildContentFailureRetrySystemMessage(urls: string[], mode: 'china' | 'world'): string {
  const lines = urls.slice(0, 5).map((u, i) => `${i + 1}. ${u}`).join('\n');
  return [
    '上一轮已返回文本，但判断为“内容提取失败”（如风控验证页/反爬拦截/非正文）。',
    `URL 列表：\n${lines || '(none)'}`,
    '请按网页技能顺序继续：web-to-markdown -> web_fetch -> browser(openclaw profile)。',
    '如果全部失败，请明确返回失败原因。',
    '不要把验证页提示当作最终内容。',
    mode === 'china'
      ? '国内模式优先可访问链路，避免先抓受限域名搜索页。'
      : '世界模式保持公开网页优先抓取。',
  ].join('\n');
}

function inferRequiredSkills(files: StoredFileMeta[]): string[] {
  const out: string[] = [];
  for (const f of files) {
    const ext = path.extname(f.originalName || '').toLowerCase();
    const skills = SKILL_BY_EXT[ext] || [];
    for (const s of skills) {
      if (!out.includes(s)) out.push(s);
    }
  }
  return out;
}

function buildSkillRetrySystemMessage(requiredSkills: string[], files: StoredFileMeta[]): string {
  const names = files.map((f) => f.originalName).join(', ');
  const must = requiredSkills.length > 0 ? requiredSkills.join(', ') : 'pdf/docx/pptx/xlsx';
  return (
    `上一轮因工具权限/环境受限失败（例如 exec denied / browser relay / elevated unavailable）。\n` +
    `当前文件：${names}\n` +
    `必须优先尝试 skills：${must}，禁止继续优先走 exec/browser/elevated。\n` +
    `执行顺序：required skill -> 同类文件 skill（pdf/docx/pptx/xlsx）-> 再考虑其他方式。\n` +
    `若当前 skill 确实无法满足任务：请明确说明限制原因，并提供可执行兜底（例如先输出文本结果、或生成可替代格式文件）。`
  );
}

function readJsonSafe(filePath: string): any | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

type AssistantSkillSummary = { id: string; name: string; summary: string };

function formatSkillName(skillId: string): string {
  return skillId
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getSkillSummaryById(skillId: string, isChina: boolean): string {
  if (skillId === 'weather') return isChina ? 'Open-Meteo API (China-accessible)' : 'Open-Meteo + wttr.in (World)';
  if (skillId === 'pdf') return 'Read/extract PDF content and convert to artifacts';
  if (skillId === 'docx') return 'Create/edit Word documents with tracked changes';
  if (skillId === 'pptx') return 'Create/edit PowerPoint presentations';
  if (skillId === 'xlsx') return 'Spreadsheets with formulas and formatting';
  if (skillId === 'canvas-design') return 'Create posters, art, designs (.pdf/.png)';
  if (skillId === 'frontend-design') return 'Production-grade web UI (HTML/React)';
  if (skillId === 'media-image') return 'Image generation/editing';
  if (skillId === 'media-video') return 'Video generation/editing';
  return 'Enabled in current OpenClaw skillset';
}

function getOpenClawLiveSkills(isChina: boolean): AssistantSkillSummary[] {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const openclawRoot = path.join(home, '.openclaw');
  const openclawJsonPath = path.join(openclawRoot, 'openclaw.json');
  const skillsRoot = path.join(openclawRoot, 'skills');
  const cfg = readJsonSafe(openclawJsonPath) || {};
  const entries = (cfg?.skills?.entries && typeof cfg.skills.entries === 'object') ? cfg.skills.entries : {};
  const ids = new Set<string>();

  for (const key of Object.keys(entries)) {
    const entry = entries[key];
    if (entry?.enabled) ids.add(String(key));
  }

  if (fs.existsSync(skillsRoot)) {
    for (const dirent of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
      if (dirent.isDirectory()) ids.add(dirent.name);
    }
  }

  const skills = Array.from(ids)
    .filter((id) => id && /^[a-zA-Z0-9][a-zA-Z0-9-_]*$/.test(id))
    .sort((a, b) => a.localeCompare(b))
    .map((id) => ({
      id,
      name: formatSkillName(id),
      summary: getSkillSummaryById(id, isChina),
    }));

  return skills;
}

function buildSkillsPreflight() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const openclawRoot = path.join(home, '.openclaw');
  const openclawJsonPath = path.join(openclawRoot, 'openclaw.json');
  const openclawJson = readJsonSafe(openclawJsonPath) || {};
  const entries = openclawJson?.skills?.entries || {};
  const skillsRoot = path.join(openclawRoot, 'skills');

  const checks = FILE_TASK_SKILLS.map((skill) => {
    const entry = entries?.[skill];
    const enabled = !!entry?.enabled;
    const dir = path.join(skillsRoot, skill);
    const installed = fs.existsSync(dir);
    return {
      skill,
      enabled,
      installed,
      path: dir,
      ok: enabled && installed,
      hint: enabled && installed ? 'ok' : (!installed ? 'missing skill directory' : 'disabled in openclaw.json'),
    };
  });

  const execApprovalsPath = path.join(openclawRoot, 'exec-approvals.json');
  const execApprovals = readJsonSafe(execApprovalsPath) || {};
  const hasAllowlist = !!execApprovals?.agents?.main?.allowlist;

  return {
    openclawRoot,
    openclawJsonPath,
    skillsRoot,
    checks,
    allOk: checks.every((c) => c.ok),
    execApprovalsPath,
    hasExecAllowlist: hasAllowlist,
    note:
      'For file tasks, assistant now enforces skill-first and forbids exec/browser/canvas. Ensure skills are installed+enabled.',
  };
}

// Public deployments: enable auth + rate limits for expensive LLM/media routes.
router.use(requireAssistantApiKey);
router.use(assistantRateLimit);
router.use(optionalBellaAuth);

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  videoUrl?: string;
  downloads?: { id: string; name: string; size: number; url: string }[];
}

/** GET /api/assistant/job/:jobId/events — SSE progress stream */
router.get('/job/:jobId/events', (req, res) => {
  const jobId = req.params.jobId;
  const status = bellaJobManager.getJobStatus(jobId);

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (res as any).flushHeaders?.();

  const clientId = crypto.randomUUID();
  const write = (chunk: string) => {
    try {
      res.write(chunk);
    } catch {
      // ignore broken pipe
    }
  };

  bellaJobManager.subscribe(jobId, { id: clientId, write });

  // Initial message
  write(`: connected\n\n`);
  if (status) {
    write(`event: job_status\ndata: ${JSON.stringify(status)}\n\n`);
  }
  const result = bellaJobManager.getResult(jobId);
  if (result && status?.stage === 'succeeded') {
    write(`event: job_result\ndata: ${JSON.stringify(result)}\n\n`);
  }

  const ping = setInterval(() => write(`: ping\n\n`), 15000);

  req.on('close', () => {
    clearInterval(ping);
    bellaJobManager.unsubscribe(jobId, clientId);
    try {
      res.end();
    } catch {
      // ignore
    }
  });
});

/** GET /api/assistant/job/:jobId/status — progress snapshot */
router.get('/job/:jobId/status', (req, res) => {
  const jobId = req.params.jobId;
  const status = bellaJobManager.getJobStatus(jobId);
  if (!status) return res.status(404).json({ error: 'job not found' });
  res.json(status);
});

/** GET /api/assistant/job/:jobId/result — fetch result when finished */
router.get('/job/:jobId/result', (req, res) => {
  const jobId = req.params.jobId;
  const result = bellaJobManager.getResult(jobId);
  if (!result) return res.status(404).json({ error: 'result not ready' });
  res.json(result);
});

/** POST /api/assistant/job/:jobId/cancel — soft cancel */
router.post('/job/:jobId/cancel', (req, res) => {
  const jobId = req.params.jobId;
  const ok = bellaJobManager.requestCancel(jobId);
  if (!ok) return res.status(404).json({ error: 'job not found' });
  res.json({ ok: true });
});

/** POST /api/assistant/upload-file — upload files into the OpenClaw workspace */
router.post('/upload-file', async (req, res) => {
  try {
    const { name, mimeType, dataBase64 } = req.body as {
      name?: string;
      mimeType?: string;
      dataBase64?: string;
    };
    if (!name || !dataBase64) return res.status(400).json({ error: '缺少 name 或 dataBase64' });
    const safeName = sanitizeFileName(name);
    if (!extAllowed(safeName)) {
      return res.status(400).json({
        error:
          '不支持的文件类型（支持 pdf/txt/md/csv/json/xlsx/xls/docx/pptx；以及图片 png/jpg/jpeg/webp/gif/bmp/tiff/heic；视频 mp4/mov/webm）',
      });
    }
    const buf = Buffer.from(dataBase64, 'base64');
    if (!buf.length) return res.status(400).json({ error: '文件内容为空' });
    if (buf.length > MAX_UPLOAD_BYTES) {
      return res.status(400).json({ error: `文件过大，最大 ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB` });
    }
    const fileId = crypto.randomUUID();
    const inboxDirs = getWorkspaceDirsForAllCandidates('bella-inputs');
    const mirroredPaths: string[] = [];
    for (const inboxDir of inboxDirs) {
      const withId = path.join(inboxDir, `${fileId}-${safeName}`);
      const plain = path.join(path.dirname(inboxDir), safeName);
      fs.writeFileSync(withId, buf);
      fs.writeFileSync(plain, buf);
      mirroredPaths.push(withId, plain);
    }
    const fullPath = mirroredPaths[0];
    const meta: StoredFileMeta = {
      id: fileId,
      originalName: safeName,
      mimeType: mimeType || 'application/octet-stream',
      fullPath,
      mirroredPaths: Array.from(new Set(mirroredPaths)),
      size: buf.length,
      createdAt: Date.now(),
    };
    uploadedFiles.set(fileId, meta);
    pushDebugEvent('info', 'upload.success', `${safeName} (${buf.length} bytes) mirrors=${meta.mirroredPaths.length}`);
    res.json({ fileId, name: safeName, size: buf.length });
  } catch (e: any) {
    pushDebugEvent('error', 'upload.fail', e?.message || String(e));
    console.error('上传文件失败:', e);
    res.status(500).json({ error: e?.message || '上传失败' });
  }
});

/** POST /api/assistant/chat — main Bella chat (OpenClaw path + media skills); other providers keep legacy flow */
router.post('/chat', async (req, res) => {
  try {
    const requestId = crypto.randomUUID().slice(0, 8);
    let clientDisconnected = false;
    req.on('close', () => {
      clientDisconnected = true;
      pushDebugEvent('info', 'chat.client.closed', `requestId=${requestId}`);
    });

    const { message, history = [], mode: bellaMode, fileIds = [], uiLocale } = req.body as {
      message?: string;
      history?: { role: 'user' | 'assistant'; content: string; imageUrl?: string; videoUrl?: string }[];
      mode?: 'china' | 'world';
      fileIds?: string[];
      /** Frontend UI language (`zh` | `en` from LanguageContext); weak fallback when user text is ambiguous. */
      uiLocale?: string;
    };
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: '缺少 message' });
    }
    const trimmed = message.trim();
    if (!trimmed) {
      return res.status(400).json({ error: 'message 不能为空' });
    }

    const messages: { role: 'user' | 'assistant' | 'system'; content: string }[] = (history || []).slice(-20).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const resolvedUploads = (fileIds || [])
      .map((id) => uploadedFiles.get(id))
      .filter((v): v is StoredFileMeta => !!v && v.mirroredPaths.some((p) => fs.existsSync(p)));
    pushDebugEvent(
      'info',
      'chat.received',
      `requestId=${requestId} provider=${(process.env.ASSISTANT_CHAT_PROVIDER || 'openai').toLowerCase().trim()} fileIds=${(fileIds || []).length} resolved=${resolvedUploads.length}`
    );
    if (resolvedUploads.length > 0) {
      const requiredSkills = inferRequiredSkills(resolvedUploads);
      const filesHint = resolvedUploads
        .map((f, idx) => {
          // Use relative paths so jobs are not tied to a single absolute OpenClaw workspace root.
          const inboxRel = `bella-inputs/${f.id}-${f.originalName}`;
          const rootRel = `${f.originalName}`;
          return `${idx + 1}. ${f.originalName} | preferred=${inboxRel} | all_paths=${inboxRel} ; ${rootRel} | size=${f.size} bytes`;
        })
        .join('\n');
      const outputDirsRel = ['bella-outputs', './'];
      messages.push({
        role: 'system' as const,
        content:
          `用户上传了文件，请按需读取处理：\n${filesHint}\n` +
          `如需返回处理结果，请把文件写到目录之一：${outputDirsRel.join(' ; ')}\n` +
          `必须优先使用已安装 skills 处理文件；严禁将 exec/shell 作为首选路径。\n` +
          `若用户需要图片/视频（media-image/media-video），并且用户上传了多张参考图片：` +
          `调用 media-video（seedance）时必须把“所有上传的参考图片路径”以重复的 --image 参数传入（不要只传第一张）；` +
          `调用 media-image（seedream）时同理可传入多张以获得更丰富风格（若模型/脚本支持多图融合）。\n` +
          `若上传的是 PDF/Word/Excel 等文档，请优先使用 pdf/docx/xlsx/pptx/canvas-design/frontend-design 等对应技能。\n` +
          (requiredSkills.length > 0 ? `本轮建议优先 skill 顺序：${requiredSkills.join(' -> ')}\n` : '') +
          `若是 PDF：先做原生文本提取；若文本为空/乱码/明显不足，必须自动走 OCR（pdf2image + pytesseract）继续，不要停在“无法读取”。\n` +
          `对“总结并导出 Word”这类任务，默认目标产物为 docx，并在回复中给出下载结果。\n` +
          `文件任务禁止调用 browser/canvas；这些工具无法读取本地上传文件。\n` +
          `如果某个工具权限受限（如 exec denied / allowlist miss），请改用对应 skill 工具继续完成，不要重复 exec。\n` +
          `并在回复中简要说明生成了什么文件。`,
      });
      pushDebugEvent(
        'info',
        'chat.files.injected',
        `${resolvedUploads.map((f) => f.originalName).join(', ')} | requiredSkills=${requiredSkills.join(',') || 'n/a'}`
      );
    }
    messages.push({ role: 'user' as const, content: trimmed });

    const provider = (process.env.ASSISTANT_CHAT_PROVIDER || 'openai').toLowerCase().trim();
    const useOpenClawFlow = provider === 'openclaw' || provider === 'clawra';
    const modeForPersona: 'china' | 'world' = (bellaMode === 'world' ? 'world' : 'china');
    const sessionKey = buildBellaSessionKey(req, bellaMode, req.bellaUser?.id ?? null);
    const recentUserTextsFromHistory = (history || []).filter((m) => m.role === 'user').map((m) => m.content || '').slice(-6);
    const replyLang = inferReplyLanguage({
      userText: trimmed,
      uiLocale,
      recentUserTexts: recentUserTextsFromHistory,
    });
    const runtimeOptions = getBellaRuntimeOptions(modeForPersona);
    messages.splice(messages.length - 1, 0, {
      role: 'system',
      content: buildReplyLanguageSystemMessage(replyLang.lang),
    });
    pushDebugEvent(
      'info',
      'reply.language',
      `lang=${replyLang.lang} source=${replyLang.source} uiLocale=${String(uiLocale || '')} mode=${modeForPersona}`
    );
    bellaLog.replyLanguage(`lang=${replyLang.lang} source=${replyLang.source} uiLocale=${String(uiLocale || '')} mode=${modeForPersona}`);
    const recentUserTexts = getRecentUserTexts(sessionKey, recentUserTextsFromHistory);
    const lastIntent = getLastIntent(sessionKey);
    const routeDecision = await decideBellaRoute({
      mode: modeForPersona,
      message: trimmed,
      recentUserTexts,
      lastIntent,
      hasFiles: resolvedUploads.length > 0,
    });
    const urlIntent = classifyUrlIntent(trimmed);
    const hasUrlInput = resolvedUploads.length === 0 && urlIntent.urls.length > 0;
    const webToolPolicyMsg = buildWebToolPolicySystemMessage({
      enableWebSearch: runtimeOptions.enableWebSearch,
      enableWebFetch: runtimeOptions.enableWebFetch,
    });
    if (webToolPolicyMsg) {
      messages.splice(messages.length - 1, 0, {
        role: 'system',
        content: webToolPolicyMsg,
      });
    }
    if (hasUrlInput) {
      messages.splice(messages.length - 1, 0, {
        role: 'system',
        content: buildUrlSemanticRoutingSystemMessage(urlIntent.urls, modeForPersona),
      });
    }
    const shouldForceUrlExtract =
      resolvedUploads.length === 0 &&
      urlIntent.intent === 'extract_page_content' &&
      urlIntent.confidence >= URL_EXTRACT_FORCE_THRESHOLD;
    if (shouldForceUrlExtract) {
      messages.splice(messages.length - 1, 0, {
        role: 'system',
        content: buildUrlExtractSystemMessage(urlIntent.urls, modeForPersona),
      });
    }
    const effectiveRouteDecision = shouldForceUrlExtract
      ? {
          ...routeDecision,
          intent: 'task_request' as const,
          shouldUseOpenClaw: true,
          needsFileSkill: true,
          reason: `${routeDecision.reason}; url-intent=extract_page_content`,
        }
      : (hasUrlInput && !routeDecision.shouldUseOpenClaw
          ? {
              ...routeDecision,
              shouldUseOpenClaw: true,
              reason: `${routeDecision.reason}; url-intent=semantic-openclaw`,
            }
          : routeDecision);
    const intent = effectiveRouteDecision.intent;
    let companionMemoryContext: string | undefined;
    try {
      companionMemoryContext = await loadCompanionMemoryContext({
        userId: req.bellaUser?.id,
        mode: modeForPersona,
        userMessage: trimmed,
      });
    } catch {
      companionMemoryContext = undefined;
    }
    if (useOpenClawFlow) {
      messages.splice(messages.length - 1, 0, {
        role: 'system',
        content: buildOpenClawGbrainWriteScopeSystemMessage(req.bellaUser?.id),
      });
    }
    rememberTurn(sessionKey, 'user', trimmed);
    rememberIntent(sessionKey, intent);
    pushDebugEvent(
      'info',
      'router.intent',
      `${intent} mode=${modeForPersona} source=${effectiveRouteDecision.source} conf=${effectiveRouteDecision.confidence.toFixed(2)} openclaw=${effectiveRouteDecision.shouldUseOpenClaw} fileSkill=${effectiveRouteDecision.needsFileSkill} image=${effectiveRouteDecision.needsImage}${effectiveRouteDecision.fallbackReason ? ` fallback=${effectiveRouteDecision.fallbackReason}` : ''}`
    );
    pushDebugEvent(
      'info',
      'url_router.intent',
      `${urlIntent.intent} conf=${urlIntent.confidence.toFixed(2)} urls=${urlIntent.urls.length} extract=${urlIntent.extractScore} search=${urlIntent.searchScore} reasons=${urlIntent.reasons.join(',') || 'n/a'} forced=${shouldForceUrlExtract}`
    );
    pushDebugEvent(
      'info',
      'url_router.hook',
      `enabled=true hasUrl=${hasUrlInput} semanticPrompt=${hasUrlInput} forceExtract=${shouldForceUrlExtract} urls=${urlIntent.urls.slice(0, 3).join(' | ') || 'n/a'}`
    );
    const callOpenClawWithRetries = async (agentId: string, phase: 'sync' | 'job'): Promise<string> => {
      let text = '';
      try {
        text = await chatWithAssistant(messages, '', undefined, bellaMode ?? 'china', agentId, undefined, undefined, {
          bellaUserId: req.bellaUser?.id ?? null,
        });
      } catch (firstErr: any) {
        const msg = firstErr?.message || String(firstErr);
        const requiredSkills = inferRequiredSkills(resolvedUploads);
        if (resolvedUploads.length > 0 && isToolDeniedLike(msg)) {
          pushDebugEvent('error', `openclaw.call.denied_first.${phase}`, msg);
          const retryMessages = [
            ...messages,
            { role: 'system' as const, content: buildSkillRetrySystemMessage(requiredSkills, resolvedUploads) },
          ];
          pushDebugEvent('info', `openclaw.call.retry_skill_first.${phase}`, `requiredSkills=${requiredSkills.join(',') || 'n/a'}`);
          text = await chatWithAssistant(retryMessages, '', undefined, bellaMode ?? 'china', agentId, undefined, undefined, {
            bellaUserId: req.bellaUser?.id ?? null,
          });
        } else if (resolvedUploads.length === 0 && isBrowserFailureRetryable(msg)) {
          pushDebugEvent('error', `openclaw.call.browser_fail_first.${phase}`, msg);
          const retryMessages = [
            ...messages,
            {
              role: 'system' as const,
              content: buildBrowserFailureRetrySystemMessage(bellaMode === 'world' ? 'world' : 'china'),
            },
          ];
          pushDebugEvent('info', `openclaw.call.retry_browser_escalation.${phase}`, 'openclaw-profile-then-web-to-markdown');
          text = await chatWithAssistant(retryMessages, '', undefined, bellaMode ?? 'china', agentId, undefined, undefined, {
            bellaUserId: req.bellaUser?.id ?? null,
          });
        } else if (
          resolvedUploads.length === 0 &&
          runtimeOptions.searchBrowserFallbackToBing &&
          isSearchToolFailureRetryable(msg)
        ) {
          pushDebugEvent('error', `openclaw.call.search_fail_first.${phase}`, msg);
          const retryMessages = [
            ...messages,
            {
              role: 'system' as const,
              content: buildSearchBrowserBingRetrySystemMessage(trimmed),
            },
          ];
          pushDebugEvent('info', `openclaw.call.retry_search_bing_browser.${phase}`, 'browser-only-bing');
          text = await chatWithAssistant(retryMessages, '', undefined, bellaMode ?? 'china', agentId, undefined, undefined, {
            bellaUserId: req.bellaUser?.id ?? null,
          });
        } else {
          throw firstErr;
        }
      }

      if (resolvedUploads.length === 0 && hasUrlInput && isContentFailureRetryable(text)) {
        pushDebugEvent('error', `openclaw.call.content_fail_first.${phase}`, text.slice(0, 240));
        if (phase === 'sync' && clientDisconnected) {
          pushDebugEvent('info', `openclaw.call.retry_content_skip.${phase}`, 'client-disconnected');
          return text;
        }
        const retryMessages = [
          ...messages,
          {
            role: 'system' as const,
            content: buildContentFailureRetrySystemMessage(urlIntent.urls, bellaMode === 'world' ? 'world' : 'china'),
          },
        ];
        pushDebugEvent('info', `openclaw.call.retry_content_escalation.${phase}`, 'web-to-markdown-only');
        text = await chatWithAssistant(retryMessages, '', undefined, bellaMode ?? 'china', agentId, undefined, undefined, {
          bellaUserId: req.bellaUser?.id ?? null,
        });
      }

      return text;
    };

    // If jobs are running and the user asks for progress/ETA, answer from live job status instead of a fresh LLM turn.
    if (intent === 'chat_only' && isProgressQuery(trimmed)) {
      const maybeJobId = extractJobIdFromMessage(trimmed);
      let target: BellaJobStatus | null = null;
      if (maybeJobId) {
        target = bellaJobManager.getJobStatus(maybeJobId);
      }
      if (!target) {
        const activeJobs = bellaJobManager.getActiveJobsForSession(sessionKey);
        target = activeJobs[0] || null;
      }
      if (target) {
        const recent = (target.recentEvents || [])
          .slice(-6)
          .map((e) => `- [${e.level}] ${e.event}${e.detail ? `: ${e.detail}` : ''}`)
          .join('\n');
        const executorReply = [
          `当前进行中的任务：${target.jobDescription}`,
          `job_id=${target.jobId}`,
          `stage=${target.stage}`,
          `最近更新时间：${timeAgoText(target.updatedAt)} 前（ts=${new Date(target.updatedAt).toISOString()}）`,
          recent ? `最近事件：\n${recent}` : `最近事件：无`,
        ].join('\n');

        const outerReply = await composeBellaFinalReply({
          mode: modeForPersona,
          replyLanguage: replyLang.lang,
          userMessage: trimmed,
          history: (history || []).map((m) => ({ role: m.role, content: m.content })),
          executorReply,
          companionContext: companionMemoryContext,
        });
        rememberTurn(sessionKey, 'assistant', outerReply);
        void maybeScheduleCompanionMemoryWrite({
          userId: req.bellaUser?.id,
          userText: trimmed,
          assistantText: outerReply,
        });
        return res.json({
          reply: outerReply,
          imageUrl: undefined,
          videoUrl: undefined,
          downloads: [],
        });
      }
    }

    if (useOpenClawFlow && Date.now() < openClawRateLimitUntil) {
      const waitSec = Math.ceil((openClawRateLimitUntil - Date.now()) / 1000);
      const msg = `⚠️ 上游模型限流中，请约 ${waitSec}s 后重试。`;
      pushDebugEvent('error', 'openclaw.rate_limited.cooldown', msg);
      return res.status(429).json({ error: msg });
    }

    bellaLog.requestStart(trimmed);

    let replyText: string;
    let mode: 'text_only' | 'text_and_image' | 'text_and_video' = 'text_only';

    if (useOpenClawFlow) {
      const shouldShowProgressJob =
        resolvedUploads.length > 0 ||
        effectiveRouteDecision.needsImage ||
        wantsVideo(trimmed) ||
        wantsSelfie(trimmed) ||
        wantsWhatDoing(trimmed);
      if (!shouldShowProgressJob) {
        // Simple Q&A: synchronous OpenClaw call with immediate text (no progress bubble).
        const syncStartAt = Date.now();
        bellaLog.openclawStart();
        replyText = await callOpenClawWithRetries(
          (process.env.OPENCLAW_AGENT_ID || 'main').trim() || 'main',
          'sync'
        );
        bellaLog.openclawDone(Date.now() - syncStartAt, replyText.length);
        const finalReply = await composeBellaFinalReply({
          mode: modeForPersona,
          replyLanguage: replyLang.lang,
          userMessage: trimmed,
          history: (history || []).map((m) => ({ role: m.role, content: m.content })),
          executorReply: replyText,
          downloadsCount: 0,
          hasImage: false,
          hasVideo: false,
          companionContext: companionMemoryContext,
        });
        bellaLog.requestDone('text_only', false);
        rememberTurn(sessionKey, 'assistant', finalReply);
        void maybeScheduleCompanionMemoryWrite({
          userId: req.bellaUser?.id,
          userText: trimmed,
          assistantText: finalReply,
        });
        return res.json({
          reply: finalReply,
          imageUrl: undefined,
          videoUrl: undefined,
          downloads: [],
        });
      }
      // Full OpenClaw path: background job (parallel jobs + isolated workspaces); frontend polls via SSE.
      const jobId = crypto.randomUUID();
      // Prefer stable agents (main-china/main-world) so skills/config stay consistent vs ephemeral job agents.
      const jobAgentId = (process.env.OPENCLAW_AGENT_ID || 'main').trim() || 'main';
      const jobDescription =
        resolvedUploads.length > 0
          ? `${trimmed}（${resolvedUploads.slice(0, 3).map((f) => f.originalName).join(',')}${resolvedUploads.length > 3 ? '...' : ''}）`
          : trimmed;

      bellaJobManager.createJob({ jobId, sessionKey, jobAgentId, jobDescription });

      // Respond immediately so the chat HTTP request does not block on long-running work.
      res.json({
        jobId,
        jobDescription,
        stage: bellaJobManager.getJobStatus(jobId)?.stage || 'queued',
        reply: undefined,
        imageUrl: undefined,
        videoUrl: undefined,
        downloads: [],
      });

      const memoryUserId = req.bellaUser?.id ?? null;

      // Background worker: copy uploads, run OpenClaw, scan outputs, then outer persona LLM for Bella text.
      void (async () => {
        const t0 = Date.now();
        try {
          const jobWorkspaceRoot = getOpenClawWorkspaceRootForAgent(jobAgentId);
          const jobInputDir = path.join(jobWorkspaceRoot, 'bella-inputs');
          const jobOutputDir = path.join(jobWorkspaceRoot, 'bella-outputs');
          fs.mkdirSync(jobInputDir, { recursive: true });
          fs.mkdirSync(jobOutputDir, { recursive: true });

          // 1) Copy uploaded inputs into the job workspace
          bellaJobManager.updateStage(jobId, 'preparing_inputs');
          void syncStarOfficeState({
            state: normalizeBellaStageToStarOfficeState('preparing_inputs'),
            detail: normalizeStateDetailForBellaStage('preparing_inputs'),
          });
          bellaJobManager.pushEvent(jobId, { ts: Date.now(), level: 'info', event: 'inputs.copy.start' });
          for (const f of resolvedUploads) {
            if (!fs.existsSync(f.fullPath)) continue;
            const buf = fs.readFileSync(f.fullPath);
            const toWithId = path.join(jobInputDir, `${f.id}-${f.originalName}`);
            const toPlain = path.join(jobWorkspaceRoot, f.originalName);
            fs.writeFileSync(toWithId, buf);
            fs.writeFileSync(toPlain, buf);
          }
          bellaJobManager.pushEvent(jobId, { ts: Date.now(), level: 'info', event: 'inputs.copy.done' });

          if (bellaJobManager.isCancelled(jobId)) {
            void syncStarOfficeState({ state: 'idle', detail: normalizeStateDetailForBellaStage('cancelled') });
            return;
          }

          // 2) Invoke OpenClaw
          bellaJobManager.updateStage(jobId, 'running_openclaw');
          void syncStarOfficeState({
            state: normalizeBellaStageToStarOfficeState('running_openclaw'),
            detail: normalizeStateDetailForBellaStage('running_openclaw'),
          });
          bellaLog.openclawStart();
          replyText = '';
          try {
            const outputDirsForScan = [jobOutputDir, jobWorkspaceRoot];
            const beforeByDir = outputDirsForScan.map((d) => ({ dir: d, m: listOutputFilesWithMtime(d) }));

            pushDebugEvent(
              'info',
              'openclaw.call.start',
              `requestId=${requestId} jobId=${jobId} agent=${jobAgentId} workspace=${jobWorkspaceRoot} clientClosed=${clientDisconnected}`
            );

            replyText = await callOpenClawWithRetries(jobAgentId, 'job');

            // 3) Scan outputs and register downloadable artifacts
            bellaJobManager.updateStage(jobId, 'collecting_outputs');
            void syncStarOfficeState({
              state: normalizeBellaStageToStarOfficeState('collecting_outputs'),
              detail: normalizeStateDetailForBellaStage('collecting_outputs'),
            });
            const baseUrl = (process.env.BACKEND_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
            const downloads: { id: string; name: string; size: number; url: string }[] = [];
            const seen = new Set<string>();
            for (const { dir, m: beforeOutputs } of beforeByDir) {
              const afterOutputs = listOutputFilesWithMtime(dir);
              for (const [name, mtime] of afterOutputs.entries()) {
                const prev = beforeOutputs.get(name);
                if (typeof prev === 'number' && prev === mtime) continue;
                if (!shouldTrackAsDownloadOutput(name)) continue;
                const fullPath = path.join(dir, name);
                if (seen.has(fullPath)) continue;
                seen.add(fullPath);
                const fileMeta = registerDownloadableFile(fullPath, name);
                downloads.push({
                  id: fileMeta.id,
                  name: fileMeta.originalName,
                  size: fileMeta.size,
                  url: `${baseUrl}/api/assistant/download/${fileMeta.id}`,
                });
                pushDebugEvent('info', 'openclaw.output.detected', `${name} (${fileMeta.size} bytes) @ ${dir}`);
              }
            }

            bellaLog.openclawDone(Date.now() - t0, replyText.length);
            pushDebugEvent('info', 'openclaw.call.done', `jobId=${jobId} downloads=${downloads.length}`);

            if (bellaJobManager.isCancelled(jobId)) {
              void syncStarOfficeState({ state: 'idle', detail: normalizeStateDetailForBellaStage('cancelled') });
              return;
            }

            // 4) Images/video: prefer artifacts already in the job workspace; otherwise Doubao fallback generation.
            let imageUrl: string | undefined;
            let videoUrl: string | undefined;
            const needVideo = wantsVideo(trimmed);
            const needWhatDoing = wantsWhatDoing(trimmed);
            const needSelfie = wantsSelfie(trimmed);
            const scene = needWhatDoing ? pickRandomWhatDoingScene() : null;
            let replyFormMode: 'text_only' | 'text_and_image' | 'text_and_video' = 'text_only';
            const baseUrl2 = (process.env.BACKEND_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

            const wsVideo = path.join(jobWorkspaceRoot, 'bella_video.mp4');
            const wsImage = path.join(jobWorkspaceRoot, 'bella_selfie.png');
            const hasWsVideo = fs.existsSync(wsVideo);
            const hasWsImage = fs.existsSync(wsImage);
            // `bella_selfie.png` / `bella_video.mp4` are media outputs from OpenClaw/seedream/seedance — used only to
            // detect whether this job already produced returnable image/video assets.
            // True user reference images come from this turn's uploads (`resolvedUploads`) and are passed as repeated `--image` args.
            // When multiple reference images exist, skip the short-circuit that returns existing output media so every reference flows into seedream/seedance.
            const MAX_REFERENCE_IMAGES = 8;
            const referenceImagePaths = resolvedUploads
              .filter((f) => IMAGE_EXTS.has(path.extname(f.originalName).toLowerCase()))
              .slice(0, MAX_REFERENCE_IMAGES)
              .map((f) => f.fullPath);
            const forceFallbackVideo = referenceImagePaths.length > 1;
            const forceFallbackImage = referenceImagePaths.length > 1;

            if (needVideo || (needWhatDoing && scene && Math.random() < 0.5)) {
              if (hasWsVideo && !forceFallbackVideo) {
                videoUrl = `${baseUrl2}/api/assistant/media/bella_video.mp4?agentId=${encodeURIComponent(jobAgentId)}`;
                replyFormMode = 'text_and_video';
              } else {
                bellaLog.mediaGen('video', scene?.label);
                const result = await generateSelfieVideo(scene?.prompt, referenceImagePaths);
                videoUrl = result.url;
                replyFormMode = 'text_and_video';
              }
            } else if (needSelfie || needWhatDoing) {
              if (hasWsImage && !forceFallbackImage) {
                imageUrl = `${baseUrl2}/api/assistant/media/bella_selfie.png?agentId=${encodeURIComponent(jobAgentId)}`;
                replyFormMode = 'text_and_image';
              } else {
                bellaLog.mediaGen('image', scene?.label);
                // Multi-image fusion depends on the OpenClaw script; pass every reference path on the fallback path.
                const result = await generateSelfieImage(scene?.prompt, referenceImagePaths.length > 0 ? referenceImagePaths : undefined);
                imageUrl = result.url;
                replyFormMode = 'text_and_image';
              }
            }

            // 5) Outer persona LLM composes the final Bella reply
            bellaJobManager.updateStage(jobId, 'generating_final_reply');
            void syncStarOfficeState({
              state: normalizeBellaStageToStarOfficeState('generating_final_reply'),
              detail: normalizeStateDetailForBellaStage('generating_final_reply'),
            });
            let jobCompanionContext: string | undefined;
            try {
              jobCompanionContext = await loadCompanionMemoryContext({
                userId: memoryUserId,
                mode: modeForPersona,
                userMessage: trimmed,
              });
            } catch {
              jobCompanionContext = undefined;
            }
            const finalReply = await composeBellaFinalReply({
              mode: modeForPersona,
              replyLanguage: replyLang.lang,
              userMessage: trimmed,
              history: (history || []).map((m) => ({ role: m.role, content: m.content })),
              executorReply: replyText,
              downloadsCount: downloads.length,
              hasImage: !!imageUrl,
              hasVideo: !!videoUrl,
              companionContext: jobCompanionContext,
            });

            if (bellaJobManager.isCancelled(jobId)) {
              void syncStarOfficeState({ state: 'idle', detail: normalizeStateDetailForBellaStage('cancelled') });
              return;
            }

            bellaLog.requestDone(replyFormMode, !!(imageUrl || videoUrl));
            rememberTurn(sessionKey, 'assistant', finalReply);

            bellaJobManager.setResult(jobId, {
              reply: finalReply,
              imageUrl,
              videoUrl,
              downloads,
            });
            void maybeScheduleCompanionMemoryWrite({
              userId: memoryUserId,
              userText: trimmed,
              assistantText: finalReply,
            });
            void syncStarOfficeState({ state: 'idle', detail: normalizeStateDetailForBellaStage('succeeded') });
          } catch (e: any) {
            if (isRateLimitLike(e?.message || String(e))) {
              openClawRateLimitUntil = Date.now() + OPENCLAW_RATE_LIMIT_COOLDOWN_MS;
              pushDebugEvent('error', 'openclaw.rate_limited', `cooldownMs=${OPENCLAW_RATE_LIMIT_COOLDOWN_MS}`);
            }
            pushDebugEvent('error', 'openclaw.call.fail', e?.message || String(e));
            bellaLog.openclawFail(e?.message || String(e));
            bellaJobManager.setError(jobId, e?.message || String(e));
            void syncStarOfficeState({
              state: 'error',
              detail: normalizeStateDetailForBellaStage('failed', e?.message || String(e)),
            });
          }
        } catch (e: any) {
          bellaJobManager.setError(jobId, e?.message || String(e));
          void syncStarOfficeState({
            state: 'error',
            detail: normalizeStateDetailForBellaStage('failed', e?.message || String(e)),
          });
        }
      })();

      return;
    }

    const referenceImagePaths = resolvedUploads
      .filter((f) => IMAGE_EXTS.has(path.extname(f.originalName).toLowerCase()))
      .map((f) => f.fullPath);
    const referenceImagePath = referenceImagePaths[0];

    // Non-OpenClaw providers (e.g. Doubao) keep the legacy decision + generation path.
    void syncStarOfficeState({ state: 'writing', detail: '我在工作中' });
    mode = await planReplyMode(
      messages.filter((m) => m.role !== 'system') as { role: 'user' | 'assistant'; content: string }[],
      ''
    );
    const isWhatDoing = wantsWhatDoing(trimmed);
    const needMedia = mode === 'text_and_image' || mode === 'text_and_video';
    const scene = isWhatDoing && needMedia ? pickRandomWhatDoingScene() : null;
    replyText = await chatWithAssistant(
      messages,
      '',
      scene ? scene.label : undefined,
      modeForPersona,
      undefined,
      replyLang.lang,
      companionMemoryContext
    );

    let imageUrl: string | undefined;
    let videoUrl: string | undefined;
    if (mode === 'text_and_video') {
      bellaLog.mediaGen('video', scene?.label);
      const result = await generateSelfieVideo(scene?.prompt, referenceImagePaths);
      videoUrl = result.url;
    } else if (mode === 'text_and_image') {
      bellaLog.mediaGen('image', scene?.label);
      const result = await generateSelfieImage(scene?.prompt, referenceImagePath);
      imageUrl = result.url;
    }
    bellaLog.requestDone(mode, !!(imageUrl || videoUrl));
    rememberTurn(sessionKey, 'assistant', replyText);
    void maybeScheduleCompanionMemoryWrite({
      userId: req.bellaUser?.id,
      userText: trimmed,
      assistantText: replyText,
    });
    void syncStarOfficeState({ state: 'idle', detail: '待命中' });
    res.json({
      reply: replyText,
      imageUrl: imageUrl || undefined,
      videoUrl: videoUrl || undefined,
      downloads: [],
    });
  } catch (error: any) {
    if (isRateLimitLike(error?.message || String(error))) {
      const waitSec = Math.ceil(Math.max(1, (openClawRateLimitUntil - Date.now()) / 1000));
      const msg = `⚠️ API rate limit reached. Please retry in about ${waitSec}s.`;
      pushDebugEvent('error', 'chat.fail.rate_limit', msg);
      return res.status(429).json({ error: msg });
    }
    pushDebugEvent('error', 'chat.fail', error?.message || String(error));
    console.error('助理对话失败:', error);
    void syncStarOfficeState({ state: 'error', detail: error?.message || String(error) || '出错了' });
    res.status(500).json({
      error: error.message || '助理对话失败',
    });
  }
});

/** GET /api/assistant/download/:id — download processed workspace files */
router.get('/download/:id', (req, res) => {
  const id = req.params.id;
  const meta = downloadableFiles.get(id);
  if (!meta || !fs.existsSync(meta.fullPath)) {
    pushDebugEvent('error', 'download.miss', `id=${id}`);
    return res.status(404).json({ error: '文件不存在或已过期' });
  }
  pushDebugEvent('info', 'download.hit', `${meta.originalName} (${meta.size} bytes)`);
  res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
  res.download(meta.fullPath, meta.originalName);
});

/** GET /api/assistant/debug-files — debug snapshot (uploads/outputs/downloads/recent events) */
router.get('/debug-files', (_req, res) => {
  res.json(buildDebugSnapshot());
});

/** GET /api/assistant/debug-files/export — download JSON diagnostics bundle */
router.get('/debug-files/export', (_req, res) => {
  const snapshot = buildDebugSnapshot();
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-');
  const filename = `bella-debug-report-${ts}.json`;
  const payload = {
    exportedAt: now.toISOString(),
    snapshot,
  };
  pushDebugEvent('info', 'debug.export', filename);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(JSON.stringify(payload, null, 2));
});

/** GET /api/assistant/skills-preflight — verify file-related skills are installed/enabled */
router.get('/skills-preflight', (_req, res) => {
  const report = buildSkillsPreflight();
  if (!report.allOk) {
    pushDebugEvent('error', 'skills.preflight.fail', report.checks.filter((c) => !c.ok).map((c) => `${c.skill}:${c.hint}`).join(', '));
  } else {
    pushDebugEvent('info', 'skills.preflight.ok', 'all file-task skills are ready');
  }
  res.json(report);
});

/** GET /api/assistant/media/:filename — serve seedream/seedance media from workspace (allowlist) */
router.get('/media/:filename', (req, res) => {
  const filename = req.params.filename;
  const allowed = getAllowedWorkspaceMediaNames();
  if (!allowed.includes(filename)) {
    return res.status(404).json({ error: '未找到' });
  }
  const agentId = String((req.query as any)?.agentId || '').trim();
  const ws = agentId ? getOpenClawWorkspaceRootForAgent(agentId) : getOpenClawWorkspacePath();
  const fullPath = path.join(ws, filename);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: '未找到' });
  }
  const ext = path.extname(filename).toLowerCase();
  const mime = ext === '.mp4' ? 'video/mp4' : ext === '.png' ? 'image/png' : 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  res.sendFile(fullPath);
});

/** GET /api/assistant/config — Bella models + skill summary for the active mode */
router.get('/config', async (_req, res) => {
  try {
    const mode = ((_req.query.mode as string) || 'china').toLowerCase();
    const isChina = mode !== 'world';
    const runtimeOptions = getBellaRuntimeOptions(isChina ? 'china' : 'world');
    const provider = (process.env.ASSISTANT_CHAT_PROVIDER || 'openai').toLowerCase();
    let model = 'Unknown';
    if (provider === 'openclaw' || provider === 'clawra') {
      model = isChina
        ? (process.env.OPENCLAW_MODEL_CHINA || 'minimax/MiniMax-M2.5')
        : (process.env.OPENCLAW_MODEL_WORLD || 'openai-codex/gpt-5.3-codex');
    } else if (provider === 'doubao') {
      model = process.env.DOUBAO_MODEL || process.env.DOUBAO_ENDPOINT_ID || 'doubao-seed-1-6-251015';
    } else if (provider === 'kimi') {
      model = process.env.KIMI_MODEL || 'moonshot-v1-32k';
    } else if (provider === 'openai') {
      model = process.env.ASSISTANT_CHAT_MODEL || 'gpt-4o-mini';
    }
    let skills = getOpenClawLiveSkills(isChina);
    // Fallback: keep the old stable baseline when OpenClaw local config is temporarily unavailable.
    if (skills.length === 0) {
      skills = [
        { id: 'weather', name: 'Weather', summary: isChina ? 'Open-Meteo API (China-accessible)' : 'Open-Meteo + wttr.in (World)' },
        { id: 'pdf', name: 'Pdf', summary: 'Read/extract PDF content and convert to artifacts' },
        { id: 'canvas-design', name: 'Canvas Design', summary: 'Create posters, art, designs (.pdf/.png)' },
        { id: 'docx', name: 'Docx', summary: 'Create/edit Word documents with tracked changes' },
        { id: 'frontend-design', name: 'Frontend Design', summary: 'Production-grade web UI (HTML/React)' },
        { id: 'pptx', name: 'Pptx', summary: 'Create/edit PowerPoint presentations' },
        { id: 'xlsx', name: 'Xlsx', summary: 'Spreadsheets with formulas and formatting' },
      ];
    }
    res.json({ mode: isChina ? 'china' : 'world', model, skills, runtimeOptions });
  } catch (error: any) {
    console.error('获取助理配置失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/assistant/runtime-options — read Bella runtime toggles for current mode */
router.get('/runtime-options', (req, res) => {
  const mode = String((req.query.mode as string) || 'china').toLowerCase() === 'world' ? 'world' : 'china';
  res.json({ mode, runtimeOptions: getBellaRuntimeOptions(mode) });
});

/** POST /api/assistant/runtime-options — update Bella runtime toggles for current mode */
router.post('/runtime-options', (req, res) => {
  const mode = String((req.body?.mode as string) || 'china').toLowerCase() === 'world' ? 'world' : 'china';
  const patch = req.body?.runtimeOptions || {};
  const next = updateBellaRuntimeOptions(mode, {
    searchBrowserFallbackToBing:
      typeof patch.searchBrowserFallbackToBing === 'boolean' ? patch.searchBrowserFallbackToBing : undefined,
    enableWebSearch: typeof patch.enableWebSearch === 'boolean' ? patch.enableWebSearch : undefined,
    enableWebFetch: typeof patch.enableWebFetch === 'boolean' ? patch.enableWebFetch : undefined,
  });
  res.json({ mode, runtimeOptions: next });
});

/** POST /api/assistant/runtime-options/reset — reset toggles for current mode to env defaults */
router.post('/runtime-options/reset', (req, res) => {
  const mode = String((req.body?.mode as string) || 'china').toLowerCase() === 'world' ? 'world' : 'china';
  const next = resetBellaRuntimeOptions(mode);
  res.json({ mode, runtimeOptions: next });
});

export default router;
