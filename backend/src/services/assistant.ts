import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { mcpManager } from '../mcp/manager';
import { bellaLog } from '../lib/bella-log';
import { buildBellaDirectChatSystemPrompt } from './bellaPersona';

function getOpenClawConfigPath(): string | null {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (!home) return null;
  return path.join(home, '.openclaw', 'openclaw.json');
}

function readOpenClawConfigSafe(): any | null {
  try {
    const p = getOpenClawConfigPath();
    if (!p || !fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function flattenOpenClawModelIds(cfg: any): string[] {
  const ids: string[] = [];
  const providers = cfg?.models?.providers;
  if (!providers || typeof providers !== 'object') return [];
  for (const k of Object.keys(providers)) {
    const ms = providers?.[k]?.models;
    if (!Array.isArray(ms)) continue;
    for (const m of ms) {
      if (m?.id && typeof m.id === 'string') {
        const modelId = m.id.trim();
        if (!modelId) continue;
        // Accept both OpenClaw model spellings:
        // - bare id: MiniMax-M2.7
        // - provider prefix: minimax-cn/MiniMax-M2.7
        ids.push(modelId);
        ids.push(`${k}/${modelId}`);
      }
    }
  }
  return Array.from(new Set(ids));
}

function pickOpenClawAgentModelCandidates(cfg: any, agentId: string): string[] {
  const list = cfg?.agents?.list;
  if (Array.isArray(list)) {
    const entry = list.find((a: any) => a?.id === agentId);
    const primary = entry?.model?.primary;
    const fallbacks = entry?.model?.fallbacks;
    return [primary, ...(Array.isArray(fallbacks) ? fallbacks : [])].filter(Boolean).map(String);
  }
  const primary = cfg?.agents?.defaults?.model?.primary;
  return primary ? [String(primary)] : [];
}

function getOpenClawMaxTokens(): number {
  const raw = Number((process.env.OPENCLAW_MAX_TOKENS || '').trim());
  if (Number.isFinite(raw) && raw >= 256) return Math.floor(raw);
  return 2048;
}

function getOpenClawGatewayTimeoutMs(): number {
  const raw = Number((process.env.OPENCLAW_GATEWAY_TIMEOUT_MS || '').trim());
  if (Number.isFinite(raw) && raw >= 1000) return Math.floor(raw);
  return 600000;
}

function getOpenClawMaxContinuations(): number {
  const raw = Number((process.env.OPENCLAW_MAX_CONTINUATIONS || '').trim());
  if (Number.isFinite(raw) && raw >= 0) return Math.floor(raw);
  return 2;
}

function buildContinuationPrompt(): string {
  return '你上一段输出被长度限制截断了。请仅继续输出剩余内容，不要重复已输出部分，也不要加额外前言。';
}

function logToolStepsFromText(text: string) {
  const lines = (text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const toolLines = lines.filter((l) =>
    /^\[tools\]/i.test(l) || /\b(web_search|web_fetch|browser_[a-z_]+|web-to-markdown|web_to_markdown)\b/i.test(l),
  );
  for (const line of toolLines.slice(-25)) {
    bellaLog.openclawToolStep(line);
  }
}

/** OpenClaw workspace path (seedream/seedance write bella_selfie.png / bella_video.mp4). */
const OPENCLAW_WORKSPACE_ALLOWED_MEDIA = ['bella_selfie.png', 'bella_video.mp4'];

export function getOpenClawWorkspacePath(): string {
  const p = (process.env.OPENCLAW_WORKSPACE || '').trim();
  if (p) return p;
  const candidates = getOpenClawWorkspaceCandidates();
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.openclaw', 'workspace');
}

/** Candidate workspace roots (workspace-main / workspace-<agentId>, etc.), deduped. */
export function getOpenClawWorkspaceCandidates(): string[] {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const agentId = (process.env.OPENCLAW_AGENT_ID || 'main').trim();
  const envWorkspace = (process.env.OPENCLAW_WORKSPACE || '').trim();
  const baseRoot = path.join(home, '.openclaw');
  const list = [
    envWorkspace,
    path.join(baseRoot, `workspace-${agentId}`),
    path.join(baseRoot, 'workspace-main'),
    path.join(baseRoot, 'workspace'),
  ].filter(Boolean);
  return Array.from(new Set(list));
}

/** Return filesystem path to seedream/seedance media if present, else null. */
export function getWorkspaceMediaPath(type: 'image' | 'video'): string | null {
  const file = type === 'image' ? 'bella_selfie.png' : 'bella_video.mp4';
  const candidates = getOpenClawWorkspaceCandidates();
  for (const ws of candidates) {
    const full = path.join(ws, file);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

/** Allowlisted media filenames inside the workspace. */
export function getAllowedWorkspaceMediaNames(): string[] {
  return [...OPENCLAW_WORKSPACE_ALLOWED_MEDIA];
}


/** Call Douyin MCP helpers (e.g. share-link parsing); swallow errors and return null. */
export async function callDouyinMcpTool(
  toolName: string,
  args: any
): Promise<any | null> {
  try {
    const result = await mcpManager.callTool({
      serverId: 'douyin-mcp',
      toolName,
      args,
    });
    if (!result.ok) {
      console.warn('[助理] 调用抖音 MCP 失败:', result.error);
      return null;
    }
    return result.data;
  } catch (e: any) {
    console.error('[助理] 调用抖音 MCP 异常:', e?.message || String(e));
    return null;
  }
}

/** Lifestyle scenes for random “what are you doing” media prompts. */
export const WHAT_DOING_SCENES = [
  { label: '在看电视', prompt: '年轻亚洲女性在客厅沙发上看电视，休闲居家，放松，写实风格，高清' },
  { label: '在健身房', prompt: '年轻亚洲女性在健身房运动，活力，写实风格，高清' },
  { label: '在沙滩', prompt: '年轻亚洲女性在海边沙滩，阳光度假，写实风格，高清' },
  { label: '在度假', prompt: '年轻亚洲女性在度假酒店或风景区，惬意，写实风格，高清' },
  { label: '在逛街', prompt: '年轻亚洲女性在商场或街头逛街，时尚，写实风格，高清' },
  { label: '在喝咖啡', prompt: '年轻亚洲女性在咖啡馆喝咖啡，文艺氛围，写实风格，高清' },
  { label: '在看书', prompt: '年轻亚洲女性在书店或窗边看书，安静，写实风格，高清' },
  { label: '在做饭', prompt: '年轻亚洲女性在厨房做饭，居家温馨，写实风格，高清' },
  { label: '在跑步', prompt: '年轻亚洲女性在公园或户外跑步，运动活力，写实风格，高清' },
  { label: '在自拍', prompt: '年轻亚洲女性对镜自拍，日常，写实风格，高清' },
];

/** Pick a random “what are you doing” scene label/prompt pair. */
export function pickRandomWhatDoingScene(): (typeof WHAT_DOING_SCENES)[0] {
  return WHAT_DOING_SCENES[Math.floor(Math.random() * WHAT_DOING_SCENES.length)];
}

export type OpenClawChatExtras = {
  /** Bella `bella_users.id`; forwarded as `x-bella-user-id` for gateway-side hooks / logs. */
  bellaUserId?: string | null;
};

/** Call configured chat model; `sceneHint` keeps text aligned with the picked “what doing” scene. */
export async function chatWithAssistant(
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  _hotspotContext: string,
  sceneHint?: string,
  mode?: 'china' | 'world',
  openclawAgentId?: string,
  replyLanguage?: 'zh' | 'en' | 'ja' | 'ko' | 'ru',
  companionContext?: string,
  openClawExtras?: OpenClawChatExtras
): Promise<string> {
  const providerRaw = (process.env.ASSISTANT_CHAT_PROVIDER || 'openai').toLowerCase();
  // Legacy alias: map clawra -> openclaw for older env files.
  const provider = providerRaw === 'clawra' ? 'openclaw' : providerRaw;
  // OpenClaw persona comes from SOUL; skip injecting hotspot context.
  const useOpenClawPersona = provider === 'openclaw';
  let fullMessages: { role: 'user' | 'assistant' | 'system'; content: string }[];

  if (useOpenClawPersona) {
    // Preserve upstream (routes) system messages so URL routing policies stay in effect.
    fullMessages = [...messages];
    // China mode: remind the model to prefer web-extraction chains for article-body tasks.
    if (mode === 'china') {
      fullMessages = [
        {
          role: 'system',
          content:
            '【国内模式】若用户已给出具体文章 URL 且目标是抓正文/总结，网页技能顺序为：web-to-markdown -> web_fetch -> browser(openclaw profile)。',
        },
        ...fullMessages,
      ];
    }
    if (companionContext?.trim()) {
      const mem = companionContext.trim();
      const isZh = replyLanguage === 'zh';
      fullMessages = [
        {
          role: 'system',
          content: isZh
            ? `【跨会话伴侣记忆】以下为经用户同意后检索的 gbrain 片段；若与本轮对话或 SOUL 冲突，以当前用户消息与 SOUL 为准：\n${mem}`
            : `Cross-session companion memory (gbrain, user opted in). If this conflicts with SOUL or the current turn, prefer SOUL and the latest user message:\n${mem}`,
        },
        ...fullMessages,
      ];
    }
  } else {
    const resolvedMode: 'china' | 'world' = mode === 'world' ? 'world' : 'china';
    let systemWithContext = buildBellaDirectChatSystemPrompt(resolvedMode, replyLanguage, sceneHint);
    if (companionContext?.trim()) {
      systemWithContext += [
        '',
        '---',
        'Known preferences (from gbrain; user-approved when companion memory is on).',
        'If anything conflicts with this turn, follow the current user message and SOUL instead.',
        companionContext.trim(),
      ].join('\n');
    }
    fullMessages = [
      { role: 'system' as const, content: systemWithContext },
      ...messages.filter((m) => m.role !== 'system'),
    ];
  }

  if (provider === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    if (!key) throw new Error('OPENAI_API_KEY 未配置，无法使用助理对话');
    const res = await axios.post(
      `${base}/chat/completions`,
      {
        model: process.env.ASSISTANT_CHAT_MODEL || 'gpt-4o-mini',
        messages: fullMessages,
        temperature: 0.8,
        max_tokens: 1024,
      },
      {
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        timeout: 60000,
      }
    );
    const text = res.data?.choices?.[0]?.message?.content?.trim() || '';
    if (!text) throw new Error('OpenAI 返回为空');
    return text;
  }

  if (provider === 'doubao') {
    const key = process.env.DOUBAO_API_KEY;
    const base = (process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com')
      .replace(/\/api\/v3\/?$/, '')
      .replace(/\/$/, '');
    const model = process.env.DOUBAO_MODEL || process.env.DOUBAO_ENDPOINT_ID || 'doubao-seed-1-6-251015';
    if (!key) throw new Error('DOUBAO_API_KEY 未配置，无法使用助理对话');
    const res = await axios.post(
      `${base}/api/v3/chat/completions`,
      {
        model,
        messages: fullMessages,
        temperature: 0.8,
        max_tokens: 1024,
      },
      {
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        timeout: 60000,
      }
    );
    const text = res.data?.choices?.[0]?.message?.content?.trim() || '';
    if (!text) throw new Error('豆包返回为空');
    return text;
  }

  if (provider === 'kimi') {
    const key = process.env.KIMI_API_KEY;
    const base = (process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1').replace(/\/$/, '');
    const model = process.env.KIMI_MODEL || 'moonshot-v1-32k';
    if (!key) throw new Error('KIMI_API_KEY 未配置，无法使用助理对话');
    const res = await axios.post(
      `${base}/chat/completions`,
      {
        model,
        messages: fullMessages,
        temperature: 0.8,
        max_tokens: 1024,
      },
      {
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        timeout: 60000,
      }
    );
    const text = res.data?.choices?.[0]?.message?.content?.trim() || '';
    if (!text) throw new Error('Kimi 返回为空');
    return text;
  }

  if (provider === 'openclaw') {
    const gatewayUrl = (process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789').replace(/\/$/, '');
    const token =
      process.env.OPENCLAW_GATEWAY_TOKEN ||
      process.env.OPENCLAW_GATEWAY_PASSWORD ||
      process.env.OPENCLAW_GATEWAY_AUTH;
    if (!token) throw new Error('OPENCLAW_GATEWAY_TOKEN 未配置，无法使用 OpenClaw 助理');
    // China vs world: different model stacks (China minimax-cn w/o proxy; world gemini + minimax-global fallback).
    const isChina = mode !== 'world';
    const agentId = openclawAgentId || process.env.OPENCLAW_AGENT_ID || 'main';
    const primaryModel = isChina
      ? (process.env.OPENCLAW_MODEL_CHINA || 'minimax/MiniMax-M2.7')
      : (process.env.OPENCLAW_MODEL_WORLD || 'gemini/gemini-1.5-pro');
    const fallbackModels = (process.env.OPENCLAW_MODEL_FALLBACKS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    let modelCandidates = Array.from(new Set([primaryModel, ...fallbackModels]));
    const originalCandidates = [...modelCandidates];

    // Root fix: avoid 404 when env/upgrade selects a model version that is not registered in current gateway config.
    const openclawCfg = readOpenClawConfigSafe();
    if (openclawCfg) {
      const availableModelIds = flattenOpenClawModelIds(openclawCfg);
      if (availableModelIds.length > 0) {
        const filteredEnvCandidates = modelCandidates.filter((m) => availableModelIds.includes(m));
        if (filteredEnvCandidates.length > 0) {
          modelCandidates = filteredEnvCandidates;
        } else {
          const agentCandidates = pickOpenClawAgentModelCandidates(openclawCfg, agentId).filter((m) =>
            availableModelIds.includes(m),
          );
          // If openclaw.json mapping disagrees with env candidates, keep raw candidates to avoid "0 models tried".
          modelCandidates = agentCandidates.length > 0 ? agentCandidates : originalCandidates;
        }
      }
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-openclaw-agent-id': agentId,
    };
    const uid = (openClawExtras?.bellaUserId || '').trim();
    if (uid) {
      headers['x-bella-user-id'] = uid;
    }
    const errs: string[] = [];
    const maxContinuations = getOpenClawMaxContinuations();
    for (const model of modelCandidates) {
      let rollingMessages = [...fullMessages];
      let fullText = '';
      for (let cont = 0; cont <= maxContinuations; cont++) {
        const res = await axios.post(
          // OpenClaw Gateway OpenAI-compatible endpoint: /v1/chat/completions
          `${gatewayUrl}/v1/chat/completions`,
          {
            model,
            messages: rollingMessages,
            temperature: 0.8,
            max_tokens: getOpenClawMaxTokens(),
          },
          {
            headers,
          timeout: getOpenClawGatewayTimeoutMs(), // configurable; default ~10 minutes
            validateStatus: () => true,
            proxy: false, // local gateway should ignore HTTP_PROXY
          }
        );

        const runId = String(res.data?.id || '');
        if (res.status === 200) {
          const finishReason = String(res.data?.choices?.[0]?.finish_reason || '');
          bellaLog.openclawAttempt(
            `model=${model} status=200 runId=${runId || 'n/a'} finish_reason=${finishReason || 'n/a'} chunk=${cont + 1}`,
          );
          if (runId) {
            console.log(`[assistant-debug] openclaw.run.ok | runId=${runId} model=${model} status=${res.status}`);
          }
          const text = res.data?.choices?.[0]?.message?.content?.trim() || '';
          if (text) {
            fullText = `${fullText}${fullText ? '\n' : ''}${text}`.trim();
          }
          if (finishReason !== 'length') {
            if (fullText) return fullText;
            errs.push(`[${model}] empty response`);
            break;
          }

          bellaLog.openclawContinuation(`runId=${runId || 'n/a'} model=${model} chunk=${cont + 1}/${maxContinuations + 1}`);
          rollingMessages = [
            ...rollingMessages,
            { role: 'assistant', content: text || '' },
            { role: 'user', content: buildContinuationPrompt() },
          ];
          if (cont === maxContinuations) {
            return fullText || text || '';
          }
          continue;
        }

        const errMsg = res.data?.error?.message || res.data?.message || JSON.stringify(res.data).slice(0, 300);
        bellaLog.openclawAttempt(`model=${model} status=${res.status} runId=${runId || 'n/a'} error=${errMsg}`);
        logToolStepsFromText(errMsg);
        if (runId || errMsg) {
          console.error(
            `[assistant-debug] openclaw.run.fail | runId=${runId || 'n/a'} model=${model} status=${res.status} err=${errMsg}`
          );
        }
        errs.push(`[${model}] ${res.status}: ${errMsg}`);
        // 4xx responses differ by meaning:
        // - 401/403: auth failure -> stop trying
        // - 404: unknown model/route -> try next candidate
        if (res.status >= 400 && res.status < 500) {
          if (res.status === 401 || res.status === 403) break;
          if (res.status !== 404) break;
          // 404 -> try the next model candidate
        }
        break;
      }

      // Interpret 4xx differently:
      // - 401/403: auth errors -> stop
      // - 404: unknown model -> continue with fallbacks
    }
    throw new Error(`OpenClaw 网关调用失败（已尝试 ${modelCandidates.length} 个模型）：${errs.join(' | ')}`);
  }

  throw new Error(`不支持的 ASSISTANT_CHAT_PROVIDER: ${provider}，可选 openai / doubao / kimi / openclaw`);
}

/** Reply shape for this turn: text / text+image / text+video. */
export type ReplyMode = 'text_only' | 'text_and_image' | 'text_and_video';

const DECISION_SYSTEM = `你是上下文与意图判断助手。根据对话历史和用户最后一条消息，判断本轮回复应该采用哪种形式。
只输出以下三种之一，不要输出任何其他文字、标点或解释：
text_only
text_and_image
text_and_video

规则：
- 普通聊天、问候、问天气、闲聊 → text_only
- 用户想看照片、自拍、发图、看看你、你的样子、你在做什么、在干嘛 → 用 text_and_image 或 text_and_video（若明确提到视频、拍视频、动起来 → text_and_video，否则 text_and_image）`;

/** Single-shot LLM call returning raw text to parse into `ReplyMode`. */
async function callLlmForDecision(systemPrompt: string, userContent: string): Promise<string> {
  const providerRaw = (process.env.ASSISTANT_CHAT_PROVIDER || 'openai').toLowerCase();
  const provider = providerRaw === 'clawra' ? 'openclaw' : providerRaw;
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userContent },
  ];

  if (provider === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    if (!key) return '';
    const res = await axios.post(
      `${base}/chat/completions`,
      { model: process.env.ASSISTANT_CHAT_MODEL || 'gpt-4o-mini', messages, temperature: 0.2, max_tokens: 32 },
      { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 60000, validateStatus: () => true }
    );
    if (res.status !== 200) return '';
    return (res.data?.choices?.[0]?.message?.content ?? '').trim();
  }

  if (provider === 'doubao') {
    const key = process.env.DOUBAO_API_KEY;
    const base = (process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com').replace(/\/api\/v3\/?$/, '').replace(/\/$/, '');
    const model = process.env.DOUBAO_MODEL || process.env.DOUBAO_ENDPOINT_ID || 'doubao-seed-1-6-251015';
    if (!key) return '';
    const res = await axios.post(
      `${base}/api/v3/chat/completions`,
      { model, messages, temperature: 0.2, max_tokens: 32 },
      { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 60000, validateStatus: () => true }
    );
    if (res.status !== 200) return '';
    return (res.data?.choices?.[0]?.message?.content ?? '').trim();
  }

  if (provider === 'kimi') {
    const key = process.env.KIMI_API_KEY;
    const base = (process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1').replace(/\/$/, '');
    const model = process.env.KIMI_MODEL || 'moonshot-v1-32k';
    if (!key) return '';
    const res = await axios.post(
      `${base}/chat/completions`,
      { model, messages, temperature: 0.2, max_tokens: 32 },
      { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 60000, validateStatus: () => true }
    );
    if (res.status !== 200) return '';
    return (res.data?.choices?.[0]?.message?.content ?? '').trim();
  }

  if (provider === 'openclaw') {
    const gatewayUrl = (process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789').replace(/\/$/, '');
    const token = process.env.OPENCLAW_GATEWAY_TOKEN || process.env.OPENCLAW_GATEWAY_PASSWORD || process.env.OPENCLAW_GATEWAY_AUTH;
    const agentId = process.env.OPENCLAW_AGENT_ID || 'main';
    if (!token) return '';
    let modelToUse = process.env.OPENCLAW_MODEL || 'openclaw';
    const openclawCfg = readOpenClawConfigSafe();
    if (openclawCfg) {
      const availableModelIds = flattenOpenClawModelIds(openclawCfg);
      if (availableModelIds.length > 0) {
        const candidates = pickOpenClawAgentModelCandidates(openclawCfg, agentId).filter((m) =>
          availableModelIds.includes(m),
        );
        if (candidates.length > 0) modelToUse = candidates[0];
      }
    }
    const res = await axios.post(
      // OpenClaw Gateway OpenAI-compatible endpoint: /v1/chat/completions
      `${gatewayUrl}/v1/chat/completions`,
      { model: modelToUse, messages, temperature: 0.2, max_tokens: 32 },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-openclaw-agent-id': agentId,
        },
        timeout: 120000, // skills (weather, etc.) may need a longer window
        validateStatus: () => true,
        proxy: false, // 本地 OpenClaw 不走 HTTP_PROXY
      }
    );
    if (res.status !== 200) return '';
    return (res.data?.choices?.[0]?.message?.content ?? '').trim();
  }

  return '';
}

/** Hybrid LLM + heuristics to pick text vs image vs video replies. */
export async function planReplyMode(
  messages: { role: 'user' | 'assistant'; content: string }[],
  _hotspotContext: string
): Promise<ReplyMode> {
  const lastUser = messages.filter((m) => m.role === 'user').pop()?.content?.trim() ?? '';
  const snippet = messages.slice(-6).map((m) => `${m.role === 'user' ? '用户' : 'Bella'}: ${(m.content || '').slice(0, 200)}`).join('\n');
  const userContent = `对话片段：\n${snippet}\n\n当前用户最后一条消息：${lastUser}\n\n请只输出一种回复形式（text_only / text_and_image / text_and_video）：`;

  try {
    const raw = await callLlmForDecision(DECISION_SYSTEM, userContent);
    const mode = (raw || '').trim().toLowerCase().replace(/\s/g, '');
    if (mode === 'text_only' || mode === 'text_and_image' || mode === 'text_and_video') {
      console.log('[助理] 上下文决策 LLM 返回:', mode);
      return mode;
    }
  } catch (e) {
    console.warn('[助理] 决策 LLM 调用失败，使用关键词兜底:', (e as Error).message);
  }

  if (wantsVideo(lastUser)) return 'text_and_video';
  if (wantsWhatDoing(lastUser)) return Math.random() < 0.5 ? 'text_and_image' : 'text_and_video';
  if (wantsSelfie(lastUser)) return 'text_and_image';
  return 'text_only';
}

/** Heuristic: user wants a selfie/photo (excluding “what are you doing” / video-only asks). */
export function wantsSelfie(userMessage: string): boolean {
  const lower = userMessage.trim().toLowerCase();
  if (wantsVideo(userMessage) || wantsWhatDoing(userMessage)) return false;
  const keywords = [
    '自拍', '发张图', '发张照', '来张照', '看看你', '你的照片', '发照片',
    '发图', '来张图', '照片', 'picture', 'selfie', 'photo', '你的样子',
    '发自拍', '给我发', '来一张', '发一张', '看看你的', '给我看',
  ];
  return keywords.some((k) => lower.includes(k));
}

/** Heuristic: “what are you doing” style prompts. */
export function wantsWhatDoing(userMessage: string): boolean {
  const lower = userMessage.trim().toLowerCase();
  const keywords = ['看看你在做什么', '你在做什么', '在干嘛', '在干什么', '你在干嘛'];
  return keywords.some((k) => lower.includes(k));
}

/** Heuristic: weather questions. */
export function wantsWeather(userMessage: string): boolean {
  const lower = userMessage.trim().toLowerCase();
  const keywords = [
    '天气', 'weather', '气温', '温度', '下雨', '晴天', '明天天气',
    '今天天气', '会下雨吗', '冷不冷', '热不热',
  ];
  return keywords.some((k) => lower.includes(k));
}

/** Map common Chinese city tokens to Open-Meteo geocoding strings (prefer Open-Meteo over wttr.in in CN). */
const CITY_MAP: Record<string, string> = {
  深圳: 'Shenzhen', 北京: 'Beijing', 上海: 'Shanghai', 广州: 'Guangzhou',
  杭州: 'Hangzhou', 成都: 'Chengdu', 南京: 'Nanjing', 武汉: 'Wuhan',
  西安: 'Xi An', 重庆: 'Chongqing', 天津: 'Tianjin', 苏州: 'Suzhou',
  香港: 'Hong Kong', 台北: 'Taipei', 伦敦: 'London', 纽约: 'New York',
  东京: 'Tokyo', 巴黎: 'Paris', 新加坡: 'Singapore',
};

/** Extract a city token from free text (prefer `CITY_MAP`). */
function extractCityFromMessage(msg: string): string {
  const s = msg.trim();
  for (const [cn, en] of Object.entries(CITY_MAP)) {
    if (s.includes(cn)) return en;
  }
  const m = s.match(/[^\s，。！？、]+/);
  return m ? m[0].slice(0, 30) : 'Beijing';
}

/** Fetch weather summary via Open-Meteo (no API key). */
async function fetchWeatherFromOpenMeteo(locationOrMessage: string): Promise<string> {
  const loc = extractCityFromMessage(locationOrMessage);
  try {
    const geoRes = await axios.get(
      'https://geocoding-api.open-meteo.com/v1/search',
      { params: { name: loc, count: 1, language: 'zh' }, ...weatherAxiosConfig() }
    );
    const results = geoRes.data?.results;
    if (!results || results.length === 0) return '';
    const { latitude, longitude, name } = results[0];
    const forecastRes = await axios.get(
      'https://api.open-meteo.com/v1/forecast',
      { params: { latitude, longitude, current_weather: true, timezone: 'auto' }, ...weatherAxiosConfig() }
    );
    const cw = forecastRes.data?.current_weather;
    if (!cw) return '';
    const temp = Math.round(cw.temperature);
    const wind = Math.round(cw.windspeed);
    const code = cw.weathercode;
    const cond = code <= 3 ? '晴' : code <= 49 ? '雾' : code <= 67 ? '雨' : code <= 77 ? '雪' : code <= 82 ? '阵雨' : '雷雨';
    return `${name}: ${cond} ${temp}°C 风速${wind}km/h`;
  } catch (e: any) {
    console.warn('[助理] Open-Meteo 天气查询失败:', e?.message || String(e));
    return '';
  }
}

/** Optional weather HTTP timeout + proxy (e.g. local VPN port 7890). */
const WEATHER_TIMEOUT = parseInt(process.env.WEATHER_TIMEOUT || '20000', 10);
const WEATHER_PROXY = (process.env.WEATHER_PROXY || process.env.HTTP_PROXY || process.env.HTTPS_PROXY || '').trim();

function weatherAxiosConfig() {
  const cfg: { timeout: number; validateStatus: () => boolean; proxy?: { protocol: string; host: string; port: number } } = {
    timeout: WEATHER_TIMEOUT,
    validateStatus: () => true,
  };
  if (WEATHER_PROXY) {
    try {
      const u = new URL(WEATHER_PROXY.startsWith('http') ? WEATHER_PROXY : 'http://' + WEATHER_PROXY);
      const defaultPort = u.protocol === 'https:' ? 443 : 80;
      cfg.proxy = { protocol: u.protocol.replace(':', ''), host: u.hostname, port: parseInt(u.port || String(defaultPort), 10) };
    } catch {}
  }
  return cfg;
}

/** Weather helper: Open-Meteo first, wttr.in fallback. */
export async function fetchWeatherFromWttr(locationOrMessage: string): Promise<string> {
  let text = await fetchWeatherFromOpenMeteo(locationOrMessage);
  if (text) return text;
  const loc = locationOrMessage.trim().replace(/[？?！!。，,、]/g, ' ').trim().slice(0, 80);
  const query = encodeURIComponent(loc || 'Beijing');
  try {
    const res = await axios.get(
      `https://wttr.in/${query}?format=%l:+%c+%t+%h+%w`,
      weatherAxiosConfig()
    );
    if (res.status === 200 && typeof res.data === 'string') {
      const t = (res.data || '').trim();
      if (t && t.length < 500) return t;
    }
  } catch (e: any) {
    console.warn('[助理] wttr.in 天气查询失败:', e?.message || String(e));
  }
  return '';
}

/** Heuristic: user wants a generated video clip. */
export function wantsVideo(userMessage: string): boolean {
  const lower = userMessage.trim().toLowerCase();
  const keywords = [
    '拍个视频', '拍视频', '发个视频', '发视频', '来段视频', '录个视频',
    '视频看看', '看看视频', 'video',
  ];
  return keywords.some((k) => lower.includes(k));
}

const DOUBAO_IMAGE_MODEL = process.env.DOUBAO_IMAGE_MODEL_ID || 'doubao-seedream-4-0-250828';
const DOUBAO_VIDEO_MODEL = process.env.DOUBAO_VIDEO_MODEL_ID || 'doubao-seedance-1-5-pro-251215';

type MediaKind = 'image' | 'video';

function resolveMediaProvider(kind: MediaKind): string {
  const legacy = (process.env.DOUBAO_API_KEY || '').trim() ? 'doubao' : 'none';
  const raw =
    kind === 'image'
      ? process.env.MEDIA_IMAGE_PROVIDER || process.env.ASSISTANT_IMAGE_PROVIDER || legacy
      : process.env.MEDIA_VIDEO_PROVIDER || process.env.ASSISTANT_VIDEO_PROVIDER || legacy;
  return (raw || '').trim().toLowerCase();
}

function isKnownMediaProvider(provider: string): boolean {
  return [
    'doubao',
    'seedream',
    'seedance',
    'media-image',
    'media-video',
    'gemini',
    'gemini-image',
    'gemini-video',
    'openai-image',
    'openai-video',
  ].includes(provider);
}

async function generateSelfieImageByGemini(_promptHint?: string): Promise<{ url?: string }> {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key) {
    console.warn('[assistant] GEMINI_API_KEY 未配置，无法使用 gemini-image');
    return {};
  }
  // TODO: wire Gemini image generation; placeholder keeps provider enum extensible.
  console.warn('[assistant] gemini-image provider selected but not implemented; returning empty result');
  return {};
}

async function generateSelfieVideoByGemini(_promptHint?: string): Promise<{ url?: string }> {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key) {
    console.warn('[assistant] GEMINI_API_KEY 未配置，无法使用 gemini-video');
    return {};
  }
  // TODO: wire Gemini video generation; placeholder keeps provider enum extensible.
  console.warn('[assistant] gemini-video provider selected but not implemented; returning empty result');
  return {};
}

function getDoubaoBase(): string {
  return (process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com')
    .replace(/\/api\/v3\/?$/, '')
    .replace(/\/$/, '');
}

function toBase64DataUrl(buf: Buffer, mime: string): string {
  const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpeg' : 'png';
  return `data:image/${ext};base64,${buf.toString('base64')}`;
}

/**
 * Normalize reference image URLs/paths into Doubao-friendly data URLs.
 * - localhost: fetch server-side and base64-encode (cloud cannot reach dev loopback)
 * - file:// or absolute disk paths: read bytes locally
 * - public URLs: return as-is when Doubao can fetch them
 */
async function resolveReferenceImageForDoubao(urlOrPath: string): Promise<string | null> {
  const u = urlOrPath.trim();
  if (!u) return null;

  if (u.startsWith('file://')) {
    const filePath = u.replace(/^file:\/\//, '');
    if (fs.existsSync(filePath)) {
      const buf = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
      return toBase64DataUrl(buf, mime);
    }
  }
  if ((u.startsWith('/') || /^[A-Za-z]:[\\/]/.test(u)) && !u.startsWith('http')) {
    if (fs.existsSync(u)) {
      const buf = fs.readFileSync(u);
      const ext = path.extname(u).toLowerCase();
      const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
      return toBase64DataUrl(buf, mime);
    }
  }

  const isLocalhost =
    u.startsWith('http://localhost') ||
    u.startsWith('http://127.0.0.1') ||
    u.startsWith('https://localhost') ||
    u.startsWith('https://127.0.0.1');

  try {
    if (isLocalhost) {
      const resp = await axios.get(u, { responseType: 'arraybuffer', timeout: 10000 });
      const buf = Buffer.from(resp.data);
      const ct = (resp.headers['content-type'] || 'image/png').split(';')[0].trim();
      return toBase64DataUrl(buf, ct);
    }
    return u;
  } catch (e: any) {
    let fallbackPath = (process.env.ASSISTANT_REFERENCE_IMAGE_PATH || '').trim();
    if (!fallbackPath) {
      const defaultPath = path.join(__dirname, '../../frontend/public/bella-avatar.png');
      if (fs.existsSync(defaultPath)) fallbackPath = defaultPath;
    }
    if (fallbackPath && fs.existsSync(fallbackPath)) {
      try {
        const buf = fs.readFileSync(fallbackPath);
        const ext = path.extname(fallbackPath).toLowerCase();
        const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
        console.log('[助理] 使用备用路径参考图:', fallbackPath);
        return toBase64DataUrl(buf, mime);
      } catch {}
    }
    console.warn('[助理] 解析参考图失败，将不使用参考图:', e?.message || e);
    return null;
  }
}

/** Doubao Seedream selfie generator; optional `ASSISTANT_REFERENCE_IMAGE_URL` keeps face consistency. */
async function generateSelfieImageByDoubao(
  promptHint?: string,
  referenceImageOrPath?: string | string[]
): Promise<{ url?: string }> {
  const key = process.env.DOUBAO_API_KEY;
  if (!key) {
    console.warn('[助理] DOUBAO_API_KEY 未配置，无法生成自拍图');
    return {};
  }
  const basePrompt =
    '保持参考图中人物的面部特征和形象，年轻女性自拍，温暖微笑，室内 casual 场景，柔和光线，写实风格，高清人像';
  const prompt = promptHint?.trim()
    ? `${basePrompt}，${promptHint.slice(0, 180)}`
    : basePrompt;
  const firstRef = Array.isArray(referenceImageOrPath) ? referenceImageOrPath[0] : referenceImageOrPath;
  const referenceImageUrl = (firstRef || process.env.ASSISTANT_REFERENCE_IMAGE_URL || '').trim();
  const base = getDoubaoBase();
  try {
    const body: Record<string, unknown> = {
      model: DOUBAO_IMAGE_MODEL,
      prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'url',
    };
    if (referenceImageUrl) {
      const resolved = await resolveReferenceImageForDoubao(referenceImageUrl);
      if (resolved) {
        body.image = resolved;
        console.log('[助理] 已传入参考图用于形象一致性');
      }
    }
    const res = await axios.post(
      `${base}/api/v3/images/generations`,
      body,
      {
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        timeout: 120000,
        validateStatus: () => true,
        proxy: false, // Volcengine endpoints should bypass HTTP_PROXY
      }
    );
    if (res.status !== 200) {
      console.error('[助理] 豆包图像生成非 200:', res.status, JSON.stringify(res.data).slice(0, 400));
      return {};
    }
    const url =
      res.data?.data?.[0]?.url ??
      res.data?.images?.[0]?.url ??
      res.data?.data?.images?.[0]?.url;
    if (url) return { url };
    console.warn('[助理] 豆包图像返回无 url:', typeof res.data, Object.keys(res.data || {}));
    return {};
  } catch (err: any) {
    console.error('[助理] 豆包图像生成失败:', err.message, err.response?.status, err.response?.data ? JSON.stringify(err.response.data).slice(0, 200) : '');
    return {};
  }
}

/** Doubao Seedance short video via Volcengine Contents API; optional reference images for consistency. */
async function generateSelfieVideoByDoubao(
  promptHint?: string,
  referenceImageOrPath?: string | string[]
): Promise<{ url?: string }> {
  const key = process.env.DOUBAO_API_KEY;
  if (!key) {
    console.warn('[助理] DOUBAO_API_KEY 未配置，无法生成视频');
    return {};
  }
  const promptText =
    promptHint?.trim()?.slice(0, 200) ||
    '年轻亚洲女性在室内，自然微笑，轻松日常动作，写实风格，短视频';
  const base = getDoubaoBase();
  const textWithParams = `${promptText} --ratio 1:1 --fps 24 --dur 5`;
  const refs = (Array.isArray(referenceImageOrPath) ? referenceImageOrPath : referenceImageOrPath ? [referenceImageOrPath] : [])
    .filter(Boolean)
    .map((s) => String(s).trim())
    .filter(Boolean);
  const fallbackRef = (process.env.ASSISTANT_REFERENCE_IMAGE_URL || '').trim();
  const referenceImageUrls = refs.length > 0 ? refs : fallbackRef ? [fallbackRef] : [];
  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
  if (referenceImageUrls.length > 0) {
    for (const referenceImageUrl of referenceImageUrls) {
      const resolved = await resolveReferenceImageForDoubao(referenceImageUrl);
      if (resolved) content.push({ type: 'image_url', image_url: { url: resolved } });
    }
  }
  content.push({ type: 'text', text: textWithParams });
  try {
    const createRes = await axios.post(
      `${base}/api/v3/contents/generations/tasks`,
      {
        model: DOUBAO_VIDEO_MODEL,
        content,
      },
      {
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
        validateStatus: () => true,
        proxy: false, // Volcengine endpoints should bypass HTTP_PROXY
      }
    );
    if (createRes.status !== 200 && createRes.status !== 201) {
      console.error('[助理] 豆包视频创建非 200:', createRes.status, JSON.stringify(createRes.data).slice(0, 400));
      return {};
    }
    const taskId = createRes.data?.id ?? createRes.data?.data?.id;
    if (!taskId) {
      console.warn('[助理] 豆包视频创建返回无 task id:', Object.keys(createRes.data || {}));
      return {};
    }
    const maxWait = 300000;
    const interval = 5000;
    const started = Date.now();
    while (Date.now() - started < maxWait) {
      await new Promise((r) => setTimeout(r, interval));
      const statusRes = await axios.get(
        `${base}/api/v3/contents/generations/tasks/${taskId}`,
        {
          headers: { Authorization: `Bearer ${key}` },
          timeout: 15000,
          validateStatus: () => true,
          proxy: false,
        }
      );
      if (statusRes.status !== 200) continue;
      const status = statusRes.data?.status ?? statusRes.data?.data?.status;
      const url =
        statusRes.data?.content?.video_url ??
        statusRes.data?.data?.content?.video_url ??
        statusRes.data?.video_url ??
        statusRes.data?.data?.video_url;
      if (status === 'succeeded' || status === 'success') {
        if (url) return { url };
      }
      if (status === 'failed' || status === 'error') {
        console.error('[助理] 豆包视频生成失败:', statusRes.data);
        return {};
      }
    }
    console.warn('[助理] 豆包视频轮询超时');
    return {};
  } catch (err: any) {
    console.error('[助理] 豆包视频生成失败:', err.message, err.response?.status, err.response?.data ? JSON.stringify(err.response.data).slice(0, 200) : '');
    return {};
  }
}

/**
 * Unified image generation entrypoint.
 * - Today: Doubao remains the default implementation regardless of provider naming.
 * - Future: plug in Gemini/OpenAI image providers here.
 */
export async function generateSelfieImage(
  promptHint?: string,
  referenceImageOrPath?: string | string[]
): Promise<{ url?: string }> {
  const provider = resolveMediaProvider('image');
  if (!provider || provider === 'none') return {};
  if (!isKnownMediaProvider(provider)) {
    console.warn(`[assistant] unknown MEDIA_IMAGE_PROVIDER: ${provider}, fallback to doubao`);
    return generateSelfieImageByDoubao(promptHint, referenceImageOrPath);
  }
  if (provider === 'gemini' || provider === 'gemini-image') {
    return generateSelfieImageByGemini(promptHint);
  }
  return generateSelfieImageByDoubao(promptHint, referenceImageOrPath);
}

/**
 * Unified video generation entrypoint.
 * - Today: Doubao remains the default implementation regardless of provider naming.
 * - Future: plug in Gemini/Runway/etc. here.
 */
export async function generateSelfieVideo(
  promptHint?: string,
  referenceImageOrPath?: string | string[]
): Promise<{ url?: string }> {
  const provider = resolveMediaProvider('video');
  if (!provider || provider === 'none') return {};
  if (!isKnownMediaProvider(provider)) {
    console.warn(`[assistant] unknown MEDIA_VIDEO_PROVIDER: ${provider}, fallback to doubao`);
    return generateSelfieVideoByDoubao(promptHint, referenceImageOrPath);
  }
  if (provider === 'gemini' || provider === 'gemini-video') {
    return generateSelfieVideoByGemini(promptHint);
  }
  return generateSelfieVideoByDoubao(promptHint, referenceImageOrPath);
}
