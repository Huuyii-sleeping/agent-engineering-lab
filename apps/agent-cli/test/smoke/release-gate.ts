import { spawn } from "node:child_process";
import path from "node:path";
import {
  findReleaseArtifactResidues,
  getReleaseGateStages,
  removeReleaseArtifactResidues,
  type ReleaseGateStage,
} from "../harness/release-gate.js";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const agentCliRoot = path.resolve(repoRoot, "apps", "agent-cli");

function runCommand(stage: Extract<ReleaseGateStage, { command: string[] }>): Promise<void> {
  const [command, ...args] = stage.command;
  if (!command) {
    throw new Error(`release gate stage ${stage.name} has no command`);
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal
            ? `release gate stage ${stage.name} terminated by ${signal}`
            : `release gate stage ${stage.name} exited with code ${code}`,
        ),
      );
    });
  });
}

async function runArtifactResidueCheck(stageName: string): Promise<void> {
  const residues = await findReleaseArtifactResidues(agentCliRoot);
  if (residues.length === 0) {
    return;
  }
  throw new Error(
    [`release gate stage ${stageName} found runtime artifact residues:`, ...residues].join("\n"),
  );
}

async function main(): Promise<void> {
  await removeReleaseArtifactResidues(agentCliRoot);
  for (const stage of getReleaseGateStages()) {
    console.log(`\n[release gate] ${stage.name}`);
    try {
      if (stage.kind === "artifact-residue-check") {
        await runArtifactResidueCheck(stage.name);
      } else {
        await runCommand(stage);
      }
      await removeReleaseArtifactResidues(agentCliRoot);
    } catch (error) {
      console.error(`[release gate] failed at ${stage.name}`);
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
      return;
    }
  }
  console.log("\n[release gate] all stages passed");
}

await main();
