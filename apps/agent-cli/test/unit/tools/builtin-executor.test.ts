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

vi.mock("../../../src/tools/registry.js", () => ({
  previewBuiltinToolCall: vi.fn(),
  resolveBuiltinToolHandler: vi.fn(),
  resolveBuiltinToolRegistration: vi.fn(),
}));

import {
  executeProtectedToolHandler,
  validateToolInput,
  type ToolExecution,
} from "../../../src/runtime/tool-runtime.js";
import { BuiltinToolExecutor } from "../../../src/tools/builtin-executor.js";
import {
  previewBuiltinToolCall,
  resolveBuiltinToolHandler,
  resolveBuiltinToolRegistration,
} from "../../../src/tools/registry.js";

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
    vi.mocked(validateToolInput).mockReturnValue([]);
    vi.mocked(resolveBuiltinToolRegistration).mockReturnValue({
      name: "read_file",
      description: "Read file",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      target: "base",
      allowDuringReplay: true,
      execution: {
        readOnly: true,
        mutatesWorkspace: false,
        parallelSafe: true,
        riskLevel: "low",
      },
    });
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
    expect(validateToolInput).toHaveBeenCalledWith(
      { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      { path: "README.md" },
    );
    expect(executeProtectedToolHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "read_file",
        args: { path: "README.md" },
        handler,
        allowDuringReplay: true,
      }),
    );
  });

  it("returns validation errors before invoking the handler", async () => {
    vi.mocked(resolveBuiltinToolHandler).mockReturnValueOnce({
      handler: vi.fn(async () => "builtin output"),
      allowDuringReplay: true,
    });
    vi.mocked(validateToolInput).mockReturnValueOnce(["path is required"]);

    const output = JSON.parse(await new BuiltinToolExecutor().run(createExecution("read_file", {}))) as {
      error?: { code?: string; details?: string[] };
    };

    expect(output.error?.code).toBe("TOOL_INPUT_VALIDATION_ERROR");
    expect(output.error?.details).toEqual(["path is required"]);
    expect(executeProtectedToolHandler).not.toHaveBeenCalled();
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
