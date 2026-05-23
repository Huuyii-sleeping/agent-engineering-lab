import { strict as assert } from "node:assert";
import { buildPromptEnvelope } from "../../src/prompt/builder.js";

const longIndex = Array.from({ length: 160 }, (_, index) => `memory-line-${index + 1}`).join("\n");

const envelope = buildPromptEnvelope({
  core: "core prompt",
  tools: [],
  skills: [],
  rules: [],
  agentMemory: {
    agentType: "reviewer",
    scope: "project",
    mode: "read_only",
    memoryDir: ".agent/agent-memory/reviewer",
    entrypoint: "MEMORY.md",
    currentIndex: longIndex,
  },
});

assert.match(envelope.primarySystemPrompt, /memory-line-120/);
assert.doesNotMatch(envelope.primarySystemPrompt, /memory-line-121/);
assert.match(envelope.primarySystemPrompt, /Agent memory index truncated/);
assert.match(envelope.primarySystemPrompt, /retainedLines=120/);

console.log("PRD-76 memory prompt boundary smoke passed");
