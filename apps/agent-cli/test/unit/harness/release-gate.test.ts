import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findReleaseArtifactResidues,
  getReleaseGateStages,
  removeReleaseArtifactResidues,
  RELEASE_ARTIFACT_PATHS,
} from "../../harness/release-gate.js";

describe("harness/release-gate", () => {
  it("defines named local production validation stages", () => {
    const stages = getReleaseGateStages();

    expect(stages.map((stage) => stage.name)).toEqual([
      "lint",
      "harness",
      "unit",
      "build",
      "security-smoke",
      "memory-smoke",
      "observability-smoke",
      "delivery-smoke",
      "model-policy-smoke",
      "service-api-smoke",
      "daemon-smoke",
      "regression-smoke",
      "hooks-smoke",
      "recovery-smoke",
      "scheduler-smoke",
      "worktree-closeout-smoke",
      "mcp-smoke",
      "openspec-validate",
      "artifact-residue-check",
    ]);

    expect(stages.find((stage) => stage.name === "harness")?.command).toEqual([
      "pnpm.cmd",
      "--dir",
      "apps/agent-cli",
      "run",
      "test:harness",
    ]);
    expect(stages.find((stage) => stage.name === "build")?.command).toEqual([
      "pnpm.cmd",
      "build",
    ]);
    expect(stages.find((stage) => stage.name === "openspec-validate")?.command).toEqual([
      "openspec.cmd",
      "validate",
      "--all",
    ]);
  });

  it("checks only managed runtime artifact paths", () => {
    expect(RELEASE_ARTIFACT_PATHS).toEqual([
      ".tasks",
      ".team",
      ".worktrees",
      ".transcripts",
      "tmp",
      ".memory",
      ".audit",
      ".observability",
      ".security",
      ".runtime",
    ]);
  });

  it("returns no residues when managed artifact paths do not exist", async () => {
    const root = path.join(tmpdir(), `agent-release-gate-empty-${Date.now()}`);
    await mkdir(root, { recursive: true });
    try {
      await expect(findReleaseArtifactResidues(root)).resolves.toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns managed artifact residues with absolute paths", async () => {
    const root = path.join(tmpdir(), `agent-release-gate-dirty-${Date.now()}`);
    const auditPath = path.join(root, ".audit");
    const observabilityPath = path.join(root, ".observability");
    await mkdir(auditPath, { recursive: true });
    await mkdir(observabilityPath, { recursive: true });

    try {
      await expect(findReleaseArtifactResidues(root)).resolves.toEqual([
        auditPath,
        observabilityPath,
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("removes managed artifact residues without touching unmanaged dotfiles", async () => {
    const root = path.join(tmpdir(), `agent-release-gate-clean-${Date.now()}`);
    const auditPath = path.join(root, ".audit");
    const envPath = path.join(root, ".env.local");
    await mkdir(auditPath, { recursive: true });
    await mkdir(envPath, { recursive: true });

    try {
      await removeReleaseArtifactResidues(root);
      await expect(findReleaseArtifactResidues(root)).resolves.toEqual([]);
      await expect(mkdir(envPath)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
