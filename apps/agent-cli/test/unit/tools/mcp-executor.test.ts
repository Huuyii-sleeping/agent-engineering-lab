import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/runtime/tool-runtime.js", () => ({
  createToolInputParseError: vi.fn((name: string, message: string) =>
    JSON.stringify({ ok: false, error: { code: "TOOL_INPUT_PARSE_ERROR", message: `${name}:${message}` } }),
  ),
  createToolInputValidationError: vi.fn((name: string, errors: string[]) =>
    JSON.stringify({ ok: false, error: { code: "TOOL_INPUT_VALIDATION_ERROR", message: name, details: errors } }),
  ),
  executeProtectedToolHandler: vi.fn(),
  validateToolInput: vi.fn(() => []),
}));

vi.mock("../../../src/tools/mcp.js", () => ({
  listMcpToolRegistrations: vi.fn(),
  runMcpToolByName: vi.fn(),
}));

import { executeProtectedToolHandler, validateToolInput, type ToolExecution } from "../../../src/runtime/tool-runtime.js";
import { McpToolExecutor } from "../../../src/tools/mcp-executor.js";
import { listMcpToolRegistrations, runMcpToolByName } from "../../../src/tools/mcp.js";

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
    vi.mocked(validateToolInput).mockReturnValue([]);
    vi.mocked(listMcpToolRegistrations).mockResolvedValue([
      {
        name: "mcp__demo__echo",
        description: "Echo",
        parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
        target: "mcp",
        allowDuringReplay: false,
        execution: {
          readOnly: false,
          mutatesWorkspace: false,
          parallelSafe: false,
          riskLevel: "medium",
        },
        serverName: "demo",
        remoteName: "echo",
      },
    ]);
  });

  it("routes mcp executions through the protected handler boundary", async () => {
    vi.mocked(runMcpToolByName).mockResolvedValueOnce("mcp output");

    const output = await new McpToolExecutor().run(createExecution("mcp__demo__echo", { text: "hello" }));

    expect(output).toBe("mcp output");
    expect(validateToolInput).toHaveBeenCalledWith(
      { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
      { text: "hello" },
    );
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
