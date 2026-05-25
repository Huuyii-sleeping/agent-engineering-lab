import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "ink";
import {
  InkTuiPreviewApp,
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

  it("moves prompt cursor with left right home and end keys", () => {
    const state = { draft: "hello", cursorIndex: 5, messages: [], shouldExit: false };

    const left = reduceInkTuiInput(state, { key: { leftArrow: true } });
    const home = reduceInkTuiInput(left, { key: { home: true } });
    const right = reduceInkTuiInput(home, { key: { rightArrow: true } });
    const end = reduceInkTuiInput(right, { key: { end: true } });

    expect(left.cursorIndex).toBe(4);
    expect(home.cursorIndex).toBe(0);
    expect(right.cursorIndex).toBe(1);
    expect(end.cursorIndex).toBe(5);
    expect(end.draft).toBe("hello");
  });

  it("inserts typed text at the prompt cursor position", () => {
    const state = { draft: "helo", cursorIndex: 3, messages: [], shouldExit: false };
    const next = reduceInkTuiInput(state, { input: "l" });

    expect(next.draft).toBe("hello");
    expect(next.cursorIndex).toBe(4);
  });

  it("deletes around the prompt cursor position", () => {
    const state = { draft: "hello", cursorIndex: 2, messages: [], shouldExit: false };
    const backspace = reduceInkTuiInput(state, { key: { backspace: true } });
    const deleted = reduceInkTuiInput(state, { key: { delete: true } });

    expect(backspace.draft).toBe("hllo");
    expect(backspace.cursorIndex).toBe(1);
    expect(deleted.draft).toBe("helo");
    expect(deleted.cursorIndex).toBe(2);
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

    expect(rendered.cursor).toBe("▌");
    expect(rendered.visibleText).toBe("▌Type a message");
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
    expect(rendered.cursor).toBe("▌");
    expect(rendered.visibleText).toBe("hello▌");
    expect(rendered.placeholder).toBe("");
    expect(rendered.empty).toBe(false);
  });

  it("renders the visible cursor in the middle of draft text", () => {
    const rendered = renderInkPromptInput({
      draft: "hello",
      cursorIndex: 2,
      placeholder: "Type a message",
      showCursor: true,
    });

    expect(rendered.visibleText).toBe("he▌llo");
    expect(rendered.beforeCursor).toBe("he");
    expect(rendered.afterCursor).toBe("llo");
  });

  it("includes the cursor in the rendered Ink prompt output", () => {
    const snapshot = buildInkTuiPreviewSnapshot();
    const output = renderToString(
      React.createElement(InkTuiPreviewApp, {
        snapshot: {
          ...snapshot,
          prompt: { ...snapshot.prompt, value: "hello" },
        },
        interactive: true,
      }),
    );

    expect(output).toContain("hello▌");
  });

  it("includes a middle cursor in the rendered Ink prompt output", () => {
    const snapshot = buildInkTuiPreviewSnapshot();
    const output = renderToString(
      React.createElement(InkTuiPreviewApp, {
        snapshot: {
          ...snapshot,
          prompt: { ...snapshot.prompt, value: "hello", cursorIndex: 2 },
        },
        interactive: true,
      }),
    );

    expect(output).toContain("he▌llo");
  });
});
