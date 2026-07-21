import { describe, expect, it } from "vitest";
import { createContentHash, stableSerialize } from "../../../src/serialization/stable.js";

describe("stableSerialize", () => {
  it("对不同键顺序生成相同内容", async () => {
    const left = { b: 2, a: { y: true, x: "value" } };
    const right = { a: { x: "value", y: true }, b: 2 };
    expect(stableSerialize(left)).toBe(stableSerialize(right));
    expect(await createContentHash(left)).toBe(await createContentHash(right));
  });

  it("遇到不可序列化值时尽早失败", () => {
    expect(() => stableSerialize({ value: Number.NaN })).toThrow("非有限数字");
  });
});
