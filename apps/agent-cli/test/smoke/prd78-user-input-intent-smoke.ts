import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";

import { ObservabilityService } from "../../src/services/observability-service.js";
import { recordQueryLoopStart } from "../../src/runtime/query-engine-round.js";

const observabilityDir = path.join(process.cwd(), ".observability");

async function cleanObservability(): Promise<void> {
  await rm(observabilityDir, { recursive: true, force: true }).catch(() => {});
}

async function main(): Promise<void> {
  await cleanObservability();

  await recordQueryLoopStart({
    observabilityService: new ObservabilityService(),
    traceId: "trace_prd78_user_input_intent",
    round: 1,
    latestUserInput: "又失败了，继续执行，不要停。",
  });

  const eventsRaw = await readFile(path.join(observabilityDir, "events.jsonl"), "utf8");
  const event = JSON.parse(eventsRaw.trim()) as {
    kind?: string;
    payload?: {
      userInputIntent?: {
        negativeFeedback?: boolean;
        keepGoing?: boolean;
        categories?: string[];
      };
    };
  };

  assert.equal(event.kind, "loop_start");
  assert.equal(event.payload?.userInputIntent?.negativeFeedback, true);
  assert.equal(event.payload?.userInputIntent?.keepGoing, true);
  assert.deepEqual(event.payload?.userInputIntent?.categories, ["negative_feedback", "keep_going"]);
  assert.equal(JSON.stringify(event.payload?.userInputIntent).includes("又失败了"), false);
  assert.equal(JSON.stringify(event.payload?.userInputIntent).includes("继续执行"), false);

  await cleanObservability();
  console.log("PRD-78 user input intent smoke passed");
}

main().catch(async (error) => {
  await cleanObservability();
  console.error("PRD-78 user input intent smoke failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
