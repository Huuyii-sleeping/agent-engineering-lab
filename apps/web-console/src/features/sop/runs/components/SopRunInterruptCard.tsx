import { useEffect, useRef, useState } from "react";
import { Check, Clock3, PauseCircle, XCircle } from "lucide-react";
import {
  validateWorkflowJsonSchema,
  type ApprovalDecisionAction,
  type WorkflowJsonSchema,
  type WorkflowRunSnapshot,
} from "@orbit/workflow-core";

export type SopRunInterruptDecision = {
  interruptId: string;
  action: ApprovalDecisionAction;
  data: Record<string, unknown>;
  idempotencyKey: string;
};

function schemaType(schema: WorkflowJsonSchema): string {
  if (Array.isArray(schema.type)) return schema.type.find((type) => type !== "null") ?? "string";
  return schema.type ?? "string";
}

function parseEnumValue(raw: string, fieldName: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`${fieldName} 的枚举值无效。`);
  }
}

function parseDecisionValue(raw: string, fieldName: string, schema: WorkflowJsonSchema): unknown {
  if (!raw.trim()) return undefined;
  if (schema.enum) return parseEnumValue(raw, fieldName);
  const type = schemaType(schema);
  if (type === "number" || type === "integer") {
    const value = Number(raw);
    if (!Number.isFinite(value) || (type === "integer" && !Number.isInteger(value))) {
      throw new Error(`${fieldName} 必须是${type === "integer" ? "整数" : "数字"}。`);
    }
    return value;
  }
  if (type === "boolean") {
    if (raw === "true") return true;
    if (raw === "false") return false;
    throw new Error(`${fieldName} 必须是 true 或 false。`);
  }
  if (type === "object" || type === "array") {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      throw new Error(`${fieldName} 必须是合法的 JSON。`);
    }
  }
  if (type === "null") return null;
  return raw;
}

/** 按 Human Approval decisionSchema 解析并校验当前表单。 */
export function collectInterruptDecisionData(
  schema: WorkflowJsonSchema,
  values: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const required = new Set(schema.required ?? []);
  for (const [fieldName, fieldSchema] of Object.entries(schema.properties ?? {})) {
    const value = parseDecisionValue(values[fieldName] ?? "", fieldName, fieldSchema);
    if (value === undefined) {
      if (required.has(fieldName)) throw new Error(`${fieldName} 是必填决定字段。`);
      continue;
    }
    result[fieldName] = value;
  }
  const diagnostic = validateWorkflowJsonSchema(result, schema, "human-approval-decision")[0];
  if (diagnostic) throw new Error(diagnostic.message);
  return result;
}

function displayValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "—";
  return JSON.stringify(value, null, 2);
}

function enumOptionValue(value: unknown): string {
  return JSON.stringify(value);
}

function DecisionField(props: {
  name: string;
  schema: WorkflowJsonSchema;
  required: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  const type = schemaType(props.schema);
  const label = props.schema.title || props.name;
  const multiline = type === "object" || type === "array";
  return (
    <label className="sop-interrupt-field">
      <span>{label}{props.required ? <b>*</b> : null}<code>{type}</code></span>
      {props.schema.description ? <small>{props.schema.description}</small> : null}
      {props.schema.enum ? (
        <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
          <option value="">请选择</option>
          {props.schema.enum.map((value) => {
            const optionValue = enumOptionValue(value);
            return <option key={optionValue} value={optionValue}>{String(value)}</option>;
          })}
        </select>
      ) : type === "boolean" ? (
        <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
          <option value="">未设置</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : multiline ? (
        <textarea rows={2} value={props.value} placeholder={`${type} JSON`} onChange={(event) => props.onChange(event.target.value)} />
      ) : (
        <input
          type={type === "number" || type === "integer" ? "number" : "text"}
          step={type === "integer" ? 1 : undefined}
          min={props.schema.minimum}
          max={props.schema.maximum}
          value={props.value}
          placeholder={`填写${label}`}
          onChange={(event) => props.onChange(event.target.value)}
        />
      )}
    </label>
  );
}

function newIdempotencyKey(interruptId: string): string {
  if (!globalThis.crypto?.randomUUID) throw new Error("当前浏览器无法生成决定幂等标识。");
  return `${interruptId}:${globalThis.crypto.randomUUID()}`;
}

/** 只在当前 SOP 测试 run waiting 时出现的 Human Approval interrupt 卡片。 */
export function SopRunInterruptCard(props: {
  run: WorkflowRunSnapshot | null;
  decisionPending: boolean;
  onResume: (decision: SopRunInterruptDecision) => void;
}) {
  const waiting = props.run?.status === "waiting" ? props.run.waiting?.waiting : undefined;
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const idempotencyKeys = useRef(new Map<string, string>());

  useEffect(() => {
    setValues({});
    setError("");
    idempotencyKeys.current.clear();
  }, [waiting?.interruptId]);

  if (!props.run || !waiting || waiting.kind !== "approval") return null;

  const submit = (action: ApprovalDecisionAction) => {
    setError("");
    try {
      const data = collectInterruptDecisionData(waiting.decisionSchema, values);
      const decisionIdentity = `${action}:${JSON.stringify(data)}`;
      let idempotencyKey = idempotencyKeys.current.get(decisionIdentity);
      if (!idempotencyKey) {
        idempotencyKey = newIdempotencyKey(waiting.interruptId);
        idempotencyKeys.current.set(decisionIdentity, idempotencyKey);
      }
      props.onResume({ interruptId: waiting.interruptId, action, data, idempotencyKey });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const required = new Set(waiting.decisionSchema.required ?? []);
  const fields = Object.entries(waiting.decisionSchema.properties ?? {});
  return (
    <aside className="sop-run-interrupt" aria-label="当前运行等待人工决定">
      <div className="sop-interrupt-rail" aria-hidden="true"><PauseCircle /></div>
      <div className="sop-interrupt-body">
        <header className="sop-interrupt-head">
          <div><strong>当前运行已暂停</strong><span>Human Approval · 只影响此 run</span></div>
          <time><Clock3 aria-hidden="true" />截止 {new Date(waiting.deadline).toLocaleString("zh-CN", { hour12: false })}</time>
        </header>
        <div className="sop-interrupt-identity">
          <span>run</span><code>{props.run.id}</code>
          <span>interrupt</span><code>{waiting.interruptId}</code>
        </div>
        {waiting.displayFields.length > 0 ? <dl className="sop-interrupt-display">
          {waiting.displayFields.map((field) => <div key={field.id}><dt>{field.label}</dt><dd>{displayValue(field.value)}</dd></div>)}
        </dl> : null}
        {fields.length > 0 ? <div className="sop-interrupt-fields">
          {fields.map(([name, schema]) => <DecisionField
            key={name}
            name={name}
            schema={schema}
            required={required.has(name)}
            value={values[name] ?? ""}
            onChange={(value) => setValues((current) => ({ ...current, [name]: value }))}
          />)}
        </div> : null}
        {error ? <div className="sop-interrupt-error" role="alert">{error}</div> : null}
        <div className="sop-interrupt-actions">
          <button type="button" className="reject" disabled={props.decisionPending} onClick={() => submit("reject")}><XCircle aria-hidden="true" />拒绝并继续</button>
          <button type="button" className="approve" disabled={props.decisionPending} onClick={() => submit("approve")}><Check aria-hidden="true" />{props.decisionPending ? "正在恢复" : "同意并继续"}</button>
        </div>
      </div>
    </aside>
  );
}
