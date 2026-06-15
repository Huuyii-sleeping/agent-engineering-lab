import { describe, expect, it, vi } from "vitest";
import {
  hideSession,
  isSessionHidden,
  readSessionMetadata,
  renameSession,
  sessionDisplayTitle,
  summarizeSessionTitle,
  toggleSessionPinned,
  writeSessionMetadata,
} from "./session-metadata";

describe("session metadata helpers", () => {
  it("reads invalid or missing metadata as an empty map", () => {
    expect(readSessionMetadata(null)).toEqual({});
    expect(readSessionMetadata({ getItem: () => "not json", setItem: vi.fn() })).toEqual({});
  });

  it("stores local title, pin, and hidden state", () => {
    let metadata = renameSession({}, "s123456789", "  需求讨论  ");
    metadata = toggleSessionPinned(metadata, "s123456789");
    metadata = hideSession(metadata, "s123456789");

    expect(sessionDisplayTitle({ id: "s123456789" }, metadata)).toBe("需求讨论");
    expect(metadata.s123456789.pinned).toBe(true);
    expect(isSessionHidden("s123456789", metadata)).toBe(true);
  });

  it("builds display title from the first user message when not renamed", () => {
    const title = summarizeSessionTitle([
      { role: "assistant", content: "你好" },
      { role: "user", content: "  我想学习 go 语言，你能给我一个比较好的建议吗，最好包含路线和项目  " },
    ]);

    expect(title).toBe("我想学习 go 语言，你能给我一个比较好的建议吗...");
    expect(sessionDisplayTitle({ id: "s123456789", messageCount: 2 }, {}, title)).toBe(title);
  });

  it("prefers renamed title and uses new conversation for empty sessions", () => {
    const metadata = renameSession({}, "s123456789", "自定义标题");

    expect(sessionDisplayTitle({ id: "s123456789", messageCount: 2 }, metadata, "首条消息")).toBe("自定义标题");
    expect(sessionDisplayTitle({ id: "empty", messageCount: 0 }, {}, null)).toBe("新对话");
  });

  it("persists metadata as JSON", () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    };

    writeSessionMetadata(storage, { s1: { title: "A", pinned: true } });

    expect(storage.setItem).toHaveBeenCalledWith(
      "agent-web-console-session-metadata-v2",
      JSON.stringify({ s1: { title: "A", pinned: true } }),
    );
  });
});
