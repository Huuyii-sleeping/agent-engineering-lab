import { getSopNodeMeta } from "../../lib/sop-catalog";
import type { NodeConfigInspectorProps } from "../types";

/** 提醒当前仅开放 Authoring，生产能力仍受独立 capability gate 控制。 */
export function StageECapabilityNotice({ type }: { type: string }) {
  const meta = getSopNodeMeta(type);
  return <div className="sop-valid-item warn">{meta.label} 的持久化契约已注册；Mastra Runtime capability 通过独立门槛后才允许生产发布。</div>;
}

/** 阶段 E Runtime 开放前的只读契约检查器。 */
export function StageEContractInspector({ node }: NodeConfigInspectorProps) {
  if (node.kind !== "builtin" || ![
    "parallel",
    "merge",
    "iteration",
    "loop",
    "subworkflow",
    "agent",
    "human-approval",
  ].includes(node.type)) return null;
  return (
    <>
      <StageECapabilityNotice type={node.type} />
      <label className="sop-field">
        <span>当前配置（只读）</span>
        <textarea rows={10} readOnly value={JSON.stringify(node.config, null, 2)} />
      </label>
    </>
  );
}
