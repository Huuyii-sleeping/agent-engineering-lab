import type { NodeConfigInspectorProps } from "../types";
import { StageECapabilityNotice } from "../stage-e/StageEContractInspector";

/** Merge 上游 Parallel 关联与确定性聚合策略编辑器。 */
export function MergeInspector({ node, onChange, scopeNodes }: NodeConfigInspectorProps) {
  if (node.kind !== "builtin" || node.type !== "merge") return null;
  const parallelNodes = scopeNodes.filter((candidate) => candidate.kind === "builtin" && candidate.type === "parallel");
  const selectedExists = parallelNodes.some((candidate) => candidate.id === node.config.parallelNodeId);
  const updateConfig = (config: typeof node.config) => onChange({ ...node, config });
  return (
    <>
      <StageECapabilityNotice type={node.type} />
      <label className="sop-field"><span>关联 Parallel</span><select value={node.config.parallelNodeId} onChange={(event) => updateConfig({ ...node.config, parallelNodeId: event.target.value })}>
        <option value="">选择同一作用域中的 Parallel</option>
        {!selectedExists && node.config.parallelNodeId ? <option value={node.config.parallelNodeId}>未找到：{node.config.parallelNodeId}</option> : null}
        {parallelNodes.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label} · {candidate.id}</option>)}
      </select></label>
      {parallelNodes.length === 0 ? <div className="sop-valid-item warn">当前作用域还没有 Parallel 节点。先添加 Parallel，再配置 Merge 关联。</div> : null}
      <label className="sop-field"><span>聚合顺序</span><select value={node.config.strategy} onChange={(event) => updateConfig({ ...node.config, strategy: event.target.value as typeof node.config.strategy })}><option value="ordered">按分支声明顺序</option><option value="by-branch">按 branch id 输出</option></select></label>
      <label className="sop-check-field"><input type="checkbox" checked={node.config.allowMissing} onChange={(event) => updateConfig({ ...node.config, allowMissing: event.target.checked })} /><span>允许缺失或跳过的分支结果</span></label>
    </>
  );
}
