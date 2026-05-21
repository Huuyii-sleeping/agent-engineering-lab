import { strict as assert } from "node:assert";
import { buildPromptEnvelope } from "../../src/prompt/builder.js";
import { inspectPromptSource } from "../../src/prompt/inspect.js";

const envelope = buildPromptEnvelope({
  core: "core prompt",
  overrideSystemPrompt: "override prompt",
  appendSystemPrompts: ["append prompt"],
  tools: ["tool guidance"],
  skills: [],
  rules: [],
  userContext: "user context",
  memoryContext: "memory context",
  compactSummary: "compact summary",
  dynamicMessages: ["runtime reminder"],
});

assert.match(envelope.primarySystemPrompt, /override prompt/);
assert.doesNotMatch(envelope.primarySystemPrompt, /core prompt/);
assert.deepEqual(envelope.stableSections.map((section) => section.cachePolicy), [
  "cacheable",
  "cacheable",
  "cacheable",
]);
assert.deepEqual(envelope.dynamicSections.map((section) => section.id), [
  "user_context",
  "memory",
  "compact_summary",
  "runtime_reminder",
]);
assert.ok(envelope.dynamicSections.every((section) => section.cachePolicy === "ephemeral"));
assert.ok(envelope.stableSections.every((section) => section.estimatedTokens > 0));

const dump = inspectPromptSource({
  core: "core prompt",
  tools: [],
  skills: [],
  rules: [],
  compactSummary: "compact summary",
  dynamicMessages: ["runtime reminder secret"],
});

assert.ok(dump.sections.some((section) => section.id === "compact_summary"));
assert.ok(dump.sections.some((section) => section.cachePolicy === "ephemeral"));
assert.ok(dump.supplementalSystemMessages.join("\n").includes("protected"));
assert.ok(!dump.supplementalSystemMessages.join("\n").includes("runtime reminder secret"));

console.log("PRD-73 prompt runtime smoke passed");

