import { Script, createContext } from "node:vm";
import type {
  ConditionNodeConfig,
  EndNodeConfig,
  KnowledgeNodeConfig,
  StartNodeConfig,
  TemplateNodeConfig,
  VariableNodeConfig,
} from "@orbit/workflow-core";
import type { WorkflowNodeExecutor } from "../executor-registry.js";

function expressionContext(inputs: Record<string, unknown>): Record<string, unknown> {
  const values = Object.values(inputs);
  return { ...inputs, input: inputs, value: inputs.value ?? inputs.in ?? values[0] };
}

function evaluateExpression(expression: string, inputs: Record<string, unknown>): unknown {
  const context = createContext(expressionContext(inputs), { codeGeneration: { strings: false, wasm: false } });
  return new Script(`Boolean(${expression})`).runInContext(context, { timeout: 50 });
}

/** 可选知识检索边界。 */
export type WorkflowKnowledgeService = {
  search(input: { knowledgeBaseId: string; query: string; topK: number; signal: AbortSignal }): Promise<{ documents: unknown[]; text: string }>;
};

/** 创建 Start/End/Template/Variable/Condition/Knowledge 基础执行器。 */
export function createBasicWorkflowExecutors(knowledgeService?: WorkflowKnowledgeService): WorkflowNodeExecutor[] {
  return [
    {
      identity: { id: "workflow.start", version: 1 },
      async execute(context) {
        const config = context.node.config as StartNodeConfig;
        const outputs: Record<string, unknown> = { out: context.inputs };
        for (const field of config.inputs) outputs[`input:${field.id}`] = await context.variables.resolve({ scope: "workflow-input", inputId: field.id });
        return { outputs };
      },
    },
    {
      identity: { id: "workflow.end", version: 1 },
      async execute(context) {
        const config = context.node.config as EndNodeConfig;
        const outputs: Record<string, unknown> = {};
        for (const item of config.outputs) outputs[item.id] = item.value ? await context.variables.resolve(item.value) : context.inputs[item.id] ?? context.inputs.in;
        if (config.outputs.length === 0) Object.assign(outputs, context.inputs);
        return { outputs };
      },
    },
    {
      identity: { id: "workflow.template", version: 1 },
      async execute(context) {
        const config = context.node.config as TemplateNodeConfig;
        const variables = await context.variables.resolveValue(config.variables) as Record<string, unknown>;
        const text = config.template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key: string) => String(variables[key] ?? ""));
        return { outputs: { text } };
      },
    },
    {
      identity: { id: "workflow.variable", version: 1 },
      async execute(context) {
        const config = context.node.config as VariableNodeConfig;
        const outputs: Record<string, unknown> = {};
        for (const assignment of config.assignments) outputs[assignment.key] = await context.variables.resolveValue(assignment.value);
        if (config.assignments.length === 0) outputs.result = context.inputs;
        return { outputs };
      },
    },
    {
      identity: { id: "workflow.condition", version: 1 },
      async execute(context) {
        const config = context.node.config as ConditionNodeConfig;
        const selected = config.cases.find((item) => Boolean(evaluateExpression(item.expression, context.inputs)));
        if (!selected) throw new Error(`条件节点 ${context.node.id} 没有命中任何分支。`);
        return { outputs: { selected: selected.id, value: evaluateExpression(config.expression, context.inputs) }, selectedPortIds: [selected.id] };
      },
    },
    {
      identity: { id: "workflow.knowledge", version: 1 },
      async execute(context) {
        if (!knowledgeService) throw new Error("Knowledge executor 未配置知识检索服务。 ");
        const config = context.node.config as KnowledgeNodeConfig;
        const query = String(await context.variables.resolveValue(config.query) ?? "");
        const result = await knowledgeService.search({ knowledgeBaseId: config.knowledgeBaseId, query, topK: config.topK, signal: context.signal });
        return { outputs: { documents: result.documents, text: result.text } };
      },
    },
  ];
}
