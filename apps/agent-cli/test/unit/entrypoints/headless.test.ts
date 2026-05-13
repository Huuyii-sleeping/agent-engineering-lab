import { describe, expect, it, vi } from "vitest";
import { runHeadlessQuery } from "../../../src/entrypoints/headless.js";
import type { AgentAppRuntimeDeps } from "../../../src/bootstrap/app-runtime.js";

function createApp(overrides: {
  hookResult?: { blocked: boolean; blockReason?: string; messages?: string[] };
  assistant?: string;
}): AgentAppRuntimeDeps {
  return {
    hookService: {
      run: vi.fn(async () => overrides.hookResult ?? { blocked: false, messages: [] }),
    },
    queryEngine: {
      run: vi.fn(async ({ messages }) => {
        messages.push({ role: "assistant", content: overrides.assistant ?? "headless reply" });
      }),
    },
  } as unknown as AgentAppRuntimeDeps;
}

describe("entrypoints/headless", () => {
  it("runs one query and writes the assistant text", async () => {
    const writes: string[] = [];
    const exitCode = await runHeadlessQuery({
      prompt: "hello",
      app: createApp({ assistant: "done" }),
      output: { write: (chunk: string) => writes.push(chunk) } as NodeJS.WritableStream,
      errorOutput: { write: vi.fn() } as unknown as NodeJS.WritableStream,
    });

    expect(exitCode).toBe(0);
    expect(writes).toEqual(["done\n"]);
  });

  it("returns a non-zero exit code when UserPromptSubmit blocks", async () => {
    const errors: string[] = [];
    const exitCode = await runHeadlessQuery({
      prompt: "blocked",
      app: createApp({ hookResult: { blocked: true, blockReason: "nope" } }),
      output: { write: vi.fn() } as unknown as NodeJS.WritableStream,
      errorOutput: { write: (chunk: string) => errors.push(chunk) } as NodeJS.WritableStream,
    });

    expect(exitCode).toBe(1);
    expect(errors).toEqual(["HOOK_BLOCKED: nope\n"]);
  });
});
