import { describe, expect, it } from "vitest";
import { settingsSectionFromHash } from "./settings-route";

describe("settingsSectionFromHash", () => {
  it("returns the matching settings section from supported hashes", () => {
    expect(settingsSectionFromHash("#settings/profile")).toBe("profile");
    expect(settingsSectionFromHash("#settings/preferences")).toBe("preferences");
    expect(settingsSectionFromHash("#settings/system")).toBe("system");
  });

  it("rejects unsupported settings hashes", () => {
    expect(settingsSectionFromHash("")).toBeNull();
    expect(settingsSectionFromHash("#settings")).toBeNull();
    expect(settingsSectionFromHash("#settings/billing")).toBeNull();
    expect(settingsSectionFromHash("#chat")).toBeNull();
  });
});
