import type { WorkflowDiagnostic } from "../contracts/diagnostics.js";
import type { WorkflowJsonSchema } from "../contracts/json-schema.js";

function matchesType(value: unknown, type: string): boolean {
  if (type === "array") return Array.isArray(value);
  if (type === "object") return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "null") return value === null;
  return typeof value === type;
}

function fieldDiagnostic(nodeId: string, fieldPath: string[], message: string): WorkflowDiagnostic {
  return { code: "compile.schema", severity: "error", message, location: { kind: "field", nodeId, fieldPath } };
}

/** 按 workflow-core 的最小 JSON Schema 子集校验节点配置。 */
export function validateWorkflowJsonSchema(value: unknown, schema: WorkflowJsonSchema, nodeId: string, path: string[] = []): WorkflowDiagnostic[] {
  const diagnostics: WorkflowDiagnostic[] = [];
  const allowedTypes = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (allowedTypes.length > 0 && !allowedTypes.some((type) => matchesType(value, type))) {
    return [fieldDiagnostic(nodeId, path, `字段 ${path.join(".") || "config"} 类型无效，期望 ${allowedTypes.join(" | ")}。`)];
  }
  if (schema.enum && !schema.enum.some((item) => Object.is(item, value))) diagnostics.push(fieldDiagnostic(nodeId, path, `字段 ${path.join(".") || "config"} 不在允许值范围内。`));
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) diagnostics.push(fieldDiagnostic(nodeId, path, `字段 ${path.join(".")} 不能小于 ${schema.minimum}。`));
    if (schema.maximum !== undefined && value > schema.maximum) diagnostics.push(fieldDiagnostic(nodeId, path, `字段 ${path.join(".")} 不能大于 ${schema.maximum}。`));
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, index) => diagnostics.push(...validateWorkflowJsonSchema(item, schema.items!, nodeId, [...path, String(index)])));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const required of schema.required ?? []) {
      if (!(required in record)) diagnostics.push(fieldDiagnostic(nodeId, [...path, required], `缺少必填字段 ${[...path, required].join(".")}。`));
    }
    for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
      if (key in record) diagnostics.push(...validateWorkflowJsonSchema(record[key], childSchema, nodeId, [...path, key]));
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties ?? {}));
      for (const key of Object.keys(record)) if (!allowed.has(key)) diagnostics.push(fieldDiagnostic(nodeId, [...path, key], `字段 ${[...path, key].join(".")} 不被允许。`));
    }
  }
  return diagnostics;
}
