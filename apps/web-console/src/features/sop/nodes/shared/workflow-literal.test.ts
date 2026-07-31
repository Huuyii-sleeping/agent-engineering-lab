import { describe, expect, it } from "vitest";
import { formatWorkflowLiteral, parseWorkflowLiteral } from "./workflow-literal";

describe("workflow-literal", () => {
  it("解析类型化数组、对象、整数和布尔值", () => {
    expect(parseWorkflowLiteral('[1, 2]', "array")).toEqual([1, 2]);
    expect(parseWorkflowLiteral('{"ok":true}', "object")).toEqual({ ok: true });
    expect(parseWorkflowLiteral("42", "integer")).toBe(42);
    expect(parseWorkflowLiteral("false", "boolean")).toBe(false);
  });

  it("拒绝与声明类型不匹配的字面量", () => {
    expect(() => parseWorkflowLiteral("1.5", "integer")).toThrow("整数");
    expect(() => parseWorkflowLiteral("{}", "array")).toThrow("JSON 数组");
    expect(formatWorkflowLiteral({ ok: true }, "object")).toContain('"ok": true');
  });
});
