import { Handle, Position, type NodeProps } from "@xyflow/react";
import { SOP_TYPE_META } from "../lib/sop-catalog";
import type { SopNodeType } from "../lib/sop-types";

/** React Flow 节点上承载的自定义数据。 */
export type SopFlowData = {
  type: SopNodeType;
  label: string;
  model?: string;
  condition?: string;
  note?: string;
  /* AI 节点 */
  temperature?: number;
  systemPrompt?: string;
  /* 条件节点 */
  threshold?: number;
  operator?: ">=" | "<=" | "==" | "!=" | ">" | "<";
  variable?: string;
  /* 处理节点 */
  steps?: string;
  timeoutMs?: number;
  retries?: number;
  /* 工具调用节点 */
  toolName?: string;
  params?: string;
  /* 开始节点（触发器） */
  trigger?: "manual" | "webhook" | "schedule" | "event";
  webhookPath?: string;
  cronExpr?: string;
  /* 结束节点（输出） */
  outputMode?: "result" | "notify" | "callback" | "store";
  callbackUrl?: string;
  notifyChannel?: string;
};

/**
 * SOP 自定义节点：按类型着色，展示名称与关键标签。
 * Handle 布局（模仿飞书画板）：
 *   start   — 仅底部出口
 *   end     — 仅顶部入口
 *   condition— 顶入口 + 底部双出口(是/否) + 左右出口
 *   其他    — 四边全有(顶=入口,底/左/右=出口)
 */
export function SopNodeView({ data, selected }: NodeProps) {
  const d = data as SopFlowData;
  const meta = SOP_TYPE_META[d.type];
  const Icon = meta.icon;
  const isCondition = d.type === "condition";
  const isStart = d.type === "start";
  const isEnd = d.type === "end";

  return (
    <div className={`sop-node ${selected ? "on" : ""}`} style={{ borderColor: meta.color }}>
      {/* ===== 入口 Handle ===== */}
      {/* 顶部入口（除 start 外所有节点都有） */}
      {!isStart && (
        <Handle type="target" position={Position.Top} id="in-t" className="sop-h sop-h--top" />
      )}
      {/* 左侧入口（非 start/end 的中间节点） */}
      {!isStart && !isEnd && (
        <Handle type="target" position={Position.Left} id="in-l" className="sop-h sop-h--left" />
      )}

      {/* ===== 节点内容 ===== */}
      <div className="sop-node-h" style={{ color: meta.color }}>
        <Icon width={13} height={13} aria-hidden="true" />
        <span>{meta.label}</span>
      </div>

      <div className="sop-node-label">{d.label}</div>

      {d.type === "ai" && d.model ? <div className="sop-node-tag">{d.model}</div> : null}
      {isCondition && d.condition ? <div className="sop-node-tag">if {d.condition}</div> : null}
      {d.note ? <div className="sop-node-note">{d.note}</div> : null}

      {/* ===== 出口 Handle ===== */}

      {/* 右侧出口（非 start/end 中间节点） */}
      {!isStart && !isEnd && (
        <Handle type="source" position={Position.Right} id="out-r" className="sop-h sop-h--right" />
      )}

      {/* 底部出口（end 节点无出口） */}
      {!isEnd && !isCondition && (
        <Handle type="source" position={Position.Bottom} id="out-b" className="sop-h sop-h--bottom" />
      )}

      {/* 条件节点特殊：底部双出口 + 是/否标签 */}
      {isCondition && (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            className="sop-h sop-h--bottom sop-h--cond-yes"
            style={{ left: "30%" }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            className="sop-h sop-h--bottom sop-h--cond-no"
            style={{ left: "70%" }}
          />
          <span className="sop-branch sop-branch--t">是</span>
          <span className="sop-branch sop-branch--f">否</span>
        </>
      )}

      {/* start 节点仅底部单出口 */}
      {isStart && (
        <Handle type="source" position={Position.Bottom} id="start-out" className="sop-h sop-h--bottom" />
      )}
    </div>
  );
}
