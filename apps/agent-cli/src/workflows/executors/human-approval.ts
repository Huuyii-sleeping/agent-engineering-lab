import { createHash } from "node:crypto";
import type {
  ApprovalDisplayValue,
  HumanApprovalDisplayField,
  WorkflowIRHumanApprovalNode,
} from "@orbit/workflow-core";
import type {
  WorkflowExecutorContext,
  WorkflowExecutorResult,
  WorkflowNodeExecutor,
} from "../executor-registry.js";

const SENSITIVE_FIELD = /(?:api[-_ ]?key|authorization|cookie|credential|password|secret|token)/i;

function interruptId(context: WorkflowExecutorContext): string {
  const identity = JSON.stringify([
    context.runId,
    context.workflowVersionId ?? null,
    context.node.id,
    context.nodeInstanceId ?? context.node.id,
    context.attempt,
  ]);
  return `interrupt_${createHash("sha256").update(identity).digest("hex").slice(0, 32)}`;
}

function redactValue(field: HumanApprovalDisplayField, value: unknown): unknown {
  if (SENSITIVE_FIELD.test(`${field.id} ${field.label}`)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => redactNested(item));
  return redactNested(value);
}

function redactNested(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SENSITIVE_FIELD.test(key) ? "[REDACTED]" : redactNested(item),
  ]));
}

async function displayFields(
  fields: HumanApprovalDisplayField[],
  context: WorkflowExecutorContext,
): Promise<ApprovalDisplayValue[]> {
  return Promise.all(fields.map(async (field) => {
    const value = field.value.kind === "literal"
      ? field.value.value
      : await context.variables.resolve(field.value.ref);
    return { id: field.id, label: field.label, value: redactValue(field, value) };
  }));
}

function resumeResult(value: unknown, node: WorkflowIRHumanApprovalNode): WorkflowExecutorResult {
  const decision = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const decisionInterruptId = typeof decision.interruptId === "string"
    ? decision.interruptId
    : typeof decision.approvalRequestId === "string" ? decision.approvalRequestId : undefined;
  if (!decisionInterruptId) {
    throw Object.assign(new Error("Human Approval resume data 无效。"), { code: "APPROVAL_RESUME_INVALID" });
  }
  if (decision.action === "timeout") {
    if (node.suspend.timeoutPolicy === "fail") {
      throw Object.assign(new Error("Human Approval 已超时。"), { code: "APPROVAL_TIMEOUT" });
    }
    const portId = node.suspend.timeoutPolicy === "reject" ? "rejected" : "error";
    const output = { interruptId: decisionInterruptId, action: "timeout", data: decision.data ?? {}, timedOut: true };
    return { outputs: { [portId]: output }, selectedPortIds: [portId] };
  }
  const portId = decision.action === "approve" ? "approved" : decision.action === "reject" ? "rejected" : undefined;
  if (!portId) throw Object.assign(new Error("Human Approval resume data 无效。"), { code: "APPROVAL_RESUME_INVALID" });
  const output = { interruptId: decisionInterruptId, action: decision.action, data: decision.data ?? {} };
  return { outputs: { [portId]: output }, selectedPortIds: [portId] };
}

/** 将 Human Approval 映射为当前 Mastra run 的 suspend/resume interrupt。 */
export class HumanApprovalWorkflowExecutor implements WorkflowNodeExecutor {
  readonly identity = { id: "workflow.human-approval", version: 1 } as const;
  private readonly now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now;
  }

  async execute(context: WorkflowExecutorContext): Promise<WorkflowExecutorResult> {
    if (context.node.kind !== "human-approval") {
      throw new Error(`Human Approval executor 收到不支持的节点 ${context.node.type}。`);
    }
    const node = context.node as WorkflowIRHumanApprovalNode;
    if (context.resumeData !== undefined) return resumeResult(context.resumeData, node);
    if (!context.nativeRunId) {
      throw Object.assign(new Error("Human Approval 缺少 Mastra native run identity。"), {
        code: "APPROVAL_IDENTITY_CONFLICT",
      });
    }
    const waitingInterruptId = interruptId(context);
    const createdAt = this.now();
    const redactedDisplayFields = await displayFields(node.suspend.displayFields, context);
    return {
      outputs: {},
      suspend: {
        reason: "Human approval pending",
        payload: {
          kind: "approval",
          reason: "Human approval pending",
          interruptId: waitingInterruptId,
          approvalRequestId: waitingInterruptId,
          deadline: createdAt + node.suspend.deadlineMs,
          displayFields: redactedDisplayFields,
          decisionSchema: node.suspend.decisionSchema,
          timeoutPolicy: node.suspend.timeoutPolicy,
        },
      },
    };
  }
}
