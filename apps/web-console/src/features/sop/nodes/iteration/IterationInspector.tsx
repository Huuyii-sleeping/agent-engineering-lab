import type { NodeConfigInspectorProps } from "../types";
import { StageECapabilityNotice } from "../stage-e/StageEContractInspector";
import { TypedValueOrVariableInput } from "../shared/TypedValueOrVariableInput";

/** Iteration 输入、并发、失败策略与内部 item/index 作用域说明。 */
export function IterationInspector({ node, onChange, availableVariables }: NodeConfigInspectorProps) {
  if (node.kind !== "builtin" || node.type !== "iteration") return null;
  const updateConfig = (config: typeof node.config) => onChange({ ...node, config });
  return (
    <>
      <StageECapabilityNotice type={node.type} />
      <TypedValueOrVariableInput label="迭代数组" value={node.config.items} dataType="array" variables={availableVariables} onChange={(items) => updateConfig({ ...node.config, items })} />
      <div className="sop-variable-scope-card"><strong>内部类型化变量</strong><span><code>item</code> · any</span><span><code>index</code> · integer</span></div>
      <label className="sop-field"><span>最大元素数</span><input type="number" min={1} max={1000} value={node.config.maxItems} onChange={(event) => updateConfig({ ...node.config, maxItems: Math.min(1000, Math.max(1, Number(event.target.value) || 1)) })} /></label>
      <label className="sop-field"><span>最大并发度（1–10）</span><input type="number" min={1} max={10} value={node.config.maxConcurrency} onChange={(event) => updateConfig({ ...node.config, maxConcurrency: Math.min(10, Math.max(1, Number(event.target.value) || 1)) })} /></label>
      <label className="sop-field"><span>失败策略</span><select value={node.config.failurePolicy} onChange={(event) => updateConfig({ ...node.config, failurePolicy: event.target.value as typeof node.config.failurePolicy })}><option value="fail-fast">首次失败即终止</option><option value="continue">跳过失败项继续</option><option value="collect-errors">收集错误结果</option></select></label>
      <label className="sop-field"><span>聚合顺序</span><select value={node.config.aggregation} onChange={(event) => updateConfig({ ...node.config, aggregation: event.target.value as typeof node.config.aggregation })}><option value="ordered">按输入顺序</option><option value="by-index">按 index 输出</option></select></label>
    </>
  );
}
