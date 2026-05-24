import { describe, expect, it } from "vitest";
import { buildInkTuiPreviewSnapshot } from "../../../src/terminal-ui/ink-tui.js";

describe("terminal-ui/ink-tui", () => {
  it("builds a preview snapshot with title shortcuts guide and palette summary", () => {
    const snapshot = buildInkTuiPreviewSnapshot({
      model: "gpt-test",
      workflow: "draw",
      activeSessionId: "s01",
      sessionCount: 2,
      toolCount: 4,
      bridgeEndpoint: "/events",
    });

    expect(snapshot.title).toBe("Agent CLI Ink/TSX Preview");
    expect(snapshot.badges).toContain("tsx");
    expect(snapshot.badges).toContain("ink");
    expect(snapshot.status).toContainEqual({ label: "model", value: "gpt-test" });
    expect(snapshot.status).toContainEqual({ label: "workflow", value: "draw" });
    expect(snapshot.shortcuts).toContain("q / Esc / Ctrl+C exit");
    expect(snapshot.shortcuts).toContain("Ctrl+K palette");
    expect(snapshot.guide).toContain("palette   /palette or Ctrl+K launches local actions");
    expect(snapshot.paletteSummary).toContain("feature disclosure");
  });
});
