import type { ValueOrVariable, VariableRef, WorkflowDataType } from "@orbit/workflow-core";

/** Secret 值读取边界；工作流定义中只保存引用。 */
export type WorkflowSecretProvider = {
  read(credentialId: string, key?: string): Promise<unknown>;
};

function getPath(value: unknown, path: string[] | undefined): unknown {
  let current = value;
  for (const key of path ?? []) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** 验证 runtime 输出是否符合端口声明类型。 */
export function assertWorkflowValueType(label: string, type: WorkflowDataType, value: unknown): void {
  if (type === "any") return;
  const valid = type === "array" ? Array.isArray(value)
    : type === "object" ? Boolean(value) && typeof value === "object" && !Array.isArray(value)
      : type === "integer" ? typeof value === "number" && Number.isInteger(value)
        : type === "number" ? typeof value === "number" && Number.isFinite(value)
          : type === "null" ? value === null
            : type === "binary" ? value instanceof Uint8Array
              : typeof value === type;
  if (!valid) throw new TypeError(`${label} 应为 ${type}，实际为 ${Array.isArray(value) ? "array" : typeof value}。`);
}

/** 单次运行的显式变量上下文。 */
export class WorkflowVariableContext {
  private readonly nodeOutputs = new Map<string, Record<string, unknown>>();

  constructor(private readonly options: {
    inputs: Record<string, unknown>;
    system?: Record<string, unknown>;
    environment?: Record<string, unknown>;
    secretProvider?: WorkflowSecretProvider;
    containers?: Record<string, {
      inputs: Record<string, unknown>;
      item?: unknown;
      index?: number;
      iteration?: number;
      startedAt?: number;
      variables?: Record<string, unknown>;
      previousOutputs?: Record<string, unknown>;
    }>;
  }) {}

  setNodeOutput(nodeId: string, output: Record<string, unknown>): void {
    this.nodeOutputs.set(nodeId, output);
  }

  getNodeOutput(nodeId: string): Record<string, unknown> | undefined {
    return this.nodeOutputs.get(nodeId);
  }

  async resolve(ref: VariableRef): Promise<unknown> {
    switch (ref.scope) {
      case "workflow-input": return getPath(this.options.inputs[ref.inputId], ref.path);
      case "node-output": return getPath(this.nodeOutputs.get(ref.nodeId)?.[ref.portId], ref.path);
      case "system": return getPath(this.options.system?.[ref.key], ref.path);
      case "environment": return this.options.environment?.[ref.key];
      case "secret": {
        if (!this.options.secretProvider) throw new Error(`未配置 Secret Provider：${ref.credentialId}。`);
        return this.options.secretProvider.read(ref.credentialId, ref.key);
      }
      case "container-input": return getPath(
        this.options.containers?.[ref.containerNodeId]?.inputs[ref.inputId],
        ref.path,
      );
      case "loop": {
        const container = this.options.containers?.[ref.containerNodeId];
        const value = ref.key === "item" ? container?.item
          : ref.key === "index" ? container?.index
            : ref.key === "iteration" ? container?.iteration
              : ref.key === "variable" && ref.variableId ? container?.variables?.[ref.variableId]
                : ref.key === "previous-output" && ref.outputId ? container?.previousOutputs?.[ref.outputId]
                  : undefined;
        return getPath(value, ref.path);
      }
    }
  }

  async resolveValue(value: unknown): Promise<unknown> {
    if (!value || typeof value !== "object") return value;
    const candidate = value as Partial<ValueOrVariable>;
    if (candidate.kind === "literal") return candidate.value;
    if (candidate.kind === "variable" && candidate.ref) return this.resolve(candidate.ref);
    if (Array.isArray(value)) return Promise.all(value.map((item) => this.resolveValue(item)));
    return Object.fromEntries(await Promise.all(Object.entries(value as Record<string, unknown>).map(async ([key, child]) => [key, await this.resolveValue(child)])));
  }
}
