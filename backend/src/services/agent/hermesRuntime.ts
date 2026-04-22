import fs from 'fs';
import { spawn } from 'child_process';
import path from 'path';

export type HermesRunResult = {
  ok: boolean;
  output: string;
  error?: string;
};

function getHermesRoot(): string {
  const configured = (process.env.HERMES_ROOT || '').trim();
  if (configured) return configured;
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, 'projects', 'hermes');
}

function shellQuoteSingle(value: string): string {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function buildHermesModelProviderFlags(): string {
  const parts: string[] = [];
  const provider = (process.env.HERMES_PROVIDER || '').trim();
  const model = (process.env.HERMES_MODEL || '').trim();
  if (provider) parts.push(`--provider ${shellQuoteSingle(provider)}`);
  if (model) parts.push(`--model ${shellQuoteSingle(model)}`);
  return parts.join(' ');
}

function preview(text: string, max = 320): string {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max)}...`;
}

function buildHermesExecCommand(prompt: string): string {
  const modelProviderFlags = buildHermesModelProviderFlags();
  const suffix = `${modelProviderFlags ? `${modelProviderFlags} ` : ''}chat -Q -q ${shellQuoteSingle(prompt)}`;
  const explicitCmd = (process.env.HERMES_CMD || '').trim();
  if (explicitCmd) {
    return `${explicitCmd} ${suffix}`;
  }
  const explicitPythonBin = (process.env.HERMES_PYTHON_BIN || '').trim();
  const hermesVenv = (process.env.HERMES_VENV || '').trim();

  if (explicitPythonBin) {
    return `${shellQuoteSingle(explicitPythonBin)} -m hermes_cli.main ${suffix}`;
  }
  if (hermesVenv) {
    return `${shellQuoteSingle(path.join(hermesVenv, 'bin', 'python'))} -m hermes_cli.main ${suffix}`;
  }
  // Prefer installed CLI; then prefer venv python if active; fallback to system python.
  return `if command -v hermes >/dev/null 2>&1; then hermes ${suffix}; elif [ -n "$VIRTUAL_ENV" ] && [ -x "$VIRTUAL_ENV/bin/python" ]; then "$VIRTUAL_ENV/bin/python" -m hermes_cli.main ${suffix}; elif command -v python3 >/dev/null 2>&1; then python3 -m hermes_cli.main ${suffix}; elif command -v python >/dev/null 2>&1; then python -m hermes_cli.main ${suffix}; else echo "Neither hermes, python3 nor python is available in PATH." >&2; exit 127; fi`;
}

export async function runHermesQuery(prompt: string): Promise<HermesRunResult> {
  const hermesRoot = getHermesRoot();
  if (!fs.existsSync(hermesRoot)) {
    return {
      ok: false,
      output: '',
      error: `Hermes root not found: ${hermesRoot}. Set HERMES_ROOT to your WSL hermes checkout.`,
    };
  }

  const timeoutMs = Math.max(5000, Number(process.env.HERMES_TIMEOUT_MS || 120000));
  const command = buildHermesExecCommand(prompt);

  function enrichHermesError(raw: string): string {
    const msg = (raw || '').trim();
    if (!msg) return 'Hermes execution failed';
    if (msg.includes("ModuleNotFoundError: No module named 'dotenv'")) {
      return `${msg}\nHint: install Hermes Python deps in ${hermesRoot} (e.g. "python3 -m pip install -e .").`;
    }
    if (msg.includes('No module named')) {
      return `${msg}\nHint: Hermes Python dependencies may be missing. Try "python3 -m pip install -e ." in ${hermesRoot}.`;
    }
    return msg;
  }

  return new Promise((resolve) => {
    const child = spawn('/bin/bash', ['-lc', command], {
      cwd: hermesRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';

    if (child.stdout) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
    }
    if (child.stderr) {
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
    }

    const t = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      resolve({
        ok: false,
        output: stdout.trim(),
        error: `Hermes command timeout after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(t);
      resolve({
        ok: false,
        output: stdout.trim(),
        error: `Hermes spawn failed: ${err.message}`,
      });
    });

    child.on('close', (code) => {
      clearTimeout(t);
      if (code === 0) {
        return resolve({ ok: true, output: stdout.trim() });
      }
      const stderrText = stderr.trim();
      const stdoutText = stdout.trim();
      const fallback =
        stderrText ||
        (stdoutText ? `Hermes exited with code ${code ?? -1}. stdout: ${preview(stdoutText)}` : `Hermes exited with code ${code ?? -1}`);
      return resolve({
        ok: false,
        output: stdoutText,
        error: enrichHermesError(fallback),
      });
    });
  });
}
