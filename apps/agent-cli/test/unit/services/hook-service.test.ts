import { describe, expect, it, vi } from "vitest";

const runHooks = vi.hoisted(() => vi.fn(async () => ({
  blocked: false,
  blockReason: null,
  messages: ["hook message"],
  matched: 1,
  executed: 1,
  errors: [],
})));

vi.mock("../../../src/hooks/index.js", () => ({ runHooks }));

import { HookService } from "../../../src/services/hook-service.js";

describe("services/hook-service", () => {
  it("delegates hook events without changing the invocation contract", async () => {
    const service = new HookService();
    const invocation = {
      session_id: "session-1",
      trace_id: "trace-1",
      payload: { prompt: "hello" },
    };

    await expect(service.run("UserPromptSubmit", invocation)).resolves.toMatchObject({
      blocked: false,
      messages: ["hook message"],
    });
    expect(runHooks).toHaveBeenCalledWith("UserPromptSubmit", invocation);
  });
});
