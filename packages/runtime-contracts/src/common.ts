import type { RuntimeEventBase } from "@orbit/workflow-core";

/** 产品运行时后端；完成迁移后唯一为 Mastra。 */
export type RuntimeBackend = "mastra";

/** Runtime Adapter 的稳定版本标识。 */
export type RuntimeAdapterVersion = string;

/** 四个 Runtime Port 共享的非框架错误码。 */
export type RuntimePortErrorCode =
  | "RUNTIME_NOT_FOUND"
  | "RUNTIME_TERMINAL_CONFLICT"
  | "RUNTIME_OWNERSHIP_CONFLICT"
  | "RUNTIME_INPUT_INVALID"
  | "RUNTIME_CAPABILITY_UNSUPPORTED"
  | "RUNTIME_CANCELLED"
  | "TOOL_NOT_FOUND"
  | "TOOL_PERMISSION_DENIED"
  | "TOOL_APPROVAL_REQUIRED"
  | "TOOL_SECURITY_BLOCKED"
  | "TOOL_EXECUTION_FAILED";

/** Runtime Port 向 controller 和 adapter 暴露的结构化错误。 */
export class RuntimePortError extends Error {
  readonly name = "RuntimePortError";

  constructor(
    readonly code: RuntimePortErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Runtime 运行元数据，用于 Mastra ID 映射与诊断。 */
export type RuntimeBinding = {
  backend: RuntimeBackend;
  adapterVersion: RuntimeAdapterVersion;
  nativeRunId?: string;
  runtimeVersion?: string;
  selectionReason?: string;
  verifiedCapabilities?: string[];
};

export type { RuntimeEventBase };
