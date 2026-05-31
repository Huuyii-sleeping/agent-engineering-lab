import { access, rm } from "node:fs/promises";
import path from "node:path";

export type ReleaseGateStage =
  | {
      name: string;
      command: string[];
      kind?: "command";
    }
  | {
      name: string;
      kind: "artifact-residue-check";
    };

export const RELEASE_ARTIFACT_PATHS = [
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
] as const;

const APP_DIR = "apps/agent-cli";

function appScriptStage(name: string, script: string): ReleaseGateStage {
  return {
    name,
    command: ["pnpm.cmd", "--dir", APP_DIR, "run", script],
  };
}

export function getReleaseGateStages(): ReleaseGateStage[] {
  return [
    appScriptStage("lint", "lint"),
    appScriptStage("harness", "test:harness"),
    appScriptStage("unit", "test"),
    { name: "build", command: ["pnpm.cmd", "build"] },
    appScriptStage("security-smoke", "test:security"),
    appScriptStage("memory-smoke", "test:memory"),
    appScriptStage("observability-smoke", "test:observability"),
    appScriptStage("delivery-smoke", "test:delivery"),
    appScriptStage("model-policy-smoke", "test:model-policy"),
    appScriptStage("service-api-smoke", "test:service-api"),
    appScriptStage("daemon-smoke", "test:daemon"),
    appScriptStage("regression-smoke", "test:regression"),
    appScriptStage("hooks-smoke", "test:hooks"),
    appScriptStage("recovery-smoke", "test:recovery"),
    appScriptStage("scheduler-smoke", "test:scheduler"),
    appScriptStage("worktree-closeout-smoke", "test:worktree-closeout"),
    appScriptStage("mcp-smoke", "test:mcp"),
    { name: "openspec-validate", command: ["openspec.cmd", "validate", "--all"] },
    { name: "artifact-residue-check", kind: "artifact-residue-check" },
  ];
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export async function findReleaseArtifactResidues(agentCliRoot: string): Promise<string[]> {
  const residues: string[] = [];
  for (const artifactPath of RELEASE_ARTIFACT_PATHS) {
    const target = path.resolve(agentCliRoot, artifactPath);
    if (await pathExists(target)) {
      residues.push(target);
    }
  }
  return residues;
}

export async function removeReleaseArtifactResidues(agentCliRoot: string): Promise<void> {
  const base = path.resolve(agentCliRoot);
  for (const artifactPath of RELEASE_ARTIFACT_PATHS) {
    const target = path.resolve(base, artifactPath);
    const relative = path.relative(base, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`refusing to remove path outside agent-cli root: ${target}`);
    }
    await rm(target, { recursive: true, force: true });
  }
}
