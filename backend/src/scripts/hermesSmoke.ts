import fs from 'fs';
import path from 'path';
import { runHermesQuery } from '../services/agent/hermesRuntime';

type SmokeCase = {
  id: string;
  prompt: string;
  validate: (output: string) => { ok: boolean; reason?: string };
};

function getHermesRoot(): string {
  const configured = (process.env.HERMES_ROOT || '').trim();
  if (configured) return configured;
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, 'projects', 'hermes');
}

function printHeader() {
  console.log('=== Hermes Smoke Test ===');
  console.log(`HERMES_ROOT=${process.env.HERMES_ROOT || '(default)'}`);
  console.log(`HERMES_CMD=${process.env.HERMES_CMD || '(auto detect hermes/python -m hermes_cli.main)'}`);
  console.log(`HERMES_VENV=${process.env.HERMES_VENV || '(not set)'}`);
  console.log(`HERMES_PYTHON_BIN=${process.env.HERMES_PYTHON_BIN || '(not set)'}`);
  console.log(`HERMES_PROVIDER=${process.env.HERMES_PROVIDER || '(default from Hermes config)'}`);
  console.log(`HERMES_MODEL=${process.env.HERMES_MODEL || '(default from Hermes config)'}`);
  console.log(`HERMES_TIMEOUT_MS=${process.env.HERMES_TIMEOUT_MS || '(default 120000)'}`);
}

function hasHermesProviderEnv(): boolean {
  const keys = [
    'OPENAI_API_KEY',
    'OPENROUTER_API_KEY',
    'GOOGLE_API_KEY',
    'OPENAI_BASE_URL',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_TOKEN',
    'GEMINI_API_KEY',
    'KIMI_API_KEY',
    'DOUBAO_API_KEY',
    'DASHSCOPE_API_KEY',
    'MISTRAL_API_KEY',
    'DEEPSEEK_API_KEY',
    'ZAI_API_KEY',
    'MINIMAX_API_KEY',
  ];
  return keys.some((k) => String(process.env[k] || '').trim().length > 0);
}

function preview(text: string, max = 180): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max)}...`;
}

async function run() {
  printHeader();
  const hermesRoot = getHermesRoot();
  if (!fs.existsSync(hermesRoot)) {
    console.error(`❌ Hermes root not found: ${hermesRoot}`);
    console.error('Set HERMES_ROOT to your Hermes checkout path and retry.');
    process.exit(1);
  }
  if (!hasHermesProviderEnv()) {
    console.error('❌ Hermes provider credentials are not configured in env.');
    console.error('Set at least one provider env before smoke test, e.g.:');
    console.error('  export OPENAI_API_KEY=<your_key>');
    console.error('Or set OPENAI_API_KEY (and Hermes vars) in backend/.env');
    process.exit(1);
  }

  const cases: SmokeCase[] = [
    {
      id: 'health-short',
      prompt: 'Reply exactly with: Hermes health ok',
      validate: (output) => {
        const normalized = output.trim().toLowerCase();
        if (!normalized) return { ok: false, reason: 'empty output' };
        if (normalized.includes('hermes') && normalized.includes('ok')) return { ok: true };
        return { ok: false, reason: `unexpected content: "${preview(output)}"` };
      },
    },
    {
      id: 'structured-long',
      prompt:
        'Provide exactly 6 bullet points about context migration between agent frameworks. Each bullet starts with "- " and each bullet has 8 to 18 words.',
      validate: (output) => {
        const lines = output
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.startsWith('- '));
        if (lines.length < 4) {
          return { ok: false, reason: `expected at least 4 bullet lines, got ${lines.length}` };
        }
        return { ok: true };
      },
    },
    {
      id: 'nonempty-on-odd-input',
      prompt: 'Summarize this noisy text in one sentence: @@@ ### ??? 12345 framework-switch migration state',
      validate: (output) => {
        const trimmed = output.trim();
        if (!trimmed) return { ok: false, reason: 'empty output' };
        if (trimmed.length < 12) return { ok: false, reason: `too short output: "${trimmed}"` };
        return { ok: true };
      },
    },
  ];

  let passCount = 0;
  for (const c of cases) {
    const started = Date.now();
    const result = await runHermesQuery(c.prompt);
    const costMs = Date.now() - started;
    if (!result.ok) {
      console.error(`❌ [${c.id}] runtime failure (${costMs}ms): ${result.error || 'unknown error'}`);
      if (result.output) {
        console.error(`   stdout: ${preview(result.output, 260)}`);
      }
      continue;
    }
    const v = c.validate(result.output);
    if (!v.ok) {
      console.error(`❌ [${c.id}] validation failure (${costMs}ms): ${v.reason || 'invalid output'}`);
      console.error(`   output: ${preview(result.output, 260)}`);
      continue;
    }
    passCount += 1;
    console.log(`✅ [${c.id}] pass (${costMs}ms)`);
  }

  console.log(`\nResult: ${passCount}/${cases.length} passed`);
  if (passCount !== cases.length) process.exit(1);
}

run().catch((err) => {
  console.error('❌ Smoke test crashed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
