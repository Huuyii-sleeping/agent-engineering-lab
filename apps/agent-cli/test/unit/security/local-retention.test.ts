import { describe, expect, it } from "vitest";
import {
  LOCAL_ARTIFACT_CONTRACTS,
  buildArtifactMetadata,
  retentionDaysFor,
} from "../../../src/security/local-retention.js";

describe("security/local-retention", () => {
  it("defines explicit contracts for runtime, telemetry, and audit artifact families", () => {
    expect(LOCAL_ARTIFACT_CONTRACTS.session).toMatchObject({
      retentionClass: "protected_runtime_state",
      exportMode: "protected_export",
      deleteMode: "explicit_delete",
    });
    expect(LOCAL_ARTIFACT_CONTRACTS.observability_event).toMatchObject({
      retentionClass: "operational_telemetry",
      cleanupTriggers: expect.arrayContaining(["on_write", "on_startup"]),
    });
    expect(LOCAL_ARTIFACT_CONTRACTS.audit_event).toMatchObject({
      retentionClass: "security_audit",
      exportMode: "protected_export",
      deleteMode: "explicit_delete",
    });
  });

  it("uses the declared retention days when building metadata", () => {
    const createdAt = 1_000;
    const metadata = buildArtifactMetadata("security_record", createdAt);

    expect(retentionDaysFor("security_record")).toBe(30);
    expect(metadata).toMatchObject({
      kind: "security_record",
      createdAt,
      expiresAt: createdAt + 30 * 24 * 60 * 60 * 1000,
    });
  });
});
