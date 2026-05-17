import { describe, expect, it } from "vitest";
import { buildUserDataGovernanceReport } from "../../../src/governance/user-data.js";

describe("governance/user-data", () => {
  it("builds the unified user-data inventory with eight compared surfaces", () => {
    const report = buildUserDataGovernanceReport();

    expect(report.reference).toContain("02-user-data-and-usage.md");
    expect(report.surfaces).toHaveLength(8);
    expect(report.statusLabels.reserved_gap).toBe("保留缺口");
  });

  it("marks current local/runtime surfaces and reserved gaps distinctly", () => {
    const report = buildUserDataGovernanceReport();
    const telemetry = report.surfaces.find((surface) => surface.id === "telemetry");
    const memory = report.surfaces.find((surface) => surface.id === "memory");
    const account = report.surfaces.find((surface) => surface.id === "account_identity");
    const sharing = report.surfaces.find((surface) => surface.id === "explicit_sharing_and_training");

    expect(telemetry).toMatchObject({
      status: "partial",
      boundary: "mixed",
    });
    expect(telemetry?.sources.join(" ")).toContain(".observability");
    expect(memory).toMatchObject({
      status: "partial",
      boundary: "local_only",
    });
    expect(account).toMatchObject({
      status: "reserved_gap",
      defaultState: "not_supported",
    });
    expect(sharing?.notes.join(" ")).toContain("训练改进");
  });
});
