import { useEffect, useState } from "react";
import type { AvailableVariable, ValueOrVariable, WorkflowDataType } from "@orbit/workflow-core";
import { VariableSelector } from "./VariableSelector";
import { formatWorkflowLiteral, parseWorkflowLiteral } from "./workflow-literal";

/** 按 WorkflowDataType 编辑字面量或显式变量引用。 */
export function TypedValueOrVariableInput<T = unknown>({ label, value, dataType, variables, onChange }: {
  label: string;
  value: ValueOrVariable<T>;
  dataType: WorkflowDataType;
  variables: AvailableVariable[];
  onChange: (value: ValueOrVariable<T>) => void;
}) {
  const [text, setText] = useState(() => value.kind === "literal" ? formatWorkflowLiteral(value.value, dataType) : "");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (value.kind === "literal") setText(formatWorkflowLiteral(value.value, dataType));
    setError(null);
  }, [dataType, value]);
  const variableOptions = variables.filter((item) => dataType === "any" || item.dataType === "any" || item.dataType === dataType);
  const updateLiteral = (next: string) => {
    setText(next);
    try {
      onChange({ kind: "literal", value: parseWorkflowLiteral(next, dataType) as T });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  return (
    <div className="sop-field">
      <span>{label}</span>
      <select value={value.kind} onChange={(event) => {
        if (event.target.value === "variable") {
          const first = variableOptions[0];
          if (first) onChange({ kind: "variable", ref: first.ref });
          else setError(`当前没有 ${dataType} 类型的可用变量。`);
        } else {
          const initial = dataType === "array" ? "[]" : dataType === "object" ? "{}" : dataType === "boolean" ? "false" : dataType === "null" ? "null" : "";
          updateLiteral(initial);
        }
      }}><option value="literal">固定值</option><option value="variable">变量引用</option></select>
      {value.kind === "variable"
        ? <VariableSelector variables={variableOptions} value={value.ref} onChange={(ref) => onChange({ kind: "variable", ref })} />
        : dataType === "object" || dataType === "array"
          ? <textarea rows={4} value={text} onChange={(event) => updateLiteral(event.target.value)} />
          : dataType === "boolean"
            ? <select value={text} onChange={(event) => updateLiteral(event.target.value)}><option value="false">false</option><option value="true">true</option></select>
            : <input value={text} onChange={(event) => updateLiteral(event.target.value)} />}
      {error ? <div className="sop-valid-item err">{error}</div> : null}
    </div>
  );
}
