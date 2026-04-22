export interface McpServerConfig {
  /** Internal stable id, e.g. `douyin-mcp`. */
  id: string;
  /** Spawn command, e.g. `uvx` or `python`. */
  command: string;
  /** Argument vector for the command. */
  args: string[];
  /** Extra env vars required by this server (optional). */
  env?: Record<string, string>;
}

/** MCP servers bundled with this repository. */
export const mcpServers: McpServerConfig[] = [
  {
    id: 'douyin-mcp',
    // Mirrors recommended douyin-mcp-server defaults:
    // {"mcpServers":{"douyin-mcp":{"command":"uvx","args":["douyin-mcp-server"],"env":{"DASHSCOPE_API_KEY":"sk-xxxx"}}}}
    command: 'uvx',
    args: ['douyin-mcp-server'],
    env: {
      // Text extraction features need an Alibaba DashScope API key.
      DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY || '',
    },
  },
  // Append additional MCP servers here as needed.
];

