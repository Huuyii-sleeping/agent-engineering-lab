import type { WorkflowDataType } from "@orbit/workflow-core";

/** 将类型化 Workflow 字面量格式化为 inspector 文本。 */
export function formatWorkflowLiteral(value: unknown, dataType: WorkflowDataType): string {
  if (dataType === "string") return typeof value === "string" ? value : String(value ?? "");
  if (dataType === "boolean") return value === true ? "true" : "false";
  if (dataType === "object" || dataType === "array") return JSON.stringify(value ?? (dataType === "array" ? [] : {}), null, 2);
  if (dataType === "null") return "null";
  return value == null ? "" : String(value);
}

/** 按声明数据类型解析 inspector 字面量，格式错误时明确抛出。 */
export function parseWorkflowLiteral(text: string, dataType: WorkflowDataType): unknown {
  if (dataType === "string" || dataType === "binary" || dataType === "any") return text;
  if (dataType === "boolean") {
    if (text === "true") return true;
    if (text === "false") return false;
    throw new TypeError("布尔值必须是 true 或 false。");
  }
  if (dataType === "number" || dataType === "integer") {
    const value = Number(text);
    if (!Number.isFinite(value) || (dataType === "integer" && !Number.isInteger(value))) throw new TypeError(dataType === "integer" ? "请输入整数。" : "请输入有效数字。");
    return value;
  }
  if (dataType === "null") {
    if (text.trim() !== "null") throw new TypeError("null 类型只能填写 null。");
    return null;
  }
  const value = JSON.parse(text) as unknown;
  if (dataType === "array" && !Array.isArray(value)) throw new TypeError("请输入 JSON 数组。");
  if (dataType === "object" && (!value || typeof value !== "object" || Array.isArray(value))) throw new TypeError("请输入 JSON 对象。");
  return value;
}
