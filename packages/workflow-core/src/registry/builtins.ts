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
  }
}
