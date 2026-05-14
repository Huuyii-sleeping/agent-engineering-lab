import { describe, expect, it } from "vitest";
import { CliTranscriptBrowserStore, createCliTranscriptEntries } from "../../src/cli-transcript.js";

describe("cli-transcript", () => {
  const messages = [
    { role: "user", content: "first prompt" },
    { role: "assistant", content: "first answer" },
    { role: "user", content: "second prompt" },
    { role: "assistant", content: "hook blocked during run" },
  ];

  it("creates stable transcript entries", () => {
    const entries = createCliTranscriptEntries(messages);

    expect(entries[0]).toMatchObject({ index: 1, role: "user", preview: "first prompt" });
    expect(entries[3]).toMatchObject({ index: 4, role: "assistant", charCount: 23 });
  });

  it("browses tail, history, search, and peek per session", () => {
    const store = new CliTranscriptBrowserStore(2);

    const tail = store.tail("s01", messages);
    const history = store.history("s01", messages, "prev");
    const first = store.history("s01", messages, "first");
    const last = store.history("s01", messages, "last");
    const search = store.search("s01", messages, "hook");
    const searchPrev = store.moveSearch("s01", messages, "prev");
    const peek = store.peek("s01", messages, 4);
    const peekPrev = store.peekRelative("s01", messages, "prev");

    expect(tail).toMatchObject({ mode: "tail", start: 3, end: 4, total: 4 });
    expect(history).toMatchObject({ mode: "history", start: 1, end: 2, total: 4 });
    expect(first).toMatchObject({ mode: "history", start: 1, end: 2, total: 4 });
    expect(last).toMatchObject({ mode: "history", start: 3, end: 4, total: 4 });
    expect(search).toMatchObject({ mode: "search", query: "hook", total: 4, selectedIndex: 0 });
    expect(searchPrev).toMatchObject({ mode: "search", query: "hook", total: 4, selectedIndex: 0 });
    expect(search.mode === "search" ? search.matches[0]?.index : 0).toBe(4);
    expect(peek).toMatchObject({ mode: "peek", total: 4, entry: { index: 4 }, hasPrev: true, hasNext: false });
    expect(peekPrev).toMatchObject({ mode: "peek", total: 4, entry: { index: 3 } });
  });
});
