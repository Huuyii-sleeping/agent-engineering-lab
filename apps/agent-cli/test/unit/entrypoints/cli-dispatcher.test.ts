import { describe, expect, it } from "vitest";
import { parseCliInvocation, renderCliHelp } from "../../../src/entrypoints/cli-dispatcher.js";

describe("entrypoints/cli-dispatcher", () => {
  it("keeps the no-arg default as interactive CLI", () => {
    expect(parseCliInvocation([])).toEqual({ mode: "interactive" });
  });

  it("parses fast flags without needing runtime state", () => {
    expect(parseCliInvocation(["--help"])).toEqual({ mode: "help" });
    expect(parseCliInvocation(["-v"])).toEqual({ mode: "version" });
  });

  it("parses service and MCP entrypoints", () => {
    expect(parseCliInvocation(["server"])).toEqual({ mode: "server" });
    expect(parseCliInvocation(["--mcp-server"])).toEqual({ mode: "mcp-server" });
    expect(parseCliInvocation(["tui"])).toEqual({ mode: "tui" });
    expect(parseCliInvocation(["architecture"])).toEqual({ mode: "architecture" });
    expect(parseCliInvocation(["dump-system-prompt"])).toEqual({ mode: "dump-system-prompt" });
  });

  it("parses headless print prompts", () => {
    expect(parseCliInvocation(["--print", "summarize", "this"])).toEqual({
      mode: "print",
      prompt: "summarize this",
    });
    expect(parseCliInvocation(["print"])).toEqual({ mode: "print", prompt: "" });
  });

  it("renders the available entrypoint modes", () => {
    const help = renderCliHelp();
    expect(help).toContain("Start interactive CLI");
    expect(help).toContain("Run one headless query");
    expect(help).toContain("Start stdio MCP server");
    expect(help).toContain("Start terminal TUI console");
    expect(help).toContain("Print the local architecture overview");
    expect(help).toContain("Print the current stable system prompt");
  });
});
