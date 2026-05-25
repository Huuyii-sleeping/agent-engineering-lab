import { describe, expect, it } from "vitest";
import {
  buildInkTuiPreviewSnapshot,
  mergeInkTuiScheduledMessages,
  reduceInkTuiInput,
  renderInkPromptInput,
} from "../../../src/terminal-ui/ink-tui.js";

describe("terminal-ui/ink-tui", () => {
  it("builds a Claude-style REPL CLI snapshot", () => {
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

  it("reduces editable prompt input locally", () => {
    const initial = { draft: "", messages: [], shouldExit: false };
    const typed = reduceInkTuiInput(initial, { input: "你" });
    const typedMore = reduceInkTuiInput(typed, { input: "是谁" });
    const removed = reduceInkTuiInput(typedMore, { key: { backspace: true } });
    const submitted = reduceInkTuiInput(typedMore, { key: { return: true } });
    const exit = reduceInkTuiInput(initial, { input: "q" });

    expect(typed.draft).toBe("你");
    expect(typedMore.draft).toBe("你是谁");
    expect(removed.draft).toBe("你是");
    expect(submitted.draft).toBe("");
    expect(submitted.messages).toContainEqual({
      role: "user",
      marker: ">",
      text: "你是谁",
      tone: "user",
    });
    expect(submitted.messages.some((message) => message.text.includes("submitted"))).toBe(true);
    expect(exit.shouldExit).toBe(true);
  });

  it("does not change state for empty scheduled ticks", () => {
    const state = { draft: "", messages: [], shouldExit: false };
    const unchanged = mergeInkTuiScheduledMessages(state, []);
    const changed = mergeInkTuiScheduledMessages(state, [
      { role: "system", marker: "$", text: "scheduled", tone: "accent" },
    ]);

    expect(unchanged).toBe(state);
    expect(changed).not.toBe(state);
    expect(changed.messages).toHaveLength(1);
  });

  it("renders a visible cursor before placeholder for empty interactive prompt", () => {
    const rendered = renderInkPromptInput({
      draft: "",
      placeholder: "Type a message",
      showCursor: true,
    });

    expect(rendered.cursor).toBe("█");
    expect(rendered.placeholder).toBe("Type a message");
    expect(rendered.draft).toBe("");
    expect(rendered.empty).toBe(true);
  });

  it("renders a visible cursor after typed draft", () => {
    const rendered = renderInkPromptInput({
      draft: "hello",
      placeholder: "Type a message",
      showCursor: true,
    });

    expect(rendered.draft).toBe("hello");
    expect(rendered.cursor).toBe("█");
    expect(rendered.placeholder).toBe("");
    expect(rendered.empty).toBe(false);
  });
});
