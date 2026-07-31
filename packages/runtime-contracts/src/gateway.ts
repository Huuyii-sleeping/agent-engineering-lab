import type { AgentRuntimePort } from "./agent.js";
import type { MemoryRuntimePort } from "./memory.js";
import type { ToolExecutionPort } from "./tool.js";
import type { WorkflowRuntimePort } from "./workflow.js";

/** 只组合四个领域 Port 的 Runtime 入口。 */
export interface RuntimeGateway {
  readonly agent: AgentRuntimePort;
  readonly workflow: WorkflowRuntimePort;
  readonly tools: ToolExecutionPort;
  readonly memory: MemoryRuntimePort;
}

/** 创建不承载编排、fallback 或业务逻辑的 RuntimeGateway。 */
export function createRuntimeGateway(ports: RuntimeGateway): RuntimeGateway {
  return Object.freeze({
    agent: ports.agent,
    workflow: ports.workflow,
    tools: ports.tools,
    memory: ports.memory,
  });
}
