import { describe, expect, it } from "vitest";
import { cronMatches, isCronValid, parseCron, secondKey } from "../../../src/tools/scheduler-cron.js";

describe("tools/scheduler-cron", () => {
  it("parses 5-field cron with second defaulted to zero", () => {
    expect(parseCron("5 9 * * *")).toEqual(["0", "5", "9", "*", "*", "*"]);
  });

  it("validates ranges and matches second-level expressions", () => {
    expect(isCronValid("*/3 * * * * *")).toBe(true);
    expect(isCronValid("61 * * * * *")).toBe(false);
    expect(cronMatches("*/3 * * * * *", new Date("2026-05-11T09:05:12+08:00"))).toBe(true);
    expect(cronMatches("*/3 * * * * *", new Date("2026-05-11T09:05:13+08:00"))).toBe(false);
  });

  it("builds duplicate-fire keys at second granularity", () => {
    expect(secondKey(new Date("2026-05-11T09:05:12.800+08:00"))).toBe("2026-05-11T09:05:12");
  });
});
