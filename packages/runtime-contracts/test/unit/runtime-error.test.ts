import { describe, expect, it } from "vitest";
import { RuntimePortError } from "../../src/index.js";

describe("RuntimePortError", () => {
  it("保留稳定 code、message 与 details", () => {
    const error = new RuntimePortError("RUNTIME_NOT_FOUND", "run missing", {
      runId: "run-1",
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: "RuntimePortError",
      code: "RUNTIME_NOT_FOUND",
      message: "run missing",
      details: { runId: "run-1" },
    });
  });
});
