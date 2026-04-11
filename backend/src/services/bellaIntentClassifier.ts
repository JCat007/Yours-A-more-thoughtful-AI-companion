import axios from 'axios';
import { BellaIntent, detectBellaIntent } from './bellaRouter';

type IntentProvider = 'doubao' | 'gemini';
type RouterMode = 'llm' | 'rule' | 'hybrid';

export type RouterDecision = {
  intent: BellaIntent;
  confidence: number;
  shouldUseOpenClaw: boolean;
  needsFileSkill: boolean;
  needsImage: boolean;
  reason: string;
  source: 'llm' | 'rule';
  fallbackReason?: string;
};

function pickProvider(mode: 'china' | 'world'): IntentProvider {
  const fromEnv = mode === 'china'
    ? (process.env.BELLA_INTENT_PROVIDER_CHINA || '').trim().toLowerCase()
    : (process.env.BELLA_INTENT_PROVIDER_WORLD || '').trim().toLowerCase();
  if (fromEnv === 'gemini') return 'gemini';
  if (fromEnv === 'doubao') return 'doubao';
  return mode === 'china' ? 'doubao' : 'gemini';
}

function getRouterMode(): RouterMode {
  const mode = (process.env.BELLA_ROUTER_MODE || 'hybrid').trim().toLowerCase();
  if (mode === 'llm' || mode === 'rule' || mode === 'hybrid') return mode;
  return 'hybrid';
}

function getThreshold() {
  const raw = Number(process.env.BELLA_INTENT_CONF_THRESHOLD || 0.65);
  if (!Number.isFinite(raw)) return 0.65;
  return Math.max(0, Math.min(1, raw));
}

function parseIntent(value: any): BellaIntent {
  if (value === 'image_request' || value === 'task_request' || value === 'chat_only') return value;
  return 'chat_only';
}

function parseJsonFromText(text: string): any {
  const cleaned = (text || '').trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return JSON.parse(cleaned.slice(start, end + 1));
  }
  return JSON.parse(cleaned);
}

function buildRuleDecision(
  message: string,
  recentUserTexts: string[],
  lastIntent: BellaIntent | undefined,
  hasFiles: boolean
): RouterDecision {
  const intent = hasFiles ? 'task_request' : detectBellaIntent(message, recentUserTexts, lastIntent);
  return {
    intent,
    confidence: hasFiles ? 1 : 0.72,
    shouldUseOpenClaw: intent !== 'chat_only',
    needsFileSkill: hasFiles || intent === 'task_request',
    needsImage: intent === 'image_request',
    reason: hasFiles ? 'detected uploaded files' : 'rule-based intent routing',
    source: 'rule',
  };
}

async function callClassifierByProvider(args: {
  mode: 'china' | 'world';
  provider: IntentProvider;
  message: string;
  recentUserTexts: string[];
  lastIntent?: BellaIntent;
  hasFiles: boolean;
}): Promise<RouterDecision> {
  const { mode, provider, message, recentUserTexts, lastIntent, hasFiles } = args;
  const system = [
    '你是 Bella 的路由分类器，只输出 JSON，不要输出任何额外文本。',
    'JSON schema:',
    '{"intent":"chat_only|image_request|task_request","confidence":0..1,"shouldUseOpenClaw":boolean,"needsFileSkill":boolean,"needsImage":boolean,"reason":"string"}',
    '规则：如果用户有文件处理需求，intent 应为 task_request。',
  ].join('\n');
  const payload = [
    `message: ${message}`,
    `recent_user_texts: ${JSON.stringify(recentUserTexts.slice(-8))}`,
    `last_intent: ${lastIntent || ''}`,
    `has_files: ${hasFiles ? 'true' : 'false'}`,
    '仅返回 JSON。',
  ].join('\n');

  if (provider === 'doubao') {
    const key = process.env.BELLA_DOUBAO_API_KEY || process.env.DOUBAO_API_KEY;
    if (!key) throw new Error('BELLA_DOUBAO_API_KEY/DOUBAO_API_KEY 未配置');
    const base = (process.env.BELLA_DOUBAO_BASE_URL || process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com')
      .replace(/\/api\/v3\/?$/, '')
      .replace(/\/$/, '');
    const model = process.env.BELLA_INTENT_MODEL_CHINA || process.env.BELLA_DOUBAO_MODEL || process.env.DOUBAO_MODEL || 'doubao-seed-1-6-251015';
    const res = await axios.post(
      `${base}/api/v3/chat/completions`,
      {
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: payload },
        ],
        temperature: 0,
        max_tokens: 280,
      },
      {
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      }
    );
    const text = (res.data?.choices?.[0]?.message?.content || '').trim();
    const parsed = parseJsonFromText(text);
    const intent = parseIntent(parsed?.intent);
    const confidence = Math.max(0, Math.min(1, Number(parsed?.confidence ?? 0.5)));
    return {
      intent,
      confidence,
      shouldUseOpenClaw: !!parsed?.shouldUseOpenClaw,
      needsFileSkill: !!parsed?.needsFileSkill,
      needsImage: !!parsed?.needsImage,
      reason: String(parsed?.reason || 'llm router'),
      source: 'llm',
    };
  }

  const geminiKey = process.env.BELLA_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
  if (!geminiKey) throw new Error('BELLA_GEMINI_API_KEY/GEMINI_API_KEY 未配置');
  const model = mode === 'world'
    ? (process.env.BELLA_INTENT_MODEL_WORLD || process.env.BELLA_GEMINI_MODEL || 'gemini-1.5-flash')
    : (process.env.BELLA_INTENT_MODEL_CHINA || process.env.BELLA_GEMINI_MODEL || 'gemini-1.5-flash');
  const base = (process.env.BELLA_GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  const res = await axios.post(
    `${base}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`,
    {
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: payload }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 350 },
    },
    { timeout: 30000 }
  );
  const text = (res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  const parsed = parseJsonFromText(text);
  const intent = parseIntent(parsed?.intent);
  const confidence = Math.max(0, Math.min(1, Number(parsed?.confidence ?? 0.5)));
  return {
    intent,
    confidence,
    shouldUseOpenClaw: !!parsed?.shouldUseOpenClaw,
    needsFileSkill: !!parsed?.needsFileSkill,
    needsImage: !!parsed?.needsImage,
    reason: String(parsed?.reason || 'llm router'),
    source: 'llm',
  };
}

export async function decideBellaRoute(args: {
  mode: 'china' | 'world';
  message: string;
  recentUserTexts: string[];
  lastIntent?: BellaIntent;
  hasFiles: boolean;
}): Promise<RouterDecision> {
  const { mode, message, recentUserTexts, lastIntent, hasFiles } = args;
  const routerMode = getRouterMode();
  const threshold = getThreshold();
  const ruleDecision = buildRuleDecision(message, recentUserTexts, lastIntent, hasFiles);
  if (routerMode === 'rule') return ruleDecision;

  try {
    const provider = pickProvider(mode);
    let llmDecision = await callClassifierByProvider({
      mode,
      provider,
      message,
      recentUserTexts,
      lastIntent,
      hasFiles,
    });

    // Hard constraints to keep routing safe and predictable.
    if (hasFiles) {
      llmDecision = {
        ...llmDecision,
        intent: 'task_request',
        needsFileSkill: true,
        shouldUseOpenClaw: true,
      };
    }
    if (llmDecision.needsFileSkill && !llmDecision.shouldUseOpenClaw) {
      llmDecision = { ...llmDecision, shouldUseOpenClaw: true };
    }
    if (llmDecision.confidence < threshold && routerMode === 'hybrid') {
      return {
        ...ruleDecision,
        fallbackReason: `llm confidence below threshold (${llmDecision.confidence.toFixed(2)} < ${threshold.toFixed(2)})`,
      };
    }
    return llmDecision;
  } catch (e: any) {
    if (routerMode === 'llm') throw e;
    return {
      ...ruleDecision,
      fallbackReason: e?.message || String(e),
    };
  }
}
