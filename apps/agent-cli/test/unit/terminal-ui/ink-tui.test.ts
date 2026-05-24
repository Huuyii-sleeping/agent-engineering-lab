import { describe, expect, it } from "vitest";
import { buildInkTuiPreviewSnapshot } from "../../../src/terminal-ui/ink-tui.js";

describe("terminal-ui/ink-tui", () => {
  it("builds a Claude-style REPL preview snapshot", () => {
    const snapshot = buildInkTuiPreviewSnapshot({
      model: "gpt-test",
      workflow: "draw",
      activeSessionId: "s01",
      sessionCount: 2,
      toolCount: 4,
      bridgeEndpoint: "/events",
    });

    expect(snapshot.byline).toContain("Agent CLI");
    expect(snapshot.messages).toContainEqual({
      role: "user",
      marker: ">",
      text: "Build with TSX terminal components",
      tone: "user",
    });
    expect(snapshot.messages.some((message) => message.text.includes("REPL-style surface"))).toBe(
      true,
    );
    expect(snapshot.slashPane.title).toBe("/palette feature");
    expect(snapshot.slashPane.items).toContain("/features  feature disclosure");
    expect(snapshot.statusLine).toContain("model gpt-test");
    expect(snapshot.statusLine).toContain("workflow draw");
    expect(snapshot.prompt.mode).toBe("agent");
    expect(snapshot.prompt.placeholder).toContain("Type a message");
    expect(snapshot.footerHints).toContain("Ctrl+K palette");
    expect(snapshot.footerHints).toContain("q exit");
  });
});
