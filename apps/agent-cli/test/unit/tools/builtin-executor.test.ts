import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/runtime/tool-runtime.js", () => ({
  executeProtectedToolHandler: vi.fn(),
}));

vi.mock("../../../src/tools/registry.js", () => ({
  previewBuiltinToolCall: vi.fn(),
  resolveBuiltinToolHandler: vi.fn(),
}));

import { executeProtectedToolHandler, type ToolExecution } from "../../../src/runtime/tool-runtime.js";
import { BuiltinToolExecutor } from "../../../src/tools/builtin-executor.js";
import { previewBuiltinToolCall, resolveBuiltinToolHandler } from "../../../src/tools/registry.js";

function createExecution(name: string, args: Record<string, unknown>): ToolExecution {
  return {
    target: "base",
    name,
    argumentsJson: JSON.stringify(args),
    args,
  };
}

describe("tools/builtin-executor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(executeProtectedToolHandler).mockImplementation(async (opts) => opts.handler(opts.args));
  });

  it("delegates preview formatting to the builtin registry", () => {
    vi.mocked(previewBuiltinToolCall).mockReturnValueOnce("subagent_wait 7");

    expect(new BuiltinToolExecutor().previewToolCall("subagent_wait", '{"agent_id":7}')).toBe("subagent_wait 7");
    expect(previewBuiltinToolCall).toHaveBeenCalledWith("subagent_wait", '{"agent_id":7}');
  });

  it("executes builtin handlers with registry replay metadata", async () => {
    const handler = vi.fn(async () => "builtin output");
    vi.mocked(resolveBuiltinToolHandler).mockReturnValueOnce({
      handler,
      allowDuringReplay: true,
    });

    const output = await new BuiltinToolExecutor().run(createExecution("read_file", { path: "README.md" }));

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
    vi.mocked(resolveBuiltinToolHandler).mockReturnValueOnce(null);

    const output = JSON.parse(await new BuiltinToolExecutor().run(createExecution("missing_tool", {}))) as {
      error?: { code?: string };
    };

    expect(output.error?.code).toBe("UNKNOWN_TOOL");
    expect(executeProtectedToolHandler).not.toHaveBeenCalled();
  });
});
