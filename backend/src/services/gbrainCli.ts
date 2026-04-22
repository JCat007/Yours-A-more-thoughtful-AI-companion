import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { execFileSync, spawn } from 'child_process';
import path from 'path';

/** Safe single-quoted fragment for `bash -c` (stdin redirect + exec). */
function shellSingleQuote(s: string): string {
  return `'${String(s).replace(/'/g, `'\"'\"'`)}'`;
}

function gbrainPutTimeoutMs(): number {
  const n = Number(process.env.GBRAIN_PUT_TIMEOUT_MS || 120_000);
  return Number.isFinite(n) && n >= 15_000 ? n : 120_000;
}

function logGbrainSchemaHintIfNeeded(stderr: string): void {
  const s = stderr.slice(0, 500);
  if (/relation\s+"(pages|timeline_entries)"/i.test(s) && /does not exist/i.test(s)) {
    console.warn(
      '[gbrain] Database missing gbrain tables. Use the same DATABASE_URL as Bella and run: gbrain init --url "<DATABASE_URL>"',
    );
  }
}

/** Ensure Bun global installs (e.g. `gbrain`) resolve when the Node process was started without login PATH (systemd, pm2). */
function gbrainChildEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const home = (env.HOME || env.USERPROFILE || '').trim();
  if (home) {
    const bunBin = path.join(home, '.bun', 'bin');
    const cur = env.PATH || '';
    const sep = path.delimiter;
    if (bunBin && !cur.split(sep).includes(bunBin)) {
      env.PATH = `${bunBin}${sep}${cur}`;
    }
  }
  return env;
}

/**
 * Keys removed from the child env so real credentials are not passed through.
 * Note: upstream `gbrain` merges `~/.gbrain/config.json` (including `openai_api_key`) even when env is empty,
 * so stripping env alone is NOT enough — see `prepareGbrainPutChildEnv`.
 */
const GBRAIN_PUT_STRIP_OPENAI_KEYS = [
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_ORG_ID',
  'OPENAI_PROJECT_ID',
  'ANTHROPIC_API_KEY',
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_ENDPOINT',
] as const;

/** Optional env that could still feed cloud creds into the gbrain child. */
const GBRAIN_PUT_STRIP_EXTRA = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN'] as const;

type GbrainPutPreparedEnv = {
  env: NodeJS.ProcessEnv;
  /** Ephemeral HOME so `~/.gbrain/config.json` is not read (avoids file-stored `openai_api_key`). RmSync in `gbrainPut` finally. */
  tmpHome?: string;
};

/**
 * When skipping embed: isolate HOME, strip keys, and point OpenAI client at localhost:1 so any remaining
 * `new OpenAI()` call fails in milliseconds instead of hanging on a real network (retries + long TCP).
 * DB still comes from `DATABASE_URL` / `GBRAIN_DATABASE_URL` in env (required).
 */
function prepareGbrainPutChildEnv(skipOpenAiEmbed: boolean): GbrainPutPreparedEnv {
  const env = gbrainChildEnv();
  if (!skipOpenAiEmbed) {
    return { env };
  }
  for (const k of GBRAIN_PUT_STRIP_OPENAI_KEYS) {
    if (k in env) delete env[k];
  }
  for (const k of GBRAIN_PUT_STRIP_EXTRA) {
    if (k in env) delete env[k];
  }

  const tmpHome = path.join(os.tmpdir(), `bella-gbrain-put-home-${crypto.randomBytes(8).toString('hex')}`);
  fs.mkdirSync(tmpHome, { recursive: true });
  env.HOME = tmpHome;
  env.USERPROFILE = tmpHome;
  const xdg = path.join(tmpHome, '.config');
  fs.mkdirSync(xdg, { recursive: true });
  env.XDG_CONFIG_HOME = xdg;

  env.OPENAI_BASE_URL = 'http://127.0.0.1:1';
  env.OPENAI_API_KEY = 'sk-bella-no-embed';

  return { env, tmpHome };
}

export function isGbrainEnabled(): boolean {
  const v = String(process.env.GBRAIN_ENABLED || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export type GbrainRuntimeSnapshot = {
  enabled: boolean;
  home: string;
  gbrainBin: string;
  hasDatabaseUrl: boolean;
  hasGbrainDatabaseUrl: boolean;
};

export function getGbrainRuntimeSnapshot(): GbrainRuntimeSnapshot {
  const home = (process.env.HOME || process.env.USERPROFILE || '').trim();
  return {
    enabled: isGbrainEnabled(),
    home,
    gbrainBin: gbrainBin(),
    hasDatabaseUrl: !!String(process.env.DATABASE_URL || '').trim(),
    hasGbrainDatabaseUrl: !!String(process.env.GBRAIN_DATABASE_URL || '').trim(),
  };
}

export function gbrainBin(): string {
  const b = (process.env.GBRAIN_BIN || 'gbrain').trim();
  return b || 'gbrain';
}

/** Absolute path so non-interactive `bash -c` inherits the same PATH as `gbrainChildEnv` (e.g. `~/.bun/bin`). */
function resolveGbrainPathSync(): string {
  const bin = gbrainBin();
  if (path.isAbsolute(bin)) {
    try {
      if (fs.existsSync(bin)) return bin;
    } catch {
      // ignore
    }
    return bin;
  }
  const env = gbrainChildEnv();
  try {
    const out = execFileSync(
      '/bin/bash',
      ['-lc', `command -v -- ${shellSingleQuote(bin)} 2>/dev/null || true`],
      { encoding: 'utf8', env, timeout: 8000, maxBuffer: 1024 * 1024 },
    )
      .trim()
      .split(/\r?\n/)[0]
      ?.trim();
    if (out) {
      try {
        if (fs.existsSync(out)) return out;
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return bin;
}

export async function runGbrain(
  args: string[],
  opts?: { timeoutMs?: number }
): Promise<{ code: number; stdout: string; stderr: string }> {
  const timeoutMs = Math.max(2000, Number(opts?.timeoutMs ?? process.env.GBRAIN_TIMEOUT_MS ?? 15_000));

  return new Promise((resolve, reject) => {
    const child = spawn(gbrainBin(), args, {
      env: gbrainChildEnv(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const t = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
      }, 1500);
      reject(new Error(`gbrain timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    if (child.stdout) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (d: string) => {
        stdout += d;
      });
    }
    if (child.stderr) {
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (d: string) => {
        stderr += d;
      });
    }
    child.on('error', (e) => {
      clearTimeout(t);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(t);
      logGbrainSchemaHintIfNeeded(stderr);
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

export async function gbrainGet(slug: string): Promise<string | null> {
  const { code, stdout, stderr } = await runGbrain(['get', slug], { timeoutMs: 12_000 }).catch((e) => ({
    code: 1,
    stdout: '',
    stderr: String((e as Error)?.message || e),
  }));
  if (code !== 0) {
    if (stderr && !stderr.includes('not found')) {
      console.warn('[gbrain] get', slug, stderr.slice(0, 200));
    }
    return null;
  }
  const t = stdout.trim();
  return t ? t : null;
}

export type GbrainPutOptions = {
  /**
   * `false` = pass real env + normal HOME so `gbrain put` can run full embedding (needs reachable API; can be very slow).
   * Omitted or `true` (default): ephemeral HOME (ignores `~/.gbrain/config.json` keys), strips secrets, forces invalid
   * `OPENAI_BASE_URL` so embedding fails fast; page still saves (vectors NULL until `gbrain embed`).
   * Process env `GBRAIN_PUT_WITH_EMBED=1` forces full embed for every `put`, ignoring this flag.
   */
  skipOpenAiEmbed?: boolean;
};

/**
 * gbrain `put` reads body via `readFileSync('/dev/stdin')` when stdin is not a TTY (see upstream `src/cli.ts`).
 * A Node **pipe** as stdin can make Bun throw `ENXIO` on `/dev/stdin`. Passing an **open file fd** as stdio[0]
 * matches shell `< file` and avoids both issues. WSL/Linux/macOS only. See GBRAIN_PUT_TIMEOUT_MS.
 */
export async function gbrainPut(slug: string, markdown: string, opts?: GbrainPutOptions): Promise<boolean> {
  if (process.platform === 'win32') {
    console.warn('[gbrain] put skipped on win32: run the Bella backend from WSL/Linux for gbrain writes.');
    return false;
  }

  const tmp = path.join(os.tmpdir(), `bella-gbrain-put-${crypto.randomBytes(8).toString('hex')}.md`);
  const timeoutMs = gbrainPutTimeoutMs();
  fs.writeFileSync(tmp, markdown, 'utf8');

  const forceEmbed = /^(1|true|yes)$/i.test(String(process.env.GBRAIN_PUT_WITH_EMBED || '').trim());
  /** Default: fast `put` without real embedding. `GBRAIN_PUT_WITH_EMBED=1` keeps normal HOME + keys. */
  const skipOpenAiEmbed = forceEmbed ? false : opts?.skipOpenAiEmbed !== false;
  const { env: childEnv, tmpHome } = prepareGbrainPutChildEnv(skipOpenAiEmbed);

  const gb = resolveGbrainPathSync();
  let fd: number | undefined;
  try {
    fd = fs.openSync(tmp, 'r');

    const { code, stderr, stdout } = await new Promise<{ code: number; stderr: string; stdout: string }>(
      (resolve, reject) => {
        const child = spawn(gb, ['put', slug], {
          env: childEnv,
          stdio: [fd as number, 'pipe', 'pipe'],
          windowsHide: true,
        });

        let stdoutBuf = '';
        let stderrBuf = '';
        if (child.stdout) {
          child.stdout.setEncoding('utf8');
          child.stdout.on('data', (d: string) => {
            stdoutBuf += d;
          });
        }
        if (child.stderr) {
          child.stderr.setEncoding('utf8');
          child.stderr.on('data', (d: string) => {
            stderrBuf += d;
          });
        }

        const t = setTimeout(() => {
          try {
            child.kill('SIGTERM');
          } catch {
            // ignore
          }
          setTimeout(() => {
            try {
              child.kill('SIGKILL');
            } catch {
              // ignore
            }
          }, 1500);
          reject(new Error(`gbrain put timeout after ${timeoutMs}ms`));
        }, timeoutMs);

        child.on('error', (e) => {
          clearTimeout(t);
          reject(e);
        });

        child.on('close', (exitCode) => {
          clearTimeout(t);
          const codeN = exitCode ?? 0;
          if (codeN !== 0) {
            logGbrainSchemaHintIfNeeded(`${stderrBuf}${stdoutBuf}`);
          }
          resolve({ code: codeN, stderr: stderrBuf, stdout: stdoutBuf });
        });
      },
    ).catch((e: Error) => {
      const msg = (e && e.message) || String(e);
      console.warn('[gbrain] put', slug, 'spawn/error:', msg.slice(0, 500));
      return { code: 1, stderr: msg, stdout: '' };
    });

    if (code !== 0) {
      const parts = [stderr.trim(), stdout.trim()].filter(Boolean);
      const tail = parts.length ? parts.join(' | ').slice(0, 800) : '(no stdout/stderr)';
      console.warn('[gbrain] put', slug, 'exit=', code, tail);
      return false;
    }
    return true;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore
      }
    }
    try {
      fs.unlinkSync(tmp);
    } catch {
      // ignore
    }
    if (tmpHome) {
      try {
        fs.rmSync(tmpHome, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
}

export async function gbrainSearch(query: string): Promise<string> {
  const { code, stdout, stderr } = await runGbrain(['search', query], { timeoutMs: 15_000 }).catch((e) => ({
    code: 1,
    stdout: '',
    stderr: String((e as Error)?.message || e),
  }));
  if (code !== 0) {
    if (stderr) console.warn('[gbrain] search', stderr.slice(0, 200));
    return '';
  }
  return stdout;
}

export async function gbrainQuery(question: string): Promise<string> {
  const { code, stdout, stderr } = await runGbrain(['query', question], { timeoutMs: 25_000 }).catch((e) => ({
    code: 1,
    stdout: '',
    stderr: String((e as Error)?.message || e),
  }));
  if (code !== 0) {
    if (stderr) console.warn('[gbrain] query', stderr.slice(0, 200));
    return '';
  }
  return stdout;
}

export async function gbrainTimelineAdd(slug: string, isoDate: string, text: string): Promise<boolean> {
  const { code, stderr } = await runGbrain(['timeline-add', slug, isoDate, text], { timeoutMs: 15_000 }).catch(
    (e) => ({
      code: 1,
      stderr: String((e as Error)?.message || e),
    })
  );
  if (code !== 0) {
    console.warn('[gbrain] timeline-add', slug, stderr.slice(0, 300));
    return false;
  }
  return true;
}
