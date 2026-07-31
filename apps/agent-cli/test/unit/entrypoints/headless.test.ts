import { describe, expect, it, vi } from "vitest";
import { runHeadlessQuery } from "../../../src/entrypoints/headless.js";

describe("entrypoints/headless", () => {
  it("runs one query and writes the assistant text", async () => {
    const writes: string[] = [];
    const exitCode = await runHeadlessQuery({
      prompt: "hello",
      service: { chat: vi.fn(async () => ({ ok: true, assistant: "done" })) },
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
      service: {
        chat: vi.fn(async () => ({
          ok: false,
          error: { code: "HOOK_BLOCKED", message: "nope" },
        })),
      },
      output: { write: vi.fn() } as unknown as NodeJS.WritableStream,
      errorOutput: { write: (chunk: string) => errors.push(chunk) } as NodeJS.WritableStream,
    });

    expect(exitCode).toBe(1);
    expect(errors).toEqual(["HOOK_BLOCKED: nope\n"]);
  });
});
