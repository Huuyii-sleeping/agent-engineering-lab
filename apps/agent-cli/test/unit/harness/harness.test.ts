import { access } from "node:fs/promises";
import * as process from "node:process";
import { describe, expect, it } from "vitest";
import { createDeterministicModel } from "../../harness/model.js";
import { runHarnessScenario } from "../../harness/scenario.js";
import { withHarnessWorkspace } from "../../harness/workspace.js";

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

describe("test harness foundation", () => {
  it("isolates workspace files cwd and environment", async () => {
    const previousCwd = process.cwd();
    const previousEnv = process.env.AGENT_HARNESS_TEST_VAR;
    process.env.AGENT_HARNESS_TEST_VAR = "original";
    let workspaceRoot = "";

    await withHarnessWorkspace(
      {
        name: "harness-workspace",
        files: {
          "src/input.txt": "hello harness",
        },
        env: {
          AGENT_HARNESS_TEST_VAR: "scenario",
        },
      },
      async (workspace) => {
        workspaceRoot = workspace.root;
        expect(process.cwd()).toBe(workspace.root);
        expect(process.env.AGENT_HARNESS_TEST_VAR).toBe("scenario");
        await expect(workspace.readText("src/input.txt")).resolves.toBe("hello harness");
        await workspace.writeText("out/result.txt", "done");
        await expect(workspace.readText("out/result.txt")).resolves.toBe("done");
      },
    );

    expect(process.cwd()).toBe(previousCwd);
    expect(process.env.AGENT_HARNESS_TEST_VAR).toBe("original");
    expect(await exists(workspaceRoot)).toBe(false);
    if (previousEnv === undefined) {
      delete process.env.AGENT_HARNESS_TEST_VAR;
    } else {
      process.env.AGENT_HARNESS_TEST_VAR = previousEnv;
    }
  });

  it("serves deterministic model responses and records requests", async () => {
    const model = createDeterministicModel([
      { type: "message", content: "first reply" },
      {
        type: "tool_calls",
        content: "need a file",
        toolCalls: [{ id: "call_1", name: "read_file", argumentsJson: "{\"path\":\"README.md\"}" }],
      },
      { type: "error", message: "model boom" },
    ]);

    await expect(model.complete({ prompt: "one" })).resolves.toMatchObject({ content: "first reply" });
    await expect(model.complete({ prompt: "two" })).resolves.toMatchObject({
      content: "need a file",
      toolCalls: [{ name: "read_file" }],
    });
    await expect(model.complete({ prompt: "three" })).rejects.toThrow("model boom");
    await expect(model.complete({ prompt: "four" })).rejects.toThrow("deterministic model script exhausted");
    expect(model.requests.map((request) => request.prompt)).toEqual(["one", "two", "three", "four"]);
  });

  it("runs structured scenarios with workspace model and output assertions", async () => {
    const result = await runHarnessScenario({
      name: "happy scenario",
      workspace: {
        files: {
          "input.txt": "ready",
        },
      },
      model: [{ type: "message", content: "assistant ok" }],
      steps: [
        { name: "check input", expectFile: { path: "input.txt", contains: "ready" } },
        { name: "write output", writeFile: { path: "out.txt", content: "created" } },
        { name: "call model", callModel: { prompt: "hello", expectContent: "assistant ok" } },
        { name: "emit output", emit: "scenario finished" },
        { name: "check output", expectOutputContains: "scenario finished" },
      ],
    });

    expect(result.status).toBe("passed");
    expect(result.steps.map((step) => step.status)).toEqual(["passed", "passed", "passed", "passed", "passed"]);
    expect(result.modelRequests.map((request) => request.prompt)).toEqual(["hello"]);
  });

  it("returns failed scenario results with the failing step name", async () => {
    const result = await runHarnessScenario({
      name: "failing scenario",
      workspace: {
        files: {
          "input.txt": "actual",
        },
      },
      steps: [
        { name: "bad assertion", expectFile: { path: "input.txt", contains: "missing" } },
        { name: "not reached", emit: "should not run" },
      ],
    });

    expect(result.status).toBe("failed");
    expect(result.failedStep).toBe("bad assertion");
    expect(result.steps).toEqual([
      expect.objectContaining({
        name: "bad assertion",
        status: "failed",
        message: expect.stringContaining("missing"),
      }),
    ]);
  });
});
