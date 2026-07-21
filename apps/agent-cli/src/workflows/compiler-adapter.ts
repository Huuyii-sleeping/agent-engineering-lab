import { compileWorkflow, type CompileWorkflowOptions, type WorkflowIR } from "@orbit/workflow-core";

/** Agent runtime 的共享编译器薄适配；不复制编译规则。 */
export function compileWorkflowForRuntime(value: unknown, options: CompileWorkflowOptions = {}): WorkflowIR {
  const result = compileWorkflow(value, options);
  if (!result.ok) {
    const message = result.diagnostics.map((item) => `[${item.code}] ${item.message}`).join("\n");
    throw new Error(`工作流编译失败：\n${message}`);
  }
  return result.ir;
}
