import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type ConnectionLineComponentProps,
  type EdgeProps,
} from "@xyflow/react";
import { getSopArrowAngle } from "../lib/sop-edge-geometry";

/**
 * 自定义边：使用 React Flow 路径计算，并在目标 Handle 中心手绘箭头。
 *
 * 为什么不用 <marker>：
 *   React Flow 的 BaseEdge 内部对 markerEnd 的挂载有系统性偏移，
 *   无论 refX 设何值都无法消除路径终点与 Handle 视觉圆心间的间距。
 *   手绘箭头可以直接把尖点画在 (targetX, targetY)，零偏差。
 */

/**
 * 在 (cx, cy) 处绘制一个等腰三角形箭头。
 * 尖端位于该坐标，尾部朝向相反方向。
 *
 * 参数：
 *   cx/cy — 箭头尖端坐标（即 Handle 圆心）
 *   angle  — 指向角（度）
 *   len    — 箭头全长（px）
 *   width  — 箭头底边宽度的一半（px）
 *   fill   — 填充色
 */
function ArrowHead({
  cx,
  cy,
  angle,
  len = 11,
  halfWidth = 5.5,
  fill,
}: {
  cx: number;
  cy: number;
  angle: number;
  len?: number;
  halfWidth?: number;
  fill: string;
}) {
  /* 三角形顶点：尖端在原点朝右，底边在左侧 */
  const d = `M ${-len},-${halfWidth} L 0,0 L ${len === 0 ? 0 : -len},${halfWidth} Z`;
  return (
    <path
      d={d}
      className="sop-edge-arrow"
      fill={fill}
      transform={`translate(${cx}, ${cy}) rotate(${angle})`}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  主组件                                                            */
/* ------------------------------------------------------------------ */

export function SopEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  sourceHandleId,
  label,
  selected,
}: EdgeProps) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 16,
  });

  const isFalse = sourceHandleId === "false";
  const stroke = selected ? "#ffffff" : isFalse ? "#f43f5e" : "#64748b";
  const width = selected ? 2.4 : 1.6;
  const glowColor = "#ffffff";

  /* 箭头尖端精确落在 Handle 锚点 (targetX, targetY) */
  const arrowAngle = getSopArrowAngle(targetPosition);

  return (
    <>
      {/* 选中柔光底层 */}
      {selected && (
        <path
          d={path}
          fill="none"
          stroke={glowColor}
          strokeWidth={7}
          strokeOpacity={0.16}
          style={{ filter: "blur(3px)" }}
        />
      )}
      {/* 连线本体（无 markerEnd） */}
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke,
          strokeWidth: width,
          transition: "stroke 120ms ease, stroke-width 120ms ease",
        }}
      />
      {/* 手绘箭头：尖端 = targetX/Y = Handle 圆心 */}
      <ArrowHead
        cx={targetX}
        cy={targetY}
        angle={arrowAngle}
        fill={stroke}
      />
      {typeof label === "string" && label.trim() ? (
        <EdgeLabelRenderer>
          <div
            className="sop-edge-label nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

/** 拖拽连线时的预览边，与最终边复用相同路径和箭头方向。 */
export function SopConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
  connectionLineStyle,
  connectionStatus,
}: ConnectionLineComponentProps) {
  const [path] = getSmoothStepPath({
    sourceX: fromX,
    sourceY: fromY,
    targetX: toX,
    targetY: toY,
    sourcePosition: fromPosition,
    targetPosition: toPosition,
    borderRadius: 16,
  });
  const stroke = connectionStatus === "invalid" ? "#f43f5e" : "#22c55e";

  return (
    <>
      <path
        className="sop-connection-line"
        d={path}
        fill="none"
        style={{ ...connectionLineStyle, stroke }}
      />
      <ArrowHead
        cx={toX}
        cy={toY}
        angle={getSopArrowAngle(toPosition)}
        fill={stroke}
        len={10}
        halfWidth={5}
      />
    </>
  );
}
