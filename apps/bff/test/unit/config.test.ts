import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSkillHubDataRoot } from "../../src/config.js";

describe("bff config", () => {
  it("resolves the shared SkillHub data root from environment", () => {
    expect(resolveSkillHubDataRoot({ SKILLHUB_DATA_ROOT: " /var/lib/skillhub " }, "/repo/apps/bff")).toBe(
      "/var/lib/skillhub",
    );
  });

  it("uses a deterministic local SkillHub data root by default", () => {
    expect(resolveSkillHubDataRoot({}, "/repo/apps/bff")).toBe(join("/repo/apps/bff", ".data", "skills"));
  });
});
