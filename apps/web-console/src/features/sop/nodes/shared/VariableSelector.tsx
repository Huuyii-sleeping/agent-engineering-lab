import { useMemo, useState } from "react";
import type { AvailableVariable, VariableRef } from "@orbit/workflow-core";

/** 支持搜索、类型和作用域分组的变量选择器。 */
export function VariableSelector({ variables, value, onChange }: { variables: AvailableVariable[]; value?: VariableRef; onChange: (value: VariableRef) => void }) {
  const [query, setQuery] = useState("");
  const selected = value ? variables.find((item) => JSON.stringify(item.ref) === JSON.stringify(value)) : undefined;
  const filtered = useMemo(() => variables.filter((item) => `${item.label} ${item.group} ${item.dataType}`.toLowerCase().includes(query.trim().toLowerCase())), [query, variables]);
  return (
    <div className="sop-variable-selector">
      <input value={query} placeholder="搜索变量…" onChange={(event) => setQuery(event.target.value)} />
      <select value={selected?.id ?? ""} onChange={(event) => { const item = variables.find((candidate) => candidate.id === event.target.value); if (item) onChange(item.ref); }}>
        <option value="">选择可用变量…</option>
        {filtered.map((item) => <option key={item.id} value={item.id}>{item.group} · {item.label} · {item.dataType}</option>)}
      </select>
      {value && !selected ? <div className="sop-valid-item err">该变量引用已失效或在当前节点不可达。</div> : null}
    </div>
  );
}
