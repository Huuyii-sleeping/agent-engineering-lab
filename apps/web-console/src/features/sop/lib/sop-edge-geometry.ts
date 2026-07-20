import { Position } from "@xyflow/react";

/**
 * 返回箭头尖端朝向目标节点的 SVG 旋转角度。
 * 箭头原始形状朝右，因此目标 Handle 在顶部时需要向下指向节点内部。
 */
export function getSopArrowAngle(position: Position): number {
  switch (position) {
    case Position.Top:
      return 90;
    case Position.Bottom:
      return -90;
    case Position.Left:
      return 0;
    case Position.Right:
      return 180;
    default:
      return 0;
  }
}
