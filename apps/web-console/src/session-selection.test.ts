import { describe, expect, it } from "vitest";
import { resolveActiveSessionId } from "./session-selection";

describe("session selection helpers", () => {
  it("keeps the active session when it is still visible", () => {
    expect(resolveActiveSessionId("s2", [{ id: "s1" }, { id: "s2" }])).toBe("s2");
  });

  it("falls back to the first visible session when the active one is hidden", () => {
    expect(resolveActiveSessionId("s3", [{ id: "s1" }, { id: "s2" }])).toBe("s1");
  });

  it("clears active session when all sessions are hidden", () => {
    expect(resolveActiveSessionId("s3", [])).toBeNull();
  });
});
