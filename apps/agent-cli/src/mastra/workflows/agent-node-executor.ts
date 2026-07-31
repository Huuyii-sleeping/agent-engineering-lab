import { createHash } from "node:crypto";
import {
  stableSerialize,
  validateWorkflowJsonSchema,
  type AgentVersion,
  type AgentNodeConfig,
} from "@orbit/workflow-core";
import type {
  AgentRunResult,
  AgentRunSnapshot,
  AgentRuntimePort,
  StreamAgentCommand,
} from "@orbit/runtime-contracts";
import type { WorkflowNodeExecutor } from "../../workflows/executor-registry.js";

type AgentNodeExecutorOptions = {
  runtime: AgentRuntimePort;
  resolveVersion(
    agentProfileId: string,
    agentVersionId: string,
    context: Parameters<WorkflowNodeExecutor["execute"]>[0],
  ): AgentVersion | undefined;
};

function stableId(prefix: string, parts: readonly string[]): string {
  return `${prefix}-${createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 24)}`;
}

function workflowAgentError(code: string, message: string, details?: Record<string, unknown>): Error {
  return Object.assign(new Error(message), { code, details });
}

function safeRequestContext(value: Record<string, unknown> | undefined): Record<string, unknown> {
  const allowed = ["ownerId", "tenantId", "projectId", "traceId", "correlationId"];
  return Object.fromEntries(allowed.flatMap((key) => value?.[key] === undefined ? [] : [[key, value[key]]]));
}

function parseAgentOutput(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const value = JSON.parse(trimmed) as unknown;
      if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    } catch {
      // 非 JSON 文本按默认 text 输出处理，再由发布版本 schema 决定是否合法。
    }
  }
  return { text };
}

function isTerminalAgentRun(run: AgentRunSnapshot | null | undefined): run is AgentRunSnapshot {
  return run?.status === "succeeded" || run?.status === "failed" || run?.status === "cancelled";
}

/** 由父 run、父节点实例和 attempt 派生稳定 Agent child run identity。 */
export function deriveChildAgentRunId(
  parentRunId: string,
  parentNodeInstanceId: string,
  attempt: number,
): string {
  return stableId("agent-child", [parentRunId, parentNodeInstanceId, String(attempt)]);
}

/** 阶段 E Agent 节点通过 AgentRuntimePort 执行固定发布版本。 */
export class MastraWorkflowAgentNodeExecutor implements WorkflowNodeExecutor {
  readonly identity = { id: "workflow.agent", version: 1 } as const;

  constructor(private readonly options: AgentNodeExecutorOptions) {}

  async execute(context: Parameters<WorkflowNodeExecutor["execute"]>[0]) {
    const node = context.node;
    if (node.kind !== "agent") throw new Error(`Agent node executor 收到非 Agent 节点 ${node.id}。`);
    const config = node.config as AgentNodeConfig;
    const version = this.options.resolveVersion(config.agentProfileId, config.agentVersionId, context);
    if (
      !version
      || version.id !== config.agentVersionId
      || version.agentProfileId !== config.agentProfileId
      || version.contentHash !== node.childRun.contentHash
    ) {
      throw workflowAgentError(
        "WORKFLOW_AGENT_VERSION_NOT_FOUND",
        `Agent 节点 ${node.id} 引用的发布版本不存在或 identity 不匹配。`,
        { parentNodeId: node.id, agentProfileId: config.agentProfileId, agentVersionId: config.agentVersionId },
      );
    }
    if (stableSerialize(version.outputSchema) !== stableSerialize(config.outputSchema)) {
      throw workflowAgentError(
        "WORKFLOW_AGENT_OUTPUT_SCHEMA_MISMATCH",
        `Agent 节点 ${node.id} 的输出 schema 与发布版本不一致。`,
        { parentNodeId: node.id, agentVersionId: version.id },
      );
    }
    const ownerId = typeof context.requestContext?.ownerId === "string"
      ? context.requestContext.ownerId.trim()
      : "";
    if (!ownerId) {
      throw workflowAgentError(
        "WORKFLOW_AGENT_OWNER_REQUIRED",
        `Agent 节点 ${node.id} 缺少可信 ownerId。`,
        { parentNodeId: node.id },
      );
    }
    const nodeInstanceId = context.nodeInstanceId ?? node.id;
    const childRunId = deriveChildAgentRunId(context.runId, nodeInstanceId, context.attempt);
    const childIdentity = { ...context.executionIdentity, childRunId };
    const identityParts = [context.runId, nodeInstanceId];
    const inputs = Object.fromEntries(await Promise.all(Object.entries(config.inputBindings).map(async ([key, value]) => (
      [key, await context.variables.resolveValue(value)]
    ))));
    const command: StreamAgentCommand = {
      runId: childRunId,
      agentId: version.agentProfileId,
      agentVersion: version.id,
      sessionId: stableId("workflow-agent-session", identityParts),
      resourceId: stableId("workflow-resource", [ownerId, context.runId]),
      threadId: stableId("workflow-agent-thread", identityParts),
      messages: [
        ...version.instructions.map((content) => ({ role: "system" as const, content })),
        { role: "user", content: stableSerialize(inputs) },
      ],
      requestContext: {
        ...safeRequestContext(context.requestContext),
        ownerId,
        parentWorkflowRunId: context.runId,
        parentWorkflowId: context.workflowId,
        parentNodeId: node.id,
        parentNodeInstanceId: nodeInstanceId,
        childRunId,
        agentVersionContentHash: version.contentHash,
      },
      policy: {
        allowedToolIds: [...version.toolPolicy.allowedToolIds],
        allowedSkillIds: version.skillPolicy.bindings.map((binding) => binding.skillId),
      },
    };
    let final: AgentRunResult | undefined;
    let streamFailure: unknown;
    let cancellation: Promise<AgentRunSnapshot> | undefined;
    const cancelChild = (): Promise<AgentRunSnapshot> => {
      cancellation ??= (async () => {
        let cancelled: AgentRunSnapshot | undefined;
        let cancelFailure: unknown;
        try {
          cancelled = await this.options.runtime.cancel({ runId: childRunId, reason: "parent workflow cancelled" });
        } catch (error) {
          cancelFailure = error;
        }
        const queried = await this.options.runtime.getRun(childRunId);
        const terminal = isTerminalAgentRun(queried) ? queried : isTerminalAgentRun(cancelled) ? cancelled : undefined;
        if (!terminal) {
          throw workflowAgentError(
            "WORKFLOW_AGENT_CANCEL_UNCONFIRMED",
            `Agent child run ${childRunId} 取消后未收敛到稳定终态。`,
            {
              parentNodeId: node.id,
              childRunId,
              cancelError: cancelFailure instanceof Error ? cancelFailure.message : cancelFailure,
              observedStatus: queried?.status ?? cancelled?.status,
            },
          );
        }
        return terminal;
      })();
      return cancellation;
    };
    const onAbort = () => { void cancelChild().catch(() => undefined); };
    context.signal.addEventListener("abort", onAbort, { once: true });
    try {
      for await (const event of this.options.runtime.stream(command)) {
        if (event.type === "text.delta") context.emitDelta(event.delta, childIdentity);
        if (event.type === "tool.call") context.emitLog("info", `Agent Tool ${event.toolId} started (${event.callId})`, childIdentity);
        if (event.type === "tool.result") {
          context.emitLog(
            event.result.status === "failed" ? "error" : "info",
            `Agent Tool ${event.result.toolId} ${event.result.status}`,
            childIdentity,
          );
        }
        if (event.type === "usage") context.emitLog("debug", `Agent usage ${stableSerialize(event.usage)}`, childIdentity);
        if (event.type === "run.final") final = event.result;
      }
    } catch (error) {
      streamFailure = error;
    } finally {
      context.signal.removeEventListener("abort", onAbort);
    }
    if (context.signal.aborted) {
      const terminal = await cancelChild();
      throw workflowAgentError("WORKFLOW_AGENT_CANCELLED", `Agent child run ${childRunId} 已随父 Workflow 取消。`, {
        parentNodeId: node.id,
        childRunId,
        childStatus: terminal.status,
      });
    }
    if (streamFailure) {
      throw workflowAgentError(
        "WORKFLOW_AGENT_FAILED",
        streamFailure instanceof Error ? streamFailure.message : `Agent child run ${childRunId} 流式执行失败。`,
        { parentNodeId: node.id, childRunId, agentVersionId: version.id },
      );
    }
    if (!final || final.status !== "succeeded") {
      throw workflowAgentError(
        final?.status === "cancelled" ? "WORKFLOW_AGENT_CANCELLED" : "WORKFLOW_AGENT_FAILED",
        final?.error?.message ?? `Agent child run ${childRunId} 未成功完成。`,
        { parentNodeId: node.id, childRunId, agentVersionId: version.id },
      );
    }
    const output = parseAgentOutput(final.text);
    const schemaDiagnostics = validateWorkflowJsonSchema(output, version.outputSchema, node.id, ["output"]);
    if (schemaDiagnostics.some((item) => item.severity === "error")) {
      throw workflowAgentError(
        "WORKFLOW_AGENT_OUTPUT_SCHEMA_INVALID",
        `Agent child run ${childRunId} 的输出不符合发布版本 schema。`,
        {
          parentNodeId: node.id,
          childRunId,
          agentVersionId: version.id,
          schemaDiagnostics,
        },
      );
    }
    return {
      outputs: { result: output },
      eventIdentity: childIdentity,
    };
  }
}
