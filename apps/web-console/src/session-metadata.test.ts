import { describe, expect, it, vi } from "vitest";
import {
  hideSession,
  isSessionHidden,
  readSessionMetadata,
  renameSession,
  sessionDisplayTitle,
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
