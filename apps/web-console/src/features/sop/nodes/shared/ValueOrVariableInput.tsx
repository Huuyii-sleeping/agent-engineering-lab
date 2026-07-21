import type { AvailableVariable, ValueOrVariable } from "@orbit/workflow-core";
import { VariableSelector } from "./VariableSelector";

/** 字面量与显式变量引用的统一编辑器。 */
export function ValueOrVariableInput({ label, value, variables, onChange, multiline = false }: { label: string; value: ValueOrVariable<string>; variables: AvailableVariable[]; onChange: (value: ValueOrVariable<string>) => void; multiline?: boolean }) {
  return (
    <div className="sop-field">
      <span>{label}</span>
      <select value={value.kind} onChange={(event) => onChange(event.target.value === "variable" ? { kind: "variable", ref: variables[0]?.ref ?? { scope: "system", key: "missing" } } : { kind: "literal", value: "" })}><option value="literal">固定值</option><option value="variable">变量引用</option></select>
      {value.kind === "literal" ? (multiline ? <textarea rows={4} value={value.value} onChange={(event) => onChange({ kind: "literal", value: event.target.value })} /> : <input value={value.value} onChange={(event) => onChange({ kind: "literal", value: event.target.value })} />) : <VariableSelector variables={variables} value={value.ref} onChange={(ref) => onChange({ kind: "variable", ref })} />}
    </div>
  );
}
