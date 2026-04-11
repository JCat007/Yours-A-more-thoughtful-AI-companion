import axios from 'axios';
import { buildBellaPersonaSystemPrompt } from './bellaPersona';

function pickOuterProvider(mode: 'china' | 'world'): 'doubao' | 'gemini' {
  const fromEnv = mode === 'china'
    ? (process.env.BELLA_OUTER_PROVIDER_CHINA || '').trim().toLowerCase()
    : (process.env.BELLA_OUTER_PROVIDER_WORLD || '').trim().toLowerCase();
  if (fromEnv === 'gemini') return 'gemini';
  if (fromEnv === 'doubao') return 'doubao';
  return mode === 'china' ? 'doubao' : 'gemini';
}

function pickFallbackProvider(mode: 'china' | 'world'): 'doubao' | 'gemini' | null {
  const fromEnv = mode === 'china'
    ? (process.env.BELLA_OUTER_FALLBACK_PROVIDER_CHINA || '').trim().toLowerCase()
    : (process.env.BELLA_OUTER_FALLBACK_PROVIDER_WORLD || '').trim().toLowerCase();
  if (fromEnv === 'gemini') return 'gemini';
  if (fromEnv === 'doubao') return 'doubao';
  return null;
}

async function callByProvider(provider: 'doubao' | 'gemini', args: {
  mode: 'china' | 'world';
  payloadText: string;
  system: string;
}) {
  const { payloadText, system } = args;
  if (provider === 'doubao') {
    const key = process.env.BELLA_DOUBAO_API_KEY || process.env.DOUBAO_API_KEY;
    if (!key) throw new Error('BELLA_DOUBAO_API_KEY/DOUBAO_API_KEY 未配置');
    const base = (process.env.BELLA_DOUBAO_BASE_URL || process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com')
      .replace(/\/api\/v3\/?$/, '')
      .replace(/\/$/, '');
    const model = process.env.BELLA_DOUBAO_MODEL || process.env.DOUBAO_MODEL || process.env.DOUBAO_ENDPOINT_ID || 'doubao-seed-1-6-251015';
    const res = await axios.post(
      `${base}/api/v3/chat/completions`,
      {
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: payloadText },
        ],
        temperature: 0.7,
        max_tokens: 500,
      },
      {
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        timeout: 60000,
      }
    );
    return (res.data?.choices?.[0]?.message?.content || '').trim();
  }
  const geminiKey = process.env.BELLA_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
  if (!geminiKey) throw new Error('BELLA_GEMINI_API_KEY/GEMINI_API_KEY 未配置');
  const model = process.env.BELLA_GEMINI_MODEL || 'gemini-1.5-pro';
  const base = (process.env.BELLA_GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  const res = await axios.post(
    `${base}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`,
    {
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: payloadText }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 700 },
    },
    { timeout: 60000 }
  );
  return (res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
}

export async function generateBellaOuterReply(args: {
  mode: 'china' | 'world';
  replyLanguage?: 'zh' | 'en' | 'ja' | 'ko' | 'ru';
  userMessage: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  executorReply?: string;
  artifactsHint?: string;
  companionContext?: string;
}) {
  const { mode, replyLanguage, userMessage, history, executorReply, artifactsHint, companionContext } = args;
  const provider = pickOuterProvider(mode);
  const fallbackProvider = pickFallbackProvider(mode);
  const system = buildBellaPersonaSystemPrompt(mode, replyLanguage);
  const historyBlock = history.slice(-8).map((m) => `${m.role}: ${m.content}`).join('\n');
  const langLine = replyLanguage
    ? replyLanguage === 'zh'
      ? `最终回复语言: ${replyLanguage}（与用户输入语言一致）。`
      : `Target reply language: ${replyLanguage} (match the user's writing language).`
    : '';
  const payloadText = [
    langLine,
    replyLanguage === 'zh' ? `用户最新输入: ${userMessage}` : `Latest user message: ${userMessage}`,
    historyBlock ? (replyLanguage === 'zh' ? `最近对话:\n${historyBlock}` : `Recent turns:\n${historyBlock}`) : '',
    executorReply
      ? replyLanguage === 'zh'
        ? `执行器结果:\n${executorReply}`
        : `Executor output:\n${executorReply}`
      : '',
    artifactsHint
      ? replyLanguage === 'zh'
        ? `产物提示:\n${artifactsHint}`
        : `Artifacts:\n${artifactsHint}`
      : '',
    companionContext?.trim()
      ? replyLanguage === 'zh'
        ? `用户长期记忆（gbrain 检索；若与本轮冲突以本轮为准）:\n${companionContext.trim()}`
        : `Long-term memory from gbrain (if it conflicts with this turn, prefer this turn):\n${companionContext.trim()}`
      : '',
    replyLanguage === 'zh' ? '请用 Bella 语气给出最终回复。' : 'Produce the final Bella reply in the target language above.',
  ].filter(Boolean).join('\n\n');

  try {
    return await callByProvider(provider, { mode, payloadText, system });
  } catch (e) {
    if (!fallbackProvider || fallbackProvider === provider) throw e;
    return await callByProvider(fallbackProvider, { mode, payloadText, system });
  }
}
