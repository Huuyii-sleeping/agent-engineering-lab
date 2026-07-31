import type { ToolServiceLike } from "../../tools/service.js";
import type { WorkflowSecretProvider } from "../context.js";
import { WorkflowExecutorRegistry } from "../executor-registry.js";
import { createBasicWorkflowExecutors, type WorkflowKnowledgeService } from "./basic.js";
import { CodeWorkflowExecutor, type WorkflowCodeRunner } from "./code.js";
import { HttpWorkflowExecutor, type WorkflowHttpClient } from "./http.js";
import { HumanApprovalWorkflowExecutor } from "./human-approval.js";
import { LlmWorkflowExecutor, type WorkflowLlmService } from "./llm.js";
import { ToolWorkflowExecutor } from "./tool.js";

/** 内置工作流执行器依赖。 */
export type BuiltinWorkflowExecutorDependencies = {
  llmService?: WorkflowLlmService;
  toolService?: Pick<ToolServiceLike, "runToolByName">;
  httpClient?: WorkflowHttpClient;
  codeRunner?: WorkflowCodeRunner;
  knowledgeService?: WorkflowKnowledgeService;
  secretProvider?: WorkflowSecretProvider;
};

/** 创建 Runtime MVP 的内置 executor registry。 */
export function createBuiltinWorkflowExecutorRegistry(dependencies: BuiltinWorkflowExecutorDependencies = {}): WorkflowExecutorRegistry {
  const registry = new WorkflowExecutorRegistry();
  createBasicWorkflowExecutors(dependencies.knowledgeService).forEach((executor) => registry.register(executor));
  if (dependencies.llmService) registry.register(new LlmWorkflowExecutor(dependencies.llmService));
  if (dependencies.toolService) registry.register(new ToolWorkflowExecutor(dependencies.toolService));
  registry.register(new HumanApprovalWorkflowExecutor());
  registry.register(new HttpWorkflowExecutor(dependencies.httpClient));
  registry.register(new CodeWorkflowExecutor(dependencies.codeRunner));
  return registry;
}
