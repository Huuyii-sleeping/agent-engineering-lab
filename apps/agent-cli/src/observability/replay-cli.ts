import * as process from "node:process";
import { replayTrace } from "./replay.js";

async function main(): Promise<void> {
  const [, , traceId, mode] = process.argv;
  if (!traceId) {
    console.error("usage: tsx src/observability/replay-cli.ts <trace_id> [live]");
    process.exit(1);
  }
  const dryRun = mode !== "live";
  const result = await replayTrace(traceId, dryRun);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
