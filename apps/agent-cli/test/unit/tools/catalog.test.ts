import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/tools/mcp.js", () => ({
  listMcpToolRegistrations: vi.fn(),
}));

import { ToolCatalog } from "../../../src/tools/catalog.js";
import { listMcpToolRegistrations } from "../../../src/tools/mcp.js";

describe("tools/catalog", () => {
  beforeEach(() => {
    vi.mocked(listMcpToolRegistrations).mockResolvedValue([]);
  });

  it("combines builtin and mcp registrations behind the catalog boundary", async () => {
    vi.mocked(listMcpToolRegistrations).mockResolvedValueOnce([
      {
        name: "mcp__demo__echo",
        description: "Echo from demo MCP",
        parameters: { type: "object", properties: { text: { type: "string" } } },
        target: "mcp",
        allowDuringReplay: false,
        serverName: "demo",
        remoteName: "echo",
        trust: "trusted",
        provenance: ".codex/mcp.json#demo",
        credentialMode: "configured",
      },
    ]);

    const registrations = await new ToolCatalog().listToolRegistrations();

    expect(registrations.some((tool) => tool.name === "read_file" && tool.target === "base")).toBe(true);
    expect(registrations).toContainEqual(
      expect.objectContaining({
        name: "mcp__demo__echo",
        target: "mcp",
        serverName: "demo",
        remoteName: "echo",
        trust: "trusted",
        provenance: ".codex/mcp.json#demo",
        credentialMode: "configured",
      }),
    );
  });

  it("projects registrations into OpenAI tool schemas and metadata", async () => {
    vi.mocked(listMcpToolRegistrations).mockResolvedValue([
      {
        name: "mcp__demo__echo",
        description: "Echo from demo MCP",
        parameters: { type: "object", properties: { text: { type: "string" } } },
        target: "mcp",
        allowDuringReplay: false,
        serverName: "demo",
        remoteName: "echo",
        trust: "trusted",
        provenance: ".codex/mcp.json#demo",
        credentialMode: "configured",
      },
    ]);

    const catalog = new ToolCatalog();
    const tools = await catalog.listTools();
    const metadata = await catalog.listToolMetadata();

    expect(tools).toContainEqual(
      expect.objectContaining({
        type: "function",
        function: expect.objectContaining({
          name: "mcp__demo__echo",
          description: "[mcp:demo] Echo from demo MCP",
        }),
      }),
    );
    expect(metadata).toContainEqual(
      expect.objectContaining({
        name: "mcp__demo__echo",
        target: "mcp",
        replaySafe: "false",
        serverName: "demo",
        remoteName: "echo",
        trust: "trusted",
        provenance: ".codex/mcp.json#demo",
        credentialMode: "configured",
      }),
    );
  });
});
