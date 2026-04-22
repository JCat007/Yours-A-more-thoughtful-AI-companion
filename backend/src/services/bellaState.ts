import fs from 'fs';
import path from 'path';

type Turn = { role: 'user' | 'assistant'; content: string; ts: number };
type BellaIntent = 'chat_only' | 'image_request' | 'task_request';
type SessionState = {
  turns: Turn[];
  lastIntent?: BellaIntent;
};

const sessionMap = new Map<string, SessionState>();
const MAX_TURNS = Number(process.env.BELLA_MEMORY_TURNS || 12);
const MAX_SESSIONS = Number(process.env.BELLA_MEMORY_MAX_SESSIONS || 300);

function getStateFilePath() {
  const custom = (process.env.BELLA_MEMORY_FILE || '').trim();
  if (custom) return custom;
  return path.join(process.cwd(), 'data', 'bella-state.json');
}

function sanitizeState(state: SessionState): SessionState {
  const turns = (state.turns || [])
    .filter((t) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string')
    .slice(-MAX_TURNS);
  const out: SessionState = { turns };
  if (state.lastIntent) out.lastIntent = state.lastIntent;
  return out;
}

function persistState() {
  const filePath = getStateFilePath();
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const payload: Record<string, SessionState> = {};
  for (const [key, state] of sessionMap.entries()) {
    payload[key] = sanitizeState(state);
  }
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

function loadState() {
  try {
    const filePath = getStateFilePath();
    if (!fs.existsSync(filePath)) return;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, SessionState>;
    const entries = Object.entries(parsed || {}).slice(-MAX_SESSIONS);
    for (const [key, value] of entries) {
      sessionMap.set(key, sanitizeState(value || { turns: [] }));
    }
  } catch {
    // ignore state file parse errors to avoid breaking chat route
  }
}

loadState();

export function rememberTurn(sessionKey: string, role: 'user' | 'assistant', content: string) {
  if (!sessionKey) return;
  const state = sessionMap.get(sessionKey) || { turns: [] };
  state.turns.push({ role, content, ts: Date.now() });
  if (state.turns.length > MAX_TURNS) {
    state.turns.splice(0, state.turns.length - MAX_TURNS);
  }
  sessionMap.set(sessionKey, state);
  if (sessionMap.size > MAX_SESSIONS) {
    const firstKey = sessionMap.keys().next().value as string | undefined;
    if (firstKey) sessionMap.delete(firstKey);
  }
  persistState();
}

export function rememberIntent(sessionKey: string, intent: BellaIntent) {
  if (!sessionKey) return;
  const state = sessionMap.get(sessionKey) || { turns: [] };
  state.lastIntent = intent;
  sessionMap.set(sessionKey, state);
  persistState();
}

export function getRecentUserTexts(sessionKey: string, fallback: string[] = []): string[] {
  const state = sessionMap.get(sessionKey);
  if (!state || state.turns.length === 0) return fallback;
  return state.turns.filter((t) => t.role === 'user').map((t) => t.content).slice(-8);
}

export function getLastIntent(sessionKey: string): 'chat_only' | 'image_request' | 'task_request' | undefined {
  return sessionMap.get(sessionKey)?.lastIntent;
}

export function getMemoryStats() {
  let turns = 0;
  for (const state of sessionMap.values()) turns += state.turns.length;
  return {
    sessions: sessionMap.size,
    turns,
    maxTurns: MAX_TURNS,
    maxSessions: MAX_SESSIONS,
    stateFile: getStateFilePath(),
  };
}

export type BellaStateTurn = { role: 'user' | 'assistant'; content: string; ts: number };

export function getSessionTurns(sessionKey: string): BellaStateTurn[] {
  if (!sessionKey) return [];
  const state = sessionMap.get(sessionKey);
  if (!state) return [];
  return [...state.turns].map((t) => ({ role: t.role, content: t.content, ts: t.ts }));
}

export function setSessionTurns(sessionKey: string, turns: BellaStateTurn[]) {
  if (!sessionKey) return;
  const prev = sessionMap.get(sessionKey) || { turns: [] };
  const nextTurns = (turns || [])
    .filter((t) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string')
    .slice(-MAX_TURNS)
    .map((t) => ({ role: t.role, content: t.content, ts: Number(t.ts) || Date.now() }));
  sessionMap.set(sessionKey, { turns: nextTurns, lastIntent: prev.lastIntent });
  persistState();
}

export function listSessionKeysByUserId(userId: string): string[] {
  if (!userId) return [];
  const keys: string[] = [];
  for (const key of sessionMap.keys()) {
    if (key.includes(`:user:${userId}`)) keys.push(key);
  }
  return keys.sort();
}
