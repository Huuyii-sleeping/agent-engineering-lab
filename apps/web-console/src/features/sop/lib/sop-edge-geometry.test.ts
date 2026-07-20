import { describe, expect, it } from "vitest";
import { Position } from "@xyflow/react";
import { getSopArrowAngle } from "./sop-edge-geometry";

describe("getSopArrowAngle", () => {
  it.each([
    [Position.Top, 90],
    [Position.Bottom, -90],
    [Position.Left, 0],
    [Position.Right, 180],
  ])("让 %s 方向的箭头朝向目标节点", (position, angle) => {
    expect(getSopArrowAngle(position)).toBe(angle);
  });
});
