import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { describe, expect, it, vi } from "vitest";
import type { ToolCatalogLike } from "../../../src/tools/catalog.js";
import type { ToolExecutorLike } from "../../../src/tools/executor.js";
import { ToolService } from "../../../src/tools/service.js";

describe("tools/service", () => {
  it("acts as a facade over catalog and executor boundaries", async () => {
    const tool = {
      type: "function",
      function: {
        name: "read_file",
        description: "Read a file",
        parameters: { type: "object", properties: {} },
      },
    } as ChatCompletionTool;
    const catalog: ToolCatalogLike = {
      listTools: vi.fn(async () => [tool]),
      listToolRegistrations: vi.fn(async () => [
        {
          name: "read_file",
          description: "Read a file",
          parameters: { type: "object", properties: {} },
          target: "base",
          allowDuringReplay: true,
        },
      ]),
      listToolMetadata: vi.fn(async () => [{ name: "read_file", target: "base" }]),
    };
    const executor: ToolExecutorLike = {
      previewToolCall: vi.fn(() => "read_file README.md"),
      runToolByName: vi.fn(async () => "file contents"),
    };

    const service = new ToolService(catalog, executor);

    expect(await service.listTools()).toEqual([tool]);
    expect(await service.listToolRegistrations()).toEqual([
      expect.objectContaining({ name: "read_file", target: "base" }),
    ]);
    expect(await service.listToolMetadata()).toEqual([{ name: "read_file", target: "base" }]);
    expect(service.previewToolCall("read_file", '{"path":"README.md"}')).toBe("read_file README.md");
    expect(await service.runToolByName("read_file", '{"path":"README.md"}')).toBe("file contents");
    expect(catalog.listTools).toHaveBeenCalledTimes(1);
    expect(executor.runToolByName).toHaveBeenCalledWith("read_file", '{"path":"README.md"}');
  });
});
