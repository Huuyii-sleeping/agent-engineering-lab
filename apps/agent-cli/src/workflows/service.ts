import { isWorkflowVersion, type WorkflowRunMode, type WorkflowRuntimeEvent } from "@orbit/workflow-core";
import type { AgentAppRuntimeDeps } from "../bootstrap/app-runtime.js";
import { compileWorkflowForRuntime } from "./compiler-adapter.js";
import { createBuiltinWorkflowExecutorRegistry } from "./executors/index.js";
import { OpenAIWorkflowLlmService } from "./executors/llm.js";
import { WorkflowRuntime } from "./runtime.js";
import type { WorkflowRun } from "./types.js";

/** Agent workflow API 接受的启动参数。 */
export type StartWorkflowRequest = {
  workflow: unknown;
  mode: WorkflowRunMode;
  inputs?: Record<string, unknown>;
  target_node_id?: string;
  node_inputs?: Record<string, unknown>;
};

function assertRunMode(value: unknown): asserts value is WorkflowRunMode {
  if (value !== "node-test" && value !== "draft" && value !== "production") {
    throw new Error("mode 必须是 node-test、draft 或 production。");
  }
}

/** 将共享编译器和 Agent executor 装配为进程内运行服务。 */
export class WorkflowRuntimeService {
  private readonly runtime: WorkflowRuntime;

  constructor(deps: Pick<AgentAppRuntimeDeps, "client" | "modelPolicyService" | "toolService">) {
    const executors = createBuiltinWorkflowExecutorRegistry({
      llmService: new OpenAIWorkflowLlmService(deps.client, deps.modelPolicyService),
      toolService: deps.toolService,
    });
    this.runtime = new WorkflowRuntime(executors);
  }

  /** 编译并异步启动一次工作流运行。 */
  start(input: StartWorkflowRequest): WorkflowRun {
    assertRunMode(input.mode);
    if (!input.workflow) throw new Error("workflow 是必填项。");
    if (input.mode === "production" && !isWorkflowVersion(input.workflow)) {
      throw new Error("production 运行必须使用不可变发布版本。");
    }
    if (input.mode === "node-test" && !String(input.target_node_id ?? "").trim()) {
      throw new Error("node-test 运行必须指定 target_node_id。");
    }
    const ir = compileWorkflowForRuntime(input.workflow);
    if (input.mode === "node-test" && !ir.nodes.some((node) => node.id === input.target_node_id)) {
      throw new Error(`目标节点 ${String(input.target_node_id)} 不存在。`);
    }
    return this.runtime.start({
      ir,
      mode: input.mode,
      inputs: input.inputs,
      targetNodeId: input.target_node_id,
      nodeInputs: input.node_inputs,
    });
  }

  /** 查询当前运行快照。 */
  get(runId: string): WorkflowRun | undefined {
    return this.runtime.getRun(runId);
  }

  /** 取消仍在执行的运行。 */
  cancel(runId: string): boolean {
    return this.runtime.cancel(runId);
  }

  /** 回放指定游标之后的事件。 */
  events(runId: string, sinceId = 0): WorkflowRuntimeEvent[] {
    return this.runtime.listEvents(runId, sinceId);
  }

  /** 订阅运行产生的新事件。 */
  subscribe(runId: string, listener: (event: WorkflowRuntimeEvent) => void): () => void {
    return this.runtime.subscribe(runId, listener);
  }
}
