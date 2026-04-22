import type { AgentFramework } from '../authService';
import type { AgentAdapter, AgentChatParams } from './adapters/AgentAdapter';
import { HermesAdapter } from './adapters/HermesAdapter';
import { OpenClawAdapter } from './adapters/OpenClawAdapter';

export class AgentRuntimeRouter {
  private readonly adapters: Record<AgentFramework, AgentAdapter>;

  constructor() {
    this.adapters = {
      openclaw: new OpenClawAdapter(),
      hermes: new HermesAdapter(),
    };
  }

  getAdapter(framework: AgentFramework): AgentAdapter {
    return this.adapters[framework] || this.adapters.openclaw;
  }

  async chat(params: AgentChatParams): Promise<string> {
    const adapter = this.getAdapter(params.framework);
    return adapter.chat(params);
  }
}

export const agentRuntimeRouter = new AgentRuntimeRouter();
