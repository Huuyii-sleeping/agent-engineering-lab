import { describe, expect, it } from "vitest";
import {
  buildCliFeatureDisclosureReport,
  listCliFeatureDisclosureEntries,
} from "../../src/cli/features.js";

describe("cli-features", () => {
  it("discloses local feature surfaces and reserved hidden gaps", () => {
    const report = buildCliFeatureDisclosureReport();

    expect(report.summary.hiddenCommands).toBe(0);
    expect(report.summary.easterEggs).toBe(0);
    expect(report.summary.betaOnlySurfaces).toBe(0);
    expect(report.reservedGaps).toContain("hidden commands");
    expect(report.reservedGaps).toContain("hidden easter eggs");
    expect(report.reservedGaps).toContain("beta-only API/header surfaces");
    expect(report.entries.some((entry) => entry.commands.includes("/features"))).toBe(true);
    expect(report.entries.some((entry) => entry.visibility === "hidden" && entry.enabledByDefault)).toBe(false);
  });

  it("keeps registered entries explicit about visibility and stability", () => {
    for (const entry of listCliFeatureDisclosureEntries()) {
      expect(entry.id).toMatch(/^[a-z0-9-]+$/);
      expect(entry.visibility).toMatch(/^(public|internal|hidden)$/);
      expect(entry.stability).toMatch(/^(stable|experimental|reserved_gap)$/);
      expect(entry.commands.length).toBeGreaterThan(0);
    }
  });
});
