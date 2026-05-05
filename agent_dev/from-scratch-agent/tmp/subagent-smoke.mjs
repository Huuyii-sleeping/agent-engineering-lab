import { runToolByName } from "../dist/tools/index.js";

const pretty = (s) => {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
};

const steps = [
  ["subagent_spawn", JSON.stringify({ name: "worker-a" })],
  ["subagent_list", "{}"],
  ["subagent_send", JSON.stringify({ agent_id: 1, prompt: "Say OK" })],
  ["subagent_wait", JSON.stringify({ agent_id: 1, timeout_ms: 1 })],
  ["subagent_list", "{}"],
  ["subagent_close", JSON.stringify({ agent_id: 1 })],
  ["subagent_spawn", JSON.stringify({ name: "worker-b" })],
  ["subagent_close", JSON.stringify({ agent_id: 2 })],
  ["read_file", JSON.stringify({ path: "README.md", limit: 80 })],
  ["bash", JSON.stringify({ command: "echo PRD03_OK" })],
  ["task_list", "{}"],
  ["todo", JSON.stringify({ items: [{ id: "1", text: "smoke", status: "completed" }] })],
];

for (const [name, args] of steps) {
  const out = await runToolByName(name, args);
  console.log(`=== ${name} ===`);
  console.log(pretty(out));
}
