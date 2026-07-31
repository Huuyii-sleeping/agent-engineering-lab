import type { BuiltinNodeConfigMap, BuiltinNodeType, WorkflowNode } from "../contracts/nodes.js";
import type { NodePort, NodePorts } from "../contracts/primitives.js";
import type { WorkflowDiagnostic } from "../contracts/diagnostics.js";
import type { NodeDefinition, NodeDefinitionRegistry } from "./types.js";

const input = (id: string, name: string, dataType: NodePort["dataType"] = "any", required = false): NodePort => ({
  id,
  name,
  direction: "input",
  dataType,
  required,
});

const output = (id: string, name: string, dataType: NodePort["dataType"] = "any"): NodePort => ({
  id,
  name,
  direction: "output",
  dataType,
});

const noDiagnostics = (): WorkflowDiagnostic[] => [];
const DAY_MS = 24 * 60 * 60 * 1_000;

const emptySubgraph = (id: string) => ({ id, nodes: [], edges: [], inputs: [], outputs: [] });

function requiredText(nodeId: string, field: string, value: string, label: string): WorkflowDiagnostic[] {
  return value.trim()
    ? []
    : [{
        code: "node.required-field",
        severity: "error",
        message: `${label}不能为空。`,
        location: { kind: "field", nodeId, fieldPath: [field] },
      }];
}

function numberRange(
  nodeId: string,
  field: string,
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): WorkflowDiagnostic[] {
  return Number.isInteger(value) && value >= minimum && value <= maximum
    ? []
    : [{
        code: "node.invalid-range",
        severity: "error",
        message: `${label}必须为 ${minimum} 到 ${maximum} 之间的整数。`,
        location: { kind: "field", nodeId, fieldPath: [field] },
      }];
}

function uniqueIds(nodeId: string, field: string, values: readonly { id: string }[], label: string): WorkflowDiagnostic[] {
  const ids = values.map((item) => item.id.trim());
  if (ids.length === new Set(ids).size && ids.every(Boolean)) return [];
  return [{
    code: "node.duplicate-id",
    severity: "error",
    message: `${label} id 必须非空且唯一。`,
    location: { kind: "field", nodeId, fieldPath: [field] },
  }];
}

const definitions: { [T in BuiltinNodeType]: NodeDefinition<T> } = {
  start: {
    type: "start",
    version: 1,
    category: "input-output",
    label: "开始",
    description: "声明工作流输入并启动流程",
    icon: "Play",
    color: "#22c55e",
    inspectorId: "start",
    executor: { id: "workflow.start", version: 1 },
    configSchema: { type: "object", required: ["inputs"], properties: { inputs: { type: "array" } } },
    createDefaultConfig: () => ({ inputs: [] }),
    createPorts: (config) => ({
      inputs: [],
      outputs: [
        output("out", "下一步", "any"),
        ...config.inputs.map((field) => output(`input:${field.id}`, field.name, field.dataType)),
      ],
    }),
    validate: noDiagnostics,
  },
  end: {
    type: "end",
    version: 1,
    category: "input-output",
    label: "结束",
    description: "收集并返回工作流输出",
    icon: "Flag",
    color: "#94a3b8",
    inspectorId: "end",
    executor: { id: "workflow.end", version: 1 },
    configSchema: { type: "object", required: ["outputs"], properties: { outputs: { type: "array" } } },
    createDefaultConfig: () => ({ outputs: [] }),
    createPorts: () => ({ inputs: [input("in", "输入", "any", true)], outputs: [] }),
    validate: noDiagnostics,
  },
  llm: {
    type: "llm",
    version: 1,
    category: "ai",
    label: "LLM",
    description: "调用大语言模型生成结构化结果",
    icon: "Sparkles",
    color: "#8b5cf6",
    inspectorId: "llm",
    executor: { id: "workflow.llm", version: 1 },
    configSchema: { type: "object", required: ["model", "prompt"] },
    createDefaultConfig: () => ({ model: "gpt-4o", prompt: { kind: "literal", value: "" }, temperature: 0.7 }),
    createPorts: () => ({ inputs: [input("in", "上下文")], outputs: [output("text", "文本", "string"), output("usage", "用量", "object")] }),
    validate: (config, nodeId) => requiredText(nodeId, "model", config.model, "模型"),
  },
  tool: {
    type: "tool",
    version: 1,
    category: "integration",
    label: "工具",
    description: "调用已注册工具",
    icon: "Wrench",
    color: "#06b6d4",
    inspectorId: "tool",
    executor: { id: "workflow.tool", version: 1 },
    configSchema: { type: "object", required: ["toolId", "arguments"] },
    createDefaultConfig: () => ({ toolId: "", arguments: {} }),
    createPorts: () => ({ inputs: [input("in", "输入")], outputs: [output("result", "结果")] }),
    validate: (config, nodeId) => requiredText(nodeId, "toolId", config.toolId, "工具"),
  },
  http: {
    type: "http",
    version: 1,
    category: "integration",
    label: "HTTP 请求",
    description: "调用受出站策略保护的 HTTP API",
    icon: "Globe2",
    color: "#0ea5e9",
    inspectorId: "http",
    executor: { id: "workflow.http", version: 1 },
    configSchema: { type: "object", required: ["method", "url", "headers", "timeoutMs"] },
    createDefaultConfig: () => ({ method: "GET", url: { kind: "literal", value: "" }, headers: {}, timeoutMs: 30_000 }),
    createPorts: () => ({ inputs: [input("in", "输入")], outputs: [output("body", "响应体"), output("status", "状态码", "integer"), output("headers", "响应头", "object")] }),
    validate: noDiagnostics,
  },
  code: {
    type: "code",
    version: 1,
    category: "transform",
    label: "代码",
    description: "在受限沙箱中执行代码",
    icon: "Code2",
    color: "#3b82f6",
    inspectorId: "code",
    executor: { id: "workflow.code", version: 1 },
    configSchema: { type: "object", required: ["language", "source", "inputs"] },
    createDefaultConfig: () => ({ language: "javascript", source: "return input;", inputs: {} }),
    createPorts: () => ({ inputs: [input("in", "输入")], outputs: [output("result", "结果")] }),
    validate: (config, nodeId) => requiredText(nodeId, "source", config.source, "代码"),
  },
  condition: {
    type: "condition",
    version: 1,
    category: "logic",
    label: "条件分支",
    description: "按条件将流程路由到不同分支",
    icon: "GitBranch",
    color: "#f59e0b",
    inspectorId: "condition",
    executor: { id: "workflow.condition", version: 1 },
    configSchema: { type: "object", required: ["expression", "cases"] },
    createDefaultConfig: () => ({ expression: "value > 0", cases: [{ id: "true", label: "是", expression: "true" }, { id: "false", label: "否", expression: "false" }] }),
    createPorts: (config) => ({ inputs: [input("in", "待判断数据", "any", true)], outputs: config.cases.map((item) => output(item.id, item.label)) }),
    validate: (config, nodeId) => requiredText(nodeId, "expression", config.expression, "条件表达式"),
  },
  template: {
    type: "template",
    version: 1,
    category: "transform",
    label: "模板转换",
    description: "用模板组合上游变量",
    icon: "Braces",
    color: "#14b8a6",
    inspectorId: "template",
    executor: { id: "workflow.template", version: 1 },
    configSchema: { type: "object", required: ["template", "variables"] },
    createDefaultConfig: () => ({ template: "", variables: {} }),
    createPorts: () => ({ inputs: [input("in", "输入")], outputs: [output("text", "文本", "string")] }),
    validate: (config, nodeId) => requiredText(nodeId, "template", config.template, "模板"),
  },
  variable: {
    type: "variable",
    version: 1,
    category: "transform",
    label: "变量",
    description: "赋值或聚合流程变量",
    icon: "Variable",
    color: "#ec4899",
    inspectorId: "variable",
    executor: { id: "workflow.variable", version: 1 },
    configSchema: { type: "object", required: ["assignments"] },
    createDefaultConfig: () => ({ assignments: [] }),
    createPorts: (config) => ({ inputs: [input("in", "输入")], outputs: config.assignments.length > 0 ? config.assignments.map((item) => output(item.key, item.key)) : [output("result", "变量集合", "object")] }),
    validate: noDiagnostics,
  },
  knowledge: {
    type: "knowledge",
    version: 1,
    category: "knowledge",
    label: "知识检索",
    description: "从知识库召回相关内容",
    icon: "BookOpenText",
    color: "#a855f7",
    inspectorId: "knowledge",
    executor: { id: "workflow.knowledge", version: 1 },
    configSchema: { type: "object", required: ["knowledgeBaseId", "query", "topK"] },
    createDefaultConfig: () => ({ knowledgeBaseId: "", query: { kind: "literal", value: "" }, topK: 5 }),
    createPorts: () => ({ inputs: [input("in", "查询上下文")], outputs: [output("documents", "文档", "array"), output("text", "合并文本", "string")] }),
    validate: (config, nodeId) => requiredText(nodeId, "knowledgeBaseId", config.knowledgeBaseId, "知识库"),
  },
  parallel: {
    type: "parallel",
    version: 1,
    category: "control",
    label: "并行",
    description: "以受限并发执行静态分支",
    icon: "GitFork",
    color: "#f97316",
    inspectorId: "parallel",
    executor: { id: "workflow.parallel", version: 1 },
    configSchema: {
      type: "object",
      required: ["branches", "maxConcurrency", "failurePolicy"],
      properties: {
        branches: { type: "array", items: { type: "object", required: ["id", "label"] } },
        maxConcurrency: { type: "integer", minimum: 1, maximum: 10 },
        failurePolicy: { type: "string", enum: ["fail-fast", "collect"] },
      },
    },
    createDefaultConfig: () => ({
      branches: [{ id: "branch-1", label: "分支 1" }, { id: "branch-2", label: "分支 2" }],
      maxConcurrency: 2,
      failurePolicy: "fail-fast",
    }),
    createPorts: (config) => ({
      inputs: [input("in", "输入", "any", true)],
      outputs: config.branches.map((branch) => output(branch.id, branch.label)),
    }),
    validate: (config, nodeId) => [
      ...(config.branches.length >= 2 ? [] : [{
        code: "node.parallel.branches",
        severity: "error" as const,
        message: "Parallel 至少需要两个分支。",
        location: { kind: "field" as const, nodeId, fieldPath: ["branches"] },
      }]),
      ...uniqueIds(nodeId, "branches", config.branches, "Parallel 分支"),
      ...numberRange(nodeId, "maxConcurrency", config.maxConcurrency, 1, 10, "最大并发度"),
    ],
  },
  merge: {
    type: "merge",
    version: 1,
    category: "control",
    label: "聚合",
    description: "确定性聚合对应 Parallel 的分支结果",
    icon: "GitMerge",
    color: "#fb923c",
    inspectorId: "merge",
    executor: { id: "workflow.merge", version: 1 },
    configSchema: {
      type: "object",
      required: ["parallelNodeId", "strategy", "allowMissing"],
      properties: {
        parallelNodeId: { type: "string" },
        strategy: { type: "string", enum: ["ordered", "by-branch"] },
        allowMissing: { type: "boolean" },
      },
    },
    createDefaultConfig: () => ({ parallelNodeId: "", strategy: "ordered", allowMissing: false }),
    createPorts: () => ({
      inputs: [{ ...input("branches", "分支结果", "any", true), multiple: true }],
      outputs: [output("result", "聚合结果", "object")],
    }),
    validate: (config, nodeId) => requiredText(nodeId, "parallelNodeId", config.parallelNodeId, "Parallel 节点"),
  },
  iteration: {
    type: "iteration",
    version: 1,
    category: "container",
    label: "迭代",
    description: "对数组元素受限并发执行统一子图",
    icon: "ListRestart",
    color: "#6366f1",
    inspectorId: "iteration",
    executor: { id: "workflow.iteration", version: 1 },
    configSchema: {
      type: "object",
      required: ["items", "maxItems", "maxConcurrency", "itemTimeoutMs", "timeoutMs", "failurePolicy", "aggregation", "inputBindings", "body"],
      properties: {
        items: { type: "object" },
        maxItems: { type: "integer", minimum: 1, maximum: 1_000 },
        maxConcurrency: { type: "integer", minimum: 1, maximum: 10 },
        itemTimeoutMs: { type: "integer", minimum: 1 },
        timeoutMs: { type: "integer", minimum: 1, maximum: DAY_MS },
        failurePolicy: { type: "string", enum: ["fail-fast", "continue", "collect-errors"] },
        aggregation: { type: "string", enum: ["ordered", "by-index"] },
        inputBindings: { type: "array" },
        body: { type: "object" },
      },
    },
    createDefaultConfig: () => ({
      items: { kind: "literal", value: [] },
      maxItems: 1_000,
      maxConcurrency: 1,
      itemTimeoutMs: 30_000,
      timeoutMs: DAY_MS,
      failurePolicy: "fail-fast",
      aggregation: "ordered",
      inputBindings: [],
      body: emptySubgraph("iteration-body"),
    }),
    createPorts: (config) => ({
      inputs: [input("items", "数组", "array", true), ...config.body.inputs.map((field) => input(`input:${field.id}`, field.name, field.dataType, field.required))],
      outputs: [output("results", "迭代结果", "array"), ...config.body.outputs.map((field) => output(`output:${field.id}`, field.name, field.dataType))],
    }),
    validate: (config, nodeId) => [
      ...requiredText(nodeId, "body.id", config.body.id, "子图 id"),
      ...numberRange(nodeId, "maxItems", config.maxItems, 1, 1_000, "最大元素数"),
      ...numberRange(nodeId, "maxConcurrency", config.maxConcurrency, 1, 10, "最大并发度"),
      ...numberRange(nodeId, "itemTimeoutMs", config.itemTimeoutMs, 1, DAY_MS, "单项超时"),
      ...numberRange(nodeId, "timeoutMs", config.timeoutMs, 1, DAY_MS, "整体超时"),
    ],
  },
  loop: {
    type: "loop",
    version: 1,
    category: "container",
    label: "循环",
    description: "按 while 或 until 条件受限重复执行子图",
    icon: "Repeat2",
    color: "#4f46e5",
    inspectorId: "loop",
    executor: { id: "workflow.loop", version: 1 },
    configSchema: {
      type: "object",
      required: ["mode", "condition", "initialVariables", "maxIterations", "timeoutMs", "inputBindings", "body"],
      properties: {
        mode: { type: "string", enum: ["while", "until"] },
        condition: { type: "string" },
        initialVariables: { type: "array" },
        maxIterations: { type: "integer", minimum: 1, maximum: 1_000 },
        timeoutMs: { type: "integer", minimum: 1, maximum: DAY_MS },
        inputBindings: { type: "array" },
        body: { type: "object" },
      },
    },
    createDefaultConfig: () => ({
      mode: "while",
      condition: "true",
      initialVariables: [],
      maxIterations: 100,
      timeoutMs: DAY_MS,
      inputBindings: [],
      body: emptySubgraph("loop-body"),
    }),
    createPorts: (config) => ({
      inputs: [input("in", "输入"), ...config.body.inputs.map((field) => input(`input:${field.id}`, field.name, field.dataType, field.required))],
      outputs: config.body.outputs.length > 0
        ? config.body.outputs.map((field) => output(`output:${field.id}`, field.name, field.dataType))
        : [output("result", "循环结果")],
    }),
    validate: (config, nodeId) => [
      ...requiredText(nodeId, "condition", config.condition, "循环条件"),
      ...requiredText(nodeId, "body.id", config.body.id, "子图 id"),
      ...uniqueIds(nodeId, "initialVariables", config.initialVariables, "循环变量"),
      ...numberRange(nodeId, "maxIterations", config.maxIterations, 1, 1_000, "最大循环次数"),
      ...numberRange(nodeId, "timeoutMs", config.timeoutMs, 1, DAY_MS, "循环总时长"),
    ],
  },
  subworkflow: {
    type: "subworkflow",
    version: 1,
    category: "container",
    label: "子流程",
    description: "执行固定不可变版本的嵌套 Workflow",
    icon: "Workflow",
    color: "#0f766e",
    inspectorId: "subworkflow",
    executor: { id: "workflow.subworkflow", version: 1 },
    configSchema: {
      type: "object",
      required: ["workflowId", "versionId", "contentHash", "inputBindings", "outputBindings"],
      properties: {
        workflowId: { type: "string" },
        versionId: { type: "string" },
        contentHash: { type: "string" },
        inputBindings: { type: "array" },
        outputBindings: { type: "array" },
      },
    },
    createDefaultConfig: () => ({ workflowId: "", versionId: "", contentHash: "", inputBindings: [], outputBindings: [] }),
    createPorts: (config) => ({
      inputs: config.inputBindings.length > 0
        ? config.inputBindings.map((binding) => input(`input:${binding.inputId}`, binding.inputId))
        : [input("in", "输入")],
      outputs: config.outputBindings.length > 0
        ? config.outputBindings.map((binding) => output(`output:${binding.outputId}`, binding.name, binding.dataType))
        : [output("result", "子流程结果")],
    }),
    validate: (config, nodeId) => [
      ...requiredText(nodeId, "workflowId", config.workflowId, "Workflow"),
      ...requiredText(nodeId, "versionId", config.versionId, "Workflow 版本"),
      ...requiredText(nodeId, "contentHash", config.contentHash, "内容哈希"),
    ],
  },
  agent: {
    type: "agent",
    version: 1,
    category: "ai",
    label: "Agent",
    description: "通过 AgentRuntimePort 执行固定发布版本",
    icon: "Bot",
    color: "#7c3aed",
    inspectorId: "agent",
    executor: { id: "workflow.agent", version: 1 },
    configSchema: {
      type: "object",
      required: ["agentProfileId", "agentVersionId", "inputBindings", "outputSchema", "memory"],
      properties: {
        agentProfileId: { type: "string" },
        agentVersionId: { type: "string" },
        inputBindings: { type: "object" },
        outputSchema: { type: "object" },
        memory: { type: "object" },
      },
    },
    createDefaultConfig: () => ({
      agentProfileId: "",
      agentVersionId: "",
      inputBindings: {},
      outputSchema: { type: "object" },
      memory: { isolation: "node-run", shareThread: false },
    }),
    createPorts: () => ({ inputs: [input("in", "输入")], outputs: [output("result", "Agent 输出", "object")] }),
    validate: (config, nodeId) => [
      ...requiredText(nodeId, "agentProfileId", config.agentProfileId, "Agent profile"),
      ...requiredText(nodeId, "agentVersionId", config.agentVersionId, "Agent 版本"),
    ],
  },
  "human-approval": {
    type: "human-approval",
    version: 1,
    category: "human",
    label: "人工审批",
    description: "暂停当前 Workflow，并在当前运行上下文等待人工决定",
    icon: "UserCheck",
    color: "#be123c",
    inspectorId: "human-approval",
    executor: { id: "workflow.human-approval", version: 1 },
    configSchema: {
      type: "object",
      required: ["policyId", "displayFields", "decisionSchema", "deadlineMs", "timeoutPolicy"],
      properties: {
        policyId: { type: "string" },
        displayFields: { type: "array" },
        decisionSchema: { type: "object" },
        deadlineMs: { type: "integer", minimum: 1, maximum: 30 * DAY_MS },
        timeoutPolicy: { type: "string", enum: ["reject", "fail", "error-route"] },
      },
    },
    createDefaultConfig: () => ({
      policyId: "",
      displayFields: [],
      decisionSchema: { type: "object" },
      deadlineMs: 7 * DAY_MS,
      timeoutPolicy: "fail",
    }),
    createPorts: () => ({
      inputs: [input("in", "审批内容", "object", true)],
      outputs: [output("approved", "已批准", "object"), output("rejected", "已拒绝", "object"), output("error", "审批异常", "object")],
    }),
    validate: (config, nodeId) => [
      ...requiredText(nodeId, "policyId", config.policyId, "审批策略"),
      ...uniqueIds(nodeId, "displayFields", config.displayFields, "展示字段"),
      ...numberRange(nodeId, "deadlineMs", config.deadlineMs, 1, 30 * DAY_MS, "审批期限"),
    ],
  },
};

/** 读取一个内置节点定义。 */
export function getBuiltinNodeDefinition<T extends BuiltinNodeType>(type: T): NodeDefinition<T> {
  return definitions[type];
}

/** 创建只读内置节点注册表。 */
export function createBuiltinNodeRegistry(): NodeDefinitionRegistry {
  return {
    get<T extends BuiltinNodeType>(type: T) {
      return definitions[type] as NodeDefinition<T> | undefined;
    },
    has(type: string): type is BuiltinNodeType {
      return Object.prototype.hasOwnProperty.call(definitions, type);
    },
    list() {
      return Object.values(definitions);
    },
  };
}

/** workflow-core 默认的内置节点注册表。 */
export const builtinNodeRegistry = createBuiltinNodeRegistry();

/** 根据节点配置重新计算端口。 */
export function createNodePorts<T extends BuiltinNodeType>(type: T, config: BuiltinNodeConfigMap[T]): NodePorts {
  return definitions[type].createPorts(config);
}

/** 按当前配置重新计算内置节点端口。 */
export function refreshNodePorts(node: WorkflowNode): WorkflowNode {
  if (node.kind === "unknown") return node;
  switch (node.type) {
    case "start": return { ...node, ports: definitions.start.createPorts(node.config) };
    case "end": return { ...node, ports: definitions.end.createPorts(node.config) };
    case "llm": return { ...node, ports: definitions.llm.createPorts(node.config) };
    case "tool": return { ...node, ports: definitions.tool.createPorts(node.config) };
    case "http": return { ...node, ports: definitions.http.createPorts(node.config) };
    case "code": return { ...node, ports: definitions.code.createPorts(node.config) };
    case "condition": return { ...node, ports: definitions.condition.createPorts(node.config) };
    case "template": return { ...node, ports: definitions.template.createPorts(node.config) };
    case "variable": return { ...node, ports: definitions.variable.createPorts(node.config) };
    case "knowledge": return { ...node, ports: definitions.knowledge.createPorts(node.config) };
    case "parallel": return { ...node, ports: definitions.parallel.createPorts(node.config) };
    case "merge": return { ...node, ports: definitions.merge.createPorts(node.config) };
    case "iteration": return { ...node, ports: definitions.iteration.createPorts(node.config) };
    case "loop": return { ...node, ports: definitions.loop.createPorts(node.config) };
    case "subworkflow": return { ...node, ports: definitions.subworkflow.createPorts(node.config) };
    case "agent": return { ...node, ports: definitions.agent.createPorts(node.config) };
    case "human-approval": return { ...node, ports: definitions["human-approval"].createPorts(node.config) };
  }
}

/** 使用节点注册定义执行静态配置校验。 */
export function validateNodeConfig(node: WorkflowNode): WorkflowDiagnostic[] {
  if (node.kind === "unknown") return [{ code: "node.unsupported", severity: "error", message: `节点类型 ${node.type} 当前不可用。`, location: { kind: "node", nodeId: node.id } }];
  switch (node.type) {
    case "start": return definitions.start.validate(node.config, node.id);
    case "end": return definitions.end.validate(node.config, node.id);
    case "llm": return definitions.llm.validate(node.config, node.id);
    case "tool": return definitions.tool.validate(node.config, node.id);
    case "http": return definitions.http.validate(node.config, node.id);
    case "code": return definitions.code.validate(node.config, node.id);
    case "condition": return definitions.condition.validate(node.config, node.id);
    case "template": return definitions.template.validate(node.config, node.id);
    case "variable": return definitions.variable.validate(node.config, node.id);
    case "knowledge": return definitions.knowledge.validate(node.config, node.id);
    case "parallel": return definitions.parallel.validate(node.config, node.id);
    case "merge": return definitions.merge.validate(node.config, node.id);
    case "iteration": return definitions.iteration.validate(node.config, node.id);
    case "loop": return definitions.loop.validate(node.config, node.id);
    case "subworkflow": return definitions.subworkflow.validate(node.config, node.id);
    case "agent": return definitions.agent.validate(node.config, node.id);
    case "human-approval": return definitions["human-approval"].validate(node.config, node.id);
  }
}
