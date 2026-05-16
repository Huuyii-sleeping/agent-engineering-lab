import { describe, expect, it } from "vitest";
import {
  buildScopePreview,
  sanitizeAndRedactText,
  sanitizeMcpIdentifier,
  stableScopeHash,
} from "../../../src/security/data-hygiene.js";

describe("security/data-hygiene", () => {
  it("sanitizes hidden characters and redacts secret-like values", () => {
    const raw = 'token=sk-12345678901234567890\u202E api_key:"super-secret"';

    expect(sanitizeAndRedactText(raw)).toBe('token=[REDACTED_SECRET] api_key:"[REDACTED_SECRET]"');
  });

  it("builds stable hashes independent of object key order", () => {
    const left = stableScopeHash("write_file", {
      path: "tmp/a.txt",
      options: { mode: "0644", overwrite: true },
    });
    const right = stableScopeHash("write_file", {
      options: { overwrite: true, mode: "0644" },
      path: "tmp/a.txt",
    });

    expect(left).toBe(right);
  });

  it("builds redacted scope previews and hides mcp aliases", () => {
    expect(
      buildScopePreview("write_file", {
        path: "tmp/a.txt",
        content: "password=hunter2",
      }),
    ).toContain("[REDACTED_SECRET]");
    expect(sanitizeMcpIdentifier("mcp__private_demo__echo")).toBe("[mcp_tool]");
  });
});
