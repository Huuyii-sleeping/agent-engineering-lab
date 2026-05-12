import { describe, expect, it } from "vitest";
import {
  formatMcpFailure,
  makeToolAlias,
  normalizeMcpCallOutput,
  parseCallResult,
  parseToolsList,
} from "../../../src/tools/mcp-protocol.js";

describe("tools/mcp-protocol", () => {
  it("creates stable sanitized aliases with collision suffixes", () => {
    const used = new Set<string>();

    expect(makeToolAlias("demo server", "echo-upper", used)).toBe("mcp__demo_server__echo_upper");
    expect(makeToolAlias("demo server", "echo-upper", used)).toBe("mcp__demo_server__echo_upper_2");
    expect(makeToolAlias("!!!", "???", used)).toBe("mcp__tool__tool");
  });

  it("parses tool lists and normalizes missing schemas", () => {
    expect(
      parseToolsList({
        tools: [
          { name: "echo", description: "Echo", inputSchema: { type: "object", properties: { text: { type: "string" } } } },
          { name: "no_schema", description: null, inputSchema: "bad" },
          { description: "missing name" },
        ],
      }),
    ).toEqual([
      {
        name: "echo",
        description: "Echo",
        inputSchema: { type: "object", properties: { text: { type: "string" } } },
      },
      {
        name: "no_schema",
        description: "",
        inputSchema: { type: "object", properties: {} },
      },
    ]);
  });

  it("normalizes structured and text call outputs without changing shape", () => {
    expect(normalizeMcpCallOutput("demo", "echo", { structuredContent: { ok: true, echoed: "HELLO" } })).toBe(
      `${JSON.stringify({ ok: true, echoed: "HELLO" }, null, 2)}\n`,
    );
    expect(
      JSON.parse(
        normalizeMcpCallOutput("demo", "echo", {
          content: [
            { type: "text", text: " hello " },
            { type: "image", text: "ignored" },
            { type: "text", text: "world" },
          ],
        }),
      ),
    ).toEqual({
      ok: true,
      server: "demo",
      remoteTool: "echo",
      content: "hello\nworld",
    });
  });

  it("normalizes mcp failures and defensive call parsing", () => {
    expect(parseCallResult(null)).toEqual({});

    const failed = JSON.parse(
      normalizeMcpCallOutput("demo", "fail_now", {
        isError: true,
        content: [{ type: "text", text: "fixture boom" }],
      }),
    ) as { ok?: boolean; error?: { code?: string; message?: string } };
    expect(failed.ok).toBe(false);
    expect(failed.error?.code).toBe("MCP_TOOL_CALL_FAILED");
    expect(failed.error?.message).toBe("fixture boom");

    expect(JSON.parse(formatMcpFailure("MCP_SERVER_NOT_FOUND", "missing")).error.code).toBe("MCP_SERVER_NOT_FOUND");
  });
});
