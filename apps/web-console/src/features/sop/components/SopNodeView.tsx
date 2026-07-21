import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { getSopNodeMeta } from "../lib/sop-catalog";
import type { SopFlowData } from "../editor/sop-flow-adapter";

function portOffset(index: number, count: number): string {
  return `${((index + 1) / (count + 1)) * 100}%`;
}

/** React Flow 节点只负责将 workflow-core 的类型化端口渲染为 Handle。 */
function SopNodeViewComponent({ data, selected }: NodeProps) {
  const { node, collapsed, issueCount } = data as unknown as SopFlowData;
  const meta = getSopNodeMeta(node.type);
  const Icon = meta.icon;
  const inputs = node.ports.inputs;
  const outputs = node.ports.outputs;

  return (
    <div className={`sop-node ${selected ? "on" : ""}`} style={{ borderColor: meta.color }}>
      {inputs.map((port, index) => (
        <Handle
          key={`input-${port.id}`}
          type="target"
          position={Position.Top}
          id={port.id}
          className="sop-h sop-h--top"
          style={{ left: portOffset(index, inputs.length) }}
          title={`${port.name}${port.required ? "（必填）" : ""} · ${port.dataType}`}
        />
      ))}

      <div className="sop-node-h" style={{ color: meta.color }}>
        <Icon width={13} height={13} aria-hidden="true" />
        <span>{meta.label}</span>
      </div>
      <div className="sop-node-label">{node.label}</div>
      {issueCount ? <div className="sop-node-issue">{issueCount}</div> : null}
      {!collapsed && node.kind === "builtin" && node.type === "llm" ? <div className="sop-node-tag">{node.config.model}</div> : null}
      {!collapsed && node.kind === "builtin" && node.type === "condition" ? <div className="sop-node-tag">if {node.config.expression}</div> : null}
      {!collapsed && node.description ? <div className="sop-node-note">{node.description}</div> : null}
      {node.kind === "unknown" ? <div className="sop-node-tag">未安装节点</div> : null}

      {outputs.map((port, index) => (
        <span key={`output-label-${port.id}`} className="sop-branch" style={{ left: portOffset(index, outputs.length) }}>
          {port.name}
        </span>
      ))}
      {outputs.map((port, index) => (
        <Handle
          key={`output-${port.id}`}
          type="source"
          position={Position.Bottom}
          id={port.id}
          className="sop-h sop-h--bottom"
          style={{ left: portOffset(index, outputs.length) }}
          title={`${port.name} · ${port.dataType}`}
        />
      ))}
    </div>
  );
}

/** 仅在节点数据或选择状态变化时重渲染。 */
export const SopNodeView = memo(SopNodeViewComponent);
