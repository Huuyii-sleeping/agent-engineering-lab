import assert from "node:assert/strict";

import { sanitizeAndRedactValue } from "../../src/security/data-hygiene.js";

const externalPayload = {
  tool: {
    name: "mcp__demo__echo",
    description: "safe\u200B description\u2060",
  },
  output: {
    content: [
      { type: "text", text: "hello\u200C world" },
      { type: "text", text: "token=sk-12345678901234567890\uFEFF" },
    ],
  },
};

const cleaned = sanitizeAndRedactValue(externalPayload);

assert.deepEqual(cleaned, {
  tool: {
    name: "mcp__demo__echo",
    description: "safe description",
  },
  output: {
    content: [
      { type: "text", text: "hello world" },
      { type: "text", text: "token=[REDACTED_SECRET]" },
    ],
  },
});

const serialized = JSON.stringify(cleaned);
for (const hidden of ["\u200B", "\u200C", "\u200D", "\u2060", "\uFEFF"]) {
  assert.equal(serialized.includes(hidden), false);
}

console.log("PRD-77 unicode steganography smoke passed");
