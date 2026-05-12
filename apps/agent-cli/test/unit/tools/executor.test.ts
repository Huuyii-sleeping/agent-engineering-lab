import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/runtime/tool-runtime.js", () => ({
  executeProtectedToolHandler: vi.fn(),
  resolveToolExecution: vi.fn(),
}));

vi.mock("../../../src/tools/mcp.js", () => ({
  runMcpToolByName: vi.fn(),
}));

vi.mock("../../../src/tools/registry.js", () => ({
  BUILTIN_SUBAGENT_TOOL_NAMES: new Set(["subagent_wait"]),
  previewBuiltinToolCall: vi.fn(),
  resolveBuiltinToolHandler: vi.fn(),
}));

import { executeProtectedToolHandler, resolveToolExecution } from "../../../src/runtime/tool-runtime.js";
import { ToolExecutor } from "../../../src/tools/executor.js";
import { runMcpToolByName } from "../../../src/tools/mcp.js";
import { previewBuiltinToolCall, resolveBuiltinToolHandler } from "../../../src/tools/registry.js";

describe("tools/executor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(executeProtectedToolHandler).mockImplementation(async (opts) => opts.handler(opts.args));
  });

  it("delegates preview formatting to the builtin registry", () => {
    vi.mocked(previewBuiltinToolCall).mockReturnValueOnce("subagent_wait 7");

    expect(new ToolExecutor().previewToolCall("subagent_wait", '{"agent_id":7}')).toBe("subagent_wait 7");
    expect(previewBuiltinToolCall).toHaveBeenCalledWith("subagent_wait", '{"agent_id":7}');
  });

  it("routes mcp executions through the protected handler boundary", async () => {
    vi.mocked(resolveToolExecution).mockReturnValueOnce({
      target: "mcp",
      name: "mcp__demo__echo",
      argumentsJson: '{"text":"hello"}',
      args: { text: "hello" },
    });
    vi.mocked(runMcpToolByName).mockResolvedValueOnce("mcp output");

    const output = await new ToolExecutor().runToolByName("mcp__demo__echo", '{"text":"hello"}');

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

  it("routes builtin executions with registry replay metadata", async () => {
    const handler = vi.fn(async () => "builtin output");
    vi.mocked(resolveToolExecution).mockReturnValueOnce({
      target: "base",
      name: "read_file",
      argumentsJson: '{"path":"README.md"}',
      args: { path: "README.md" },
    });
    vi.mocked(resolveBuiltinToolHandler).mockReturnValueOnce({
      handler,
      allowDuringReplay: true,
    });

    const output = await new ToolExecutor().runToolByName("read_file", '{"path":"README.md"}');

    expect(output).toBe("builtin output");
    expect(executeProtectedToolHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "read_file",
        args: { path: "README.md" },
        handler,
        allowDuringReplay: true,
      }),
    );
  });

  it("keeps unknown tool output stable when no handler resolves", async () => {
    vi.mocked(resolveToolExecution).mockReturnValueOnce({
      target: "base",
      name: "missing_tool",
      argumentsJson: "{}",
      args: {},
    });
    vi.mocked(resolveBuiltinToolHandler).mockReturnValueOnce(null);

    const output = JSON.parse(await new ToolExecutor().runToolByName("missing_tool", "{}")) as {
      error?: { code?: string };
    };

    expect(output.error?.code).toBe("UNKNOWN_TOOL");
    expect(executeProtectedToolHandler).not.toHaveBeenCalled();
  });
});
