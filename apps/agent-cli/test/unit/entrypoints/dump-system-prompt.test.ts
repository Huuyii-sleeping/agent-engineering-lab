import { describe, expect, it, vi } from "vitest";
import { runDumpSystemPrompt } from "../../../src/entrypoints/dump-system-prompt.js";

describe("entrypoints/dump-system-prompt", () => {
  it("prints the stable system prompt inspection surface", async () => {
    const output = { write: vi.fn() } as unknown as NodeJS.WritableStream;

    await runDumpSystemPrompt({ output });

    const written = output.write.mock.calls.map((call) => String(call[0])).join("");
    expect(written).toContain("System Prompt");
    expect(written).toContain("Primary");
  });
});
