/**
 * Parse common boolean-like environment variables (1/true/yes/on).
 * Empty or unset uses `defaultWhenUnset`.
 */
export function envLooksEnabled(name: string, defaultWhenUnset: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || String(raw).trim() === '') return defaultWhenUnset;
  return new Set(['1', 'true', 'yes', 'on']).has(String(raw).trim().toLowerCase());
}
