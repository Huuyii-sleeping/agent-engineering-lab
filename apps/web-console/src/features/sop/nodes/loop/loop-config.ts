import type { LoopInitialVariable, LoopNodeConfig, WorkflowDataType } from "@orbit/workflow-core";

const loopVariableId = () => `loop-variable-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`}`;

/** 为类型生成合法且最小的初始字面量。 */
export function defaultLoopVariableValue(dataType: WorkflowDataType): unknown {
  if (dataType === "array") return [];
  if (dataType === "object") return {};
  if (dataType === "boolean") return false;
  if (dataType === "number" || dataType === "integer") return 0;
  if (dataType === "null") return null;
  return "";
}

/** 追加带稳定 id 的 Loop 初始变量。 */
export function appendLoopVariable(config: LoopNodeConfig, createId: () => string = loopVariableId): LoopNodeConfig {
  let id = createId();
  while (config.initialVariables.some((variable) => variable.id === id)) id = createId();
  const variable: LoopInitialVariable = { id, name: `变量 ${config.initialVariables.length + 1}`, dataType: "string", value: { kind: "literal", value: "" } };
  return { ...config, initialVariables: [...config.initialVariables, variable] };
}
