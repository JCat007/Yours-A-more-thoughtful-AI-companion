/**
 * Bella assistant trace logging.
 * Writes to stdout/stderr and `backend/logs/bella-assistant.log`.
 */
import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'bella-assistant.log');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 23);
}

function write(level: string, tag: string, msg: string, extra?: string) {
  const line = `[${ts()}] [${tag}] ${msg}${extra ? ' ' + extra : ''}\n`;
  console.log(line.trim());
  try {
    ensureLogDir();
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    // ignore file write errors
  }
}

export const bellaLog = {
  /** User request accepted */
  requestStart: (userMsg: string) => {
    const preview = userMsg.length > 60 ? userMsg.slice(0, 60) + '...' : userMsg;
    write('INFO', 'Request', `start user="${preview.replace(/"/g, "'")}"`);
  },

  /** OpenClaw generation started */
  openclawStart: () => write('INFO', 'OpenClaw', 'call start (may invoke skills)'),

  /** OpenClaw returned successfully */
  openclawDone: (ms: number, replyLen: number) =>
    write('INFO', 'OpenClaw', `success elapsed=${ms}ms replyLen=${replyLen}`),

  /** Model attempt detail */
  openclawAttempt: (detail: string) => write('INFO', 'OpenClaw', `attempt ${detail}`),

  /** Tool invocation detail parsed from logs/errors */
  openclawToolStep: (detail: string) => write('INFO', 'OpenClawTool', detail),

  /** finish_reason=length triggered continuation */
  openclawContinuation: (detail: string) => write('WARN', 'OpenClaw', `continuation ${detail}`),

  /** Reply language decision */
  replyLanguage: (detail: string) => write('INFO', 'Language', `replyLang ${detail}`),

  /** OpenClaw failure */
  openclawFail: (err: string) => write('ERROR', 'OpenClaw', `call failed: ${err}`),

  /** Doubao reply-mode decision start */
  doubaoStart: () => write('INFO', 'Doubao', 'reply-mode decision start'),

  /** Doubao reply-mode decision result */
  doubaoDone: (mode: string) => write('INFO', 'Doubao', `reply-mode: ${mode}`),

  /** Doubao decision failed; keyword fallback */
  doubaoFallback: (mode: string) => write('WARN', 'Doubao', `decision failed, keyword fallback: ${mode}`),

  /** Media generation */
  mediaGen: (type: 'image' | 'video', scene?: string) =>
    write('INFO', 'Media', `generate ${type === 'image' ? 'image' : 'video'} scene=${scene || 'none'}`),

  /** Request finished */
  requestDone: (mode: string, hasMedia: boolean) =>
    write('INFO', 'Done', `mode=${mode} hasMedia=${hasMedia}`),
};
