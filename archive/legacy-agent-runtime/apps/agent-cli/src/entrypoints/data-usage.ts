import * as process from "node:process";
import { renderCliUserDataGovernance } from "../cli/ui.js";
import { buildUserDataGovernanceReport } from "../governance/user-data.js";

export async function runUserDataUsageOverview(
  io: { output: NodeJS.WritableStream } = { output: process.stdout },
): Promise<void> {
  io.output.write(`${renderCliUserDataGovernance(buildUserDataGovernanceReport())}\n`);
}
