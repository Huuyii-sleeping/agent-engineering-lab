import { describe, expect, it, vi } from "vitest";
import { RequestContext } from "@mastra/core/request-context";
import { standardSchemaToJSONSchema } from "@mastra/core/schema";
import {
  RuntimePortError,
  type ExecuteToolCommand,
  type ToolDescriptor,
  type ToolExecutionPort,
} from "@orbit/runtime-contracts";
import { defineToolExecutionPortContract } from "../../../harness/runtime-ports/tool-contract.js";
import {
  MastraToolExecutionAdapter,
  ORBIT_EXECUTOR_KIND_KEY,
  ORBIT_OWNER_ID_KEY,
  ORBIT_PRODUCT_RUN_ID_KEY,
  ORBIT_SESSION_ID_KEY,
} from "../../../../src/mastra/tools/tool-execution-adapter.js";

const descriptor: ToolDescriptor = {
  id: "echo",
  name: "echo",
  description: "Echo input",
  inputSchema: { type: "object", properties: { value: { type: "string" } }, required: ["value"] },
  outputSchema: { type: "object" },
  source: "skill",
  skillId: "skill-echo",
  skillVersion: "2.0.0",
  traits: { readOnly: true, idempotent: true, cancellable: true, sideEffecting: false },
};

function createGovernedPort(audit: string[]): ToolExecutionPort {
  return {
    async list(context) {
      return context.allowedToolIds?.includes("echo") === false ? [] : [descriptor];
    },
    async execute(command) {
      if (command.ownerId === "denied") {
        audit.push("execute:denied");
        throw new RuntimePortError("TOOL_PERMISSION_DENIED", "denied");
      }
      if (command.abortSignal) {
        await new Promise<void>((resolve, reject) => {
          if (command.abortSignal!.aborted) {
            reject(new RuntimePortError("RUNTIME_CANCELLED", "cancelled"));
            return;
          }
          command.abortSignal!.addEventListener(
            "abort",
            () => reject(new RuntimePortError("RUNTIME_CANCELLED", "cancelled")),
            { once: true },
          );
        });
      }
      audit.push("execute:succeeded");
      return {
        toolId: command.toolId,
        output: { echoed: command.input },
        startedAt: 1,
        finishedAt: 2,
        auditId: "audit-1",
      };
    },
  };
}

defineToolExecutionPortContract("Mastra", () => {
  const audit: string[] = [];
  const port = new MastraToolExecutionAdapter(createGovernedPort(audit));
  const allowedCommand: ExecuteToolCommand = {
    toolId: "echo",
    input: { value: "ok" },
    ownerId: "owner-1",
    executor: { kind: "direct" },
    requestContext: {},
  };
  return {
    port,
    listContext: { ownerId: "owner-1", allowedToolIds: ["echo"] },
    allowedCommand,
    deniedCommand: { ...allowedCommand, ownerId: "denied" },
    abortCommand: (abortSignal) => ({ ...allowedCommand, abortSignal }),
    auditActions: () => audit,
  };
});

describe("mastra/tools/tool-execution-adapter", () => {
  it("从 descriptor 生成稳定 Mastra Tool，并只委托 ToolExecutionPort 一次", async () => {
    const execute = vi.fn().mockResolvedValue({
      toolId: "echo",
      output: { echoed: "hello" },
      startedAt: 1,
      finishedAt: 2,
      auditId: "audit-7",
    });
    const before = vi.fn();
    const after = vi.fn();
    const adapter = new MastraToolExecutionAdapter({
      list: vi.fn().mockResolvedValue([descriptor]),
      execute,
    }, { beforeExecute: before, afterExecute: after });
    const tools = await adapter.resolveForAgent({
      agentId: "agent-1",
      agentVersion: "v1",
      sessionId: "session-1",
      resourceId: "resource-1",
      threadId: "thread-1",
      messages: [{ role: "user", content: "hello" }],
      requestContext: { ownerId: "owner-1" },
      policy: { allowedToolIds: ["echo"], allowedSkillIds: ["skill-echo"] },
    });
    const tool = tools.echo;
    const requestContext = new RequestContext();
    requestContext.set(ORBIT_OWNER_ID_KEY, "owner-1");
    requestContext.set(ORBIT_EXECUTOR_KIND_KEY, "agent");
    requestContext.set(ORBIT_PRODUCT_RUN_ID_KEY, "run-1");
    requestContext.set(ORBIT_SESSION_ID_KEY, "session-1");

    const output = await tool.execute?.({ value: "hello" }, {
      requestContext,
      abortSignal: new AbortController().signal,
      observe: { log: vi.fn(), span: vi.fn((_name, operation) => operation()) },
    } as never);

    expect(tool).toMatchObject({
      id: "echo",
      description: "Echo input",
    });
    expect(standardSchemaToJSONSchema(tool.inputSchema!)).toMatchObject({ type: "object" });
    expect(adapter.getDescriptor("echo")).toEqual(descriptor);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      toolId: "echo",
      input: { value: "hello" },
      ownerId: "owner-1",
      executor: { kind: "agent", runId: "run-1", sessionId: "session-1" },
    }));
    expect(output).toEqual({ echoed: "hello" });
    expect(before).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledWith(expect.objectContaining({ outcome: "succeeded", auditId: "audit-7" }));
  });

  it("保持 Skill binding 与 Tool identity，并按允许列表解析", async () => {
    const list = vi.fn().mockResolvedValue([descriptor, { ...descriptor, id: "other", name: "other" }]);
    const adapter = new MastraToolExecutionAdapter({ list, execute: vi.fn() });

    const tools = await adapter.resolveForAgent({
      agentId: "agent-1",
      agentVersion: "v1",
      sessionId: "session-1",
      resourceId: "resource-1",
      threadId: "thread-1",
      messages: [],
      requestContext: { ownerId: "owner-1" },
      policy: { allowedToolIds: ["echo"], allowedSkillIds: ["skill-echo"] },
    });

    expect(Object.keys(tools)).toEqual(["echo"]);
    expect(list).toHaveBeenCalledWith({
      ownerId: "owner-1",
      sessionId: "session-1",
      agentId: "agent-1",
      allowedToolIds: ["echo"],
      allowedSkillIds: ["skill-echo"],
    });
    expect(adapter.getDescriptor("echo")).toMatchObject({ skillId: "skill-echo", skillVersion: "2.0.0" });
  });

  it("Mastra Tool 保留安全拒绝错误，并让失败 hook 只记录不重复执行", async () => {
    const rejected = new RuntimePortError("TOOL_SECURITY_BLOCKED", "blocked by policy");
    const execute = vi.fn().mockRejectedValue(rejected);
    const after = vi.fn();
    const adapter = new MastraToolExecutionAdapter({
      list: vi.fn().mockResolvedValue([descriptor]),
      execute,
    }, { afterExecute: after });
    const tools = await adapter.resolve({ ownerId: "owner-1", workflowId: "workflow-1" });
    const requestContext = new RequestContext();
    requestContext.set(ORBIT_OWNER_ID_KEY, "owner-1");
    requestContext.set(ORBIT_EXECUTOR_KIND_KEY, "workflow");
    requestContext.set(ORBIT_PRODUCT_RUN_ID_KEY, "run-1");

    await expect(tools.echo.execute?.({ value: "no" }, {
      requestContext,
      observe: { log: vi.fn(), span: vi.fn((_name, operation) => operation()) },
    } as never)).rejects.toBe(rejected);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "failed",
      error: rejected,
    }));
  });

  it("Workflow 节点通过生成的 Mastra Tool 传播 owner、run、node 与 AbortSignal", async () => {
    const signal = new AbortController().signal;
    const execute = vi.fn().mockResolvedValue({
      toolId: "echo",
      output: { ok: true },
      startedAt: 1,
      finishedAt: 2,
    });
    const before = vi.fn();
    const adapter = new MastraToolExecutionAdapter({
      list: vi.fn().mockResolvedValue([descriptor]),
      execute,
    }, { beforeExecute: before });

    await expect(adapter.executeForWorkflow({
      toolId: "echo",
      toolInput: { value: "workflow" },
      ownerId: "owner-workflow",
      workflowId: "workflow-1",
      runId: "run-workflow",
      nodeId: "tool-node",
      requestContext: { traceId: "trace-1" },
      abortSignal: signal,
    })).resolves.toEqual({ ok: true });

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: "owner-workflow",
      toolId: "echo",
      input: { value: "workflow" },
      executor: { kind: "workflow", runId: "run-workflow", nodeId: "tool-node" },
      requestContext: expect.objectContaining({ traceId: "trace-1" }),
      abortSignal: signal,
    }));
    expect(before).toHaveBeenCalledTimes(1);
  });

  it("Agent、Workflow Tool 节点和直接 API 共用同一 ToolExecutionPort", async () => {
    const execute = vi.fn().mockImplementation(async (command: ExecuteToolCommand) => ({
      toolId: command.toolId,
      output: { executor: command.executor.kind },
      startedAt: 1,
      finishedAt: 2,
    }));
    const adapter = new MastraToolExecutionAdapter({
      list: vi.fn().mockResolvedValue([descriptor]),
      execute,
    });
    const agentTools = await adapter.resolveForAgent({
      agentId: "agent-1",
      agentVersion: "v1",
      sessionId: "session-1",
      resourceId: "resource-1",
      threadId: "thread-1",
      messages: [],
      requestContext: { ownerId: "owner-1" },
      policy: { allowedToolIds: ["echo"], allowedSkillIds: ["skill-echo"] },
    });
    const agentContext = new RequestContext();
    agentContext.set(ORBIT_OWNER_ID_KEY, "owner-1");
    agentContext.set(ORBIT_EXECUTOR_KIND_KEY, "agent");
    agentContext.set(ORBIT_PRODUCT_RUN_ID_KEY, "agent-run");
    agentContext.set(ORBIT_SESSION_ID_KEY, "session-1");
    await agentTools.echo.execute?.({ value: "agent" }, {
      requestContext: agentContext,
      observe: { log: vi.fn(), span: vi.fn((_name, operation) => operation()) },
    } as never);
    await adapter.executeForWorkflow({
      toolId: "echo",
      toolInput: { value: "workflow" },
      ownerId: "owner-1",
      workflowId: "workflow-1",
      runId: "workflow-run",
      nodeId: "tool-node",
    });
    await adapter.execute({
      toolId: "echo",
      input: { value: "direct" },
      ownerId: "owner-1",
      executor: { kind: "direct" },
      requestContext: {},
    });

    expect(execute.mock.calls.map(([command]) => command.executor.kind)).toEqual([
      "agent",
      "workflow",
      "direct",
    ]);
  });
});
