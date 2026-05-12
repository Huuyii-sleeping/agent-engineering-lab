import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/runtime/tool-runtime.js", () => ({
  resolveToolExecution: vi.fn(),
}));

vi.mock("../../../src/tools/registry.js", () => ({
  BUILTIN_SUBAGENT_TOOL_NAMES: new Set(["subagent_wait"]),
}));

import { resolveToolExecution, type ToolExecution } from "../../../src/runtime/tool-runtime.js";
import type { BuiltinToolExecutorLike } from "../../../src/tools/builtin-executor.js";
import { ToolExecutor } from "../../../src/tools/executor.js";
import type { McpToolExecutorLike } from "../../../src/tools/mcp-executor.js";

function createExecution(target: ToolExecution["target"], name: string): ToolExecution {
  return {
    target,
    name,
    argumentsJson: "{}",
    args: {},
  };
}

describe("tools/executor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates preview formatting to the builtin executor", () => {
    const builtinExecutor: BuiltinToolExecutorLike = {
      previewToolCall: vi.fn(() => "subagent_wait 7"),
      run: vi.fn(async () => ""),
    };
    const mcpExecutor: McpToolExecutorLike = {
      run: vi.fn(async () => ""),
    };

    expect(new ToolExecutor(builtinExecutor, mcpExecutor).previewToolCall("subagent_wait", '{"agent_id":7}')).toBe(
      "subagent_wait 7",
    );
    expect(builtinExecutor.previewToolCall).toHaveBeenCalledWith("subagent_wait", '{"agent_id":7}');
  });

  it("dispatches mcp executions to the mcp executor", async () => {
    const execution = createExecution("mcp", "mcp__demo__echo");
    const builtinExecutor: BuiltinToolExecutorLike = {
      previewToolCall: vi.fn(() => ""),
      run: vi.fn(async () => "builtin output"),
    };
    const mcpExecutor: McpToolExecutorLike = {
      run: vi.fn(async () => "mcp output"),
    };
    vi.mocked(resolveToolExecution).mockReturnValueOnce(execution);

    const output = await new ToolExecutor(builtinExecutor, mcpExecutor).runToolByName("mcp__demo__echo", "{}");

    expect(output).toBe("mcp output");
    expect(mcpExecutor.run).toHaveBeenCalledWith(execution);
    expect(builtinExecutor.run).not.toHaveBeenCalled();
  });

  it("dispatches builtin and subagent executions to the builtin executor", async () => {
    const execution = createExecution("subagent", "subagent_wait");
    const builtinExecutor: BuiltinToolExecutorLike = {
      previewToolCall: vi.fn(() => ""),
      run: vi.fn(async () => "builtin output"),
    };
    const mcpExecutor: McpToolExecutorLike = {
      run: vi.fn(async () => "mcp output"),
    };
    vi.mocked(resolveToolExecution).mockReturnValueOnce(execution);

    const output = await new ToolExecutor(builtinExecutor, mcpExecutor).runToolByName("subagent_wait", "{}");

    expect(output).toBe("builtin output");
    expect(builtinExecutor.run).toHaveBeenCalledWith(execution);
    expect(mcpExecutor.run).not.toHaveBeenCalled();
  });
});
