import { runToolByName } from "../dist/tools/index.js";

const pretty = (s) => {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
};

const outputs = [];

const spawn = await runToolByName("subagent_spawn", JSON.stringify({ name: "writer-prd04" }));
outputs.push(["spawn", spawn]);

const send = await runToolByName(
  "subagent_send",
  JSON.stringify({
    agent_id: 1,
    prompt:
      "Use write_file to create tmp/prd04_subagent_output.md with content '# PRD04\\n\\nSubagent tool execution works.' then reply with a short confirmation.",
  }),
);
outputs.push(["send", send]);

const wait = await runToolByName("subagent_wait", JSON.stringify({ agent_id: 1, timeout_ms: 45000 }));
outputs.push(["wait", wait]);

const list = await runToolByName("subagent_list", "{}");
outputs.push(["list", list]);

for (const [name, output] of outputs) {
  console.log(`=== ${name} ===`);
  console.log(pretty(output));
}
