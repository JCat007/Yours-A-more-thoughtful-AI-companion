import fs from 'fs';
import path from 'path';

export type BellaMode = 'china' | 'world';

export type BellaRuntimeOptions = {
  searchBrowserFallbackToBing: boolean;
  enableWebSearch: boolean;
  enableWebFetch: boolean;
};

type StoreShape = Partial<Record<BellaMode, Partial<BellaRuntimeOptions>>>;

const DATA_FILE = path.join(__dirname, '../../data/bella-runtime-options.json');

function parseEnvBool(key: string, fallback: boolean): boolean {
  const raw = String(process.env[key] || '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

function getEnvDefaults(): BellaRuntimeOptions {
  return {
    // Default on: after failed search, allow browser fallback to Bing.
    searchBrowserFallbackToBing: parseEnvBool('OPENCLAW_SEARCH_BROWSER_FALLBACK_TO_BING', true),
    // Default off: web_search can be noisy / unstable for some deployments.
    enableWebSearch: parseEnvBool('OPENCLAW_ENABLE_WEB_SEARCH', false),
    // Default off: enable explicitly when you need web_fetch.
    enableWebFetch: parseEnvBool('OPENCLAW_ENABLE_WEB_FETCH', false),
  };
}

function ensureDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readStore(): StoreShape {
  try {
    if (!fs.existsSync(DATA_FILE)) return {};
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as StoreShape;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(next: StoreShape) {
  ensureDir();
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

export function getBellaRuntimeOptions(mode: BellaMode): BellaRuntimeOptions {
  const defaults = getEnvDefaults();
  const store = readStore();
  const scoped = store[mode] || {};
  return {
    searchBrowserFallbackToBing:
      typeof scoped.searchBrowserFallbackToBing === 'boolean'
        ? scoped.searchBrowserFallbackToBing
        : defaults.searchBrowserFallbackToBing,
    enableWebSearch:
      typeof scoped.enableWebSearch === 'boolean'
        ? scoped.enableWebSearch
        : defaults.enableWebSearch,
    enableWebFetch:
      typeof scoped.enableWebFetch === 'boolean'
        ? scoped.enableWebFetch
        : defaults.enableWebFetch,
  };
}

export function updateBellaRuntimeOptions(
  mode: BellaMode,
  patch: Partial<BellaRuntimeOptions>,
): BellaRuntimeOptions {
  const store = readStore();
  const cur = getBellaRuntimeOptions(mode);
  const next: BellaRuntimeOptions = {
    searchBrowserFallbackToBing:
      typeof patch.searchBrowserFallbackToBing === 'boolean'
        ? patch.searchBrowserFallbackToBing
        : cur.searchBrowserFallbackToBing,
    enableWebSearch:
      typeof patch.enableWebSearch === 'boolean'
        ? patch.enableWebSearch
        : cur.enableWebSearch,
    enableWebFetch:
      typeof patch.enableWebFetch === 'boolean'
        ? patch.enableWebFetch
        : cur.enableWebFetch,
  };
  store[mode] = next;
  writeStore(store);
  return next;
}

export function resetBellaRuntimeOptions(mode: BellaMode): BellaRuntimeOptions {
  const store = readStore();
  delete store[mode];
  writeStore(store);
  return getBellaRuntimeOptions(mode);
}

