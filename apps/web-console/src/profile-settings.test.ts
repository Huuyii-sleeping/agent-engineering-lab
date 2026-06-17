import { describe, expect, it } from "vitest";
import { defaultUserProfile, normalizeUserProfile } from "./api";

describe("normalizeUserProfile", () => {
  it("returns defaults for invalid profile values", () => {
    expect(normalizeUserProfile(null)).toEqual(defaultUserProfile);
    expect(normalizeUserProfile({ displayName: " ", description: "" })).toEqual(defaultUserProfile);
  });

  it("trims and preserves valid profile text", () => {
    expect(normalizeUserProfile({ displayName: "  花忆  ", description: "  本地 Agent 操作员  " })).toEqual({
      displayName: "花忆",
      description: "本地 Agent 操作员",
    });
  });

  it("limits text length for display stability", () => {
    const profile = normalizeUserProfile({
      displayName: "A".repeat(40),
      description: "B".repeat(80),
    });
    expect(profile.displayName).toHaveLength(24);
    expect(profile.description).toHaveLength(48);
  });
});
