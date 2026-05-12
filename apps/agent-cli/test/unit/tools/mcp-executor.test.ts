import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/runtime/tool-runtime.js", () => ({
  executeProtectedToolHandler: vi.fn(),
}));

vi.mock("../../../src/tools/mcp.js", () => ({
  runMcpToolByName: vi.fn(),
}));

import { executeProtectedToolHandler, type ToolExecution } from "../../../src/runtime/tool-runtime.js";
import { McpToolExecutor } from "../../../src/tools/mcp-executor.js";
import { runMcpToolByName } from "../../../src/tools/mcp.js";

function createExecution(name: string, args: Record<string, unknown>): ToolExecution {
  return {
    target: "mcp",
    name,
    argumentsJson: JSON.stringify(args),
    args,
  };
}

describe("tools/mcp-executor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(executeProtectedToolHandler).mockImplementation(async (opts) => opts.handler(opts.args));
  });

  it("routes mcp executions through the protected handler boundary", async () => {
    vi.mocked(runMcpToolByName).mockResolvedValueOnce("mcp output");

    const output = await new McpToolExecutor().run(createExecution("mcp__demo__echo", { text: "hello" }));

    expect(output).toBe("mcp output");
    expect(runMcpToolByName).toHaveBeenCalledWith("mcp__demo__echo", { text: "hello" });
    expect(executeProtectedToolHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "mcp__demo__echo",
        args: { text: "hello" },
        handler: expect.any(Function),
      }),
    );
  });

  it("keeps unknown mcp fallback output stable", async () => {
    vi.mocked(runMcpToolByName).mockResolvedValueOnce(null);

    const output = JSON.parse(await new McpToolExecutor().run(createExecution("mcp__demo__missing", {}))) as {
      error?: { code?: string };
    };

    expect(output.error?.code).toBe("UNKNOWN_TOOL");
  });
});
