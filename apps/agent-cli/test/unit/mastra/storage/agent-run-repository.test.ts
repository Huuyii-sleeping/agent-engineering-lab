import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MastraAgentRunRepository } from "../../../../src/mastra/storage/agent-run-repository.js";

let root = "";

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = "";
});

describe("mastra/storage/agent-run-repository", () => {
  it("持久化 Agent run query 状态并保持终态不可逆", async () => {
    root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-agent-runs-"));
    const repository = new MastraAgentRunRepository({ root });
    await repository.create({
      id: "run-1",
      status: "running",
      createdAt: 1,
      startedAt: 1,
      sessionId: "session-1",
      resourceId: "resource-1",
      threadId: "thread-1",
      binding: { backend: "mastra", adapterVersion: "mastra-agent-v1", nativeRunId: "native-1" },
    });
    const completed = await repository.finish({
      id: "run-1",
      status: "succeeded",
      createdAt: 1,
      startedAt: 1,
      finishedAt: 2,
      sessionId: "session-1",
      resourceId: "resource-1",
      threadId: "thread-1",
      binding: { backend: "mastra", adapterVersion: "mastra-agent-v1", nativeRunId: "native-1" },
      text: "done",
      toolExecutions: [],
    });

    await expect(repository.finish({ ...completed, status: "failed" })).resolves.toEqual(completed);
    await expect(new MastraAgentRunRepository({ root }).get("run-1")).resolves.toEqual(completed);
  });
});
