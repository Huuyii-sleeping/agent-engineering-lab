import { runToolByName } from "../dist/tools/index.js";
import { setCompactRuntimeContext } from "../dist/tools/base.js";

const history = [
  { role: "user", content: "hello" },
  { role: "assistant", content: "world" },
];
setCompactRuntimeContext({ messages: history });

const pretty = (s) => {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
};

const est = await runToolByName("estimate_tokens", "{}");
console.log("=== estimate_tokens ===");
console.log(pretty(est));

const compact = await runToolByName("compact", JSON.stringify({ keep_recent: 1 }));
console.log("=== compact ===");
console.log(pretty(compact));
console.log("=== history_after_compact ===");
console.log(JSON.stringify(history, null, 2));

const bgRun = await runToolByName("background_run", JSON.stringify({ command: "echo BG_OK" }));
console.log("=== background_run ===");
console.log(pretty(bgRun));
const bgTaskId = JSON.parse(bgRun).taskId;

await new Promise((resolve) => setTimeout(resolve, 700));

const bgCheck = await runToolByName("check_background", JSON.stringify({ task_id: bgTaskId }));
console.log("=== check_background ===");
console.log(pretty(bgCheck));
