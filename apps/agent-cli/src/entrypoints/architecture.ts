import * as process from "node:process";
import { renderCliArchitecture } from "../cli/ui.js";

export async function runArchitectureOverview(
  io: { output: NodeJS.WritableStream } = { output: process.stdout },
): Promise<void> {
  io.output.write(`${renderCliArchitecture()}\n`);
}
