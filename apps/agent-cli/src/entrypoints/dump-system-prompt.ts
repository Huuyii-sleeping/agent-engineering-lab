import * as process from "node:process";
import { getStaticPromptSource } from "../config.js";
import { renderCliPromptDump } from "../cli/ui.js";
import { inspectPromptSource } from "../prompt/inspect.js";
import { getSkillCatalog } from "../skills/loader.js";

export async function runDumpSystemPrompt(
  io: { output: NodeJS.WritableStream } = { output: process.stdout },
): Promise<void> {
  const catalog = getSkillCatalog();
  io.output.write(
    `${renderCliPromptDump(
      inspectPromptSource(getStaticPromptSource()),
      catalog.loadedNames,
      catalog.missingNames,
    )}\n`,
  );
}
