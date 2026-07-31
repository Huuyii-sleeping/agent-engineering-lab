import { Plus, Trash2 } from "lucide-react";
import type { NodeConfigInspectorProps } from "../types";
import { StageECapabilityNotice } from "../stage-e/StageEContractInspector";
import { appendParallelBranch, removeParallelBranch, renameParallelBranch } from "./parallel-config";

/** Parallel 分支、并发和失败策略编辑器。 */
export function ParallelInspector({ node, onChange }: NodeConfigInspectorProps) {
  if (node.kind !== "builtin" || node.type !== "parallel") return null;
  const updateConfig = (config: typeof node.config) => onChange({ ...node, config });
  return (
    <>
      <StageECapabilityNotice type={node.type} />
      <div className="sop-field-group-title">静态分支</div>
      <div className="sop-branch-editor-list">
        {node.config.branches.map((branch) => (
          <div className="sop-branch-editor" key={branch.id}>
            <div className="sop-branch-editor-head">
              <code>{branch.id}</code>
              <button type="button" aria-label={`删除分支 ${branch.label}`} disabled={node.config.branches.length <= 2} onClick={() => updateConfig(removeParallelBranch(node.config, branch.id))}><Trash2 aria-hidden="true" /></button>
            </div>
            <label className="sop-field"><span>分支名称</span><input value={branch.label} onChange={(event) => updateConfig(renameParallelBranch(node.config, branch.id, event.target.value))} /></label>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-ghost btn-sm sop-add-config" onClick={() => updateConfig(appendParallelBranch(node.config))}><Plus aria-hidden="true" />添加分支</button>
      <label className="sop-field"><span>最大并发度（1–10）</span><input type="number" min={1} max={10} value={node.config.maxConcurrency} onChange={(event) => updateConfig({ ...node.config, maxConcurrency: Math.min(10, Math.max(1, Number(event.target.value) || 1)) })} /></label>
      <label className="sop-field"><span>失败策略</span><select value={node.config.failurePolicy} onChange={(event) => updateConfig({ ...node.config, failurePolicy: event.target.value as typeof node.config.failurePolicy })}><option value="fail-fast">首次失败即终止</option><option value="collect">收集全部结果</option></select></label>
    </>
  );
}
