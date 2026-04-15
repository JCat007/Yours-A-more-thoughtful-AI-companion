import { spawn, ChildProcess } from 'child_process';
import { mcpServers, McpServerConfig } from './config';

export interface McpToolCall {
  serverId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface McpToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

/** One stdio MCP session: spawn child, speak newline-delimited JSON-RPC. */
class StdioMcpSession {
  private proc: ChildProcess | null = null;
  private requestId = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private buffer = '';

  constructor(private cfg: McpServerConfig) {}

  async start(): Promise<void> {
    if (this.proc) return;

    this.proc = spawn(this.cfg.command, this.cfg.args, {
      env: { ...process.env, ...this.cfg.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.proc.stdout!.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf8');
      let idx: number;
      while ((idx = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, idx).trim();
        this.buffer = this.buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line) as { id?: number; result?: unknown; error?: { message?: string } };
          if (msg.id !== undefined && this.pending.has(msg.id)) {
            const { resolve, reject } = this.pending.get(msg.id)!;
            this.pending.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
            else resolve(msg.result);
          }
        } catch (_) {}
      }
    });

    this.proc.stderr?.on('data', (chunk: Buffer) => {
      process.stderr.write(chunk);
    });

    this.proc.on('error', (err) => {
      for (const [, { reject }] of this.pending) reject(err);
      this.pending.clear();
    });

    this.proc.on('exit', (code) => {
      this.proc = null;
      if (code !== 0 && code !== null) {
        for (const [, { reject }] of this.pending) {
          reject(new Error(`MCP process exited with code ${code}`));
        }
        this.pending.clear();
      }
    });

    const initId = ++this.requestId;
    const initPromise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(initId, { resolve, reject });
    });

    this.send({ jsonrpc: '2.0', id: initId, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'yours', version: '1.0.0' } } });
    await initPromise;
    this.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  }

  private send(obj: object): void {
    if (!this.proc?.stdin?.writable) throw new Error('MCP process not running');
    this.proc.stdin.write(JSON.stringify(obj) + '\n');
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.start();
    const id = ++this.requestId;
    const p = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.send({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args ?? {} } });
    return p;
  }

  close(): void {
    if (this.proc?.stdin?.writable) this.proc.stdin.end();
    this.proc = null;
    for (const [, { reject }] of this.pending) reject(new Error('MCP session closed'));
    this.pending.clear();
  }
}

class McpManager {
  private static instance: McpManager;
  private sessions = new Map<string, StdioMcpSession>();

  private constructor() {}

  static getInstance(): McpManager {
    if (!this.instance) this.instance = new McpManager();
    return this.instance;
  }

  async initAll(): Promise<void> {
    for (const cfg of mcpServers) {
      try {
        await this.ensureSession(cfg.id);
      } catch (e: unknown) {
        console.warn('[MCP] failed to init server:', cfg.id, (e as Error)?.message || String(e));
      }
    }
  }

  private getConfig(serverId: string): McpServerConfig {
    const cfg = mcpServers.find((s) => s.id === serverId);
    if (!cfg) throw new Error(`MCP server not configured: ${serverId}`);
    return cfg;
  }

  private async ensureSession(serverId: string): Promise<StdioMcpSession> {
    let session = this.sessions.get(serverId);
    if (session) return session;
    const cfg = this.getConfig(serverId);
    session = new StdioMcpSession(cfg);
    await session.start();
    this.sessions.set(serverId, session);
    console.log('[MCP] connected server:', serverId);
    return session;
  }

  async callTool(call: McpToolCall): Promise<McpToolResult> {
    try {
      const session = await this.ensureSession(call.serverId);
      const result = await session.callTool(call.toolName, (call.args || {}) as Record<string, unknown>);
      return { ok: true, data: result };
    } catch (e: unknown) {
      const msg = (e as Error)?.message || 'MCP call failed';
      console.error('[MCP] tool call failed:', call.serverId, call.toolName, msg);
      return { ok: false, error: msg };
    }
  }
}

export const mcpManager = McpManager.getInstance();
