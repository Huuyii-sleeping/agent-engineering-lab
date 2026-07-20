import { describe, expect, it } from "vitest";
import { getSopAlignmentSnap } from "./sop-alignment";

const viewport = { x: 0, y: 0, zoom: 1 };
const size = { w: 100, h: 60 };

describe("getSopAlignmentSnap", () => {
  it("在阈值内吸附到节点中心，并且每个轴只生成一条辅助线", () => {
    const result = getSopAlignmentSnap(
      { x: 108, y: 106 },
      size,
      [{ id: "reference", position: { x: 100, y: 100 }, size }],
      viewport,
    );

    expect(result).toMatchObject({ dx: -8, dy: -6 });
    expect(result.guides).toHaveLength(2);
    expect(result.guides.map((guide) => guide.kind)).toEqual(["center", "center"]);
  });

  it("对齐边缘时使用 edge 辅助线", () => {
    const result = getSopAlignmentSnap(
      { x: 207, y: 180 },
      { w: 140, h: 60 },
      [{ id: "reference", position: { x: 200, y: 100 }, size }],
      viewport,
    );

    expect(result.dx).toBe(-7);
    expect(result.dy).toBe(0);
    expect(result.guides).toEqual([
      expect.objectContaining({ axis: "x", value: 200, kind: "edge" }),
    ]);
  });

  it("超过吸附阈值时不改变节点位置", () => {
    const result = getSopAlignmentSnap(
      { x: 113, y: 113 },
      size,
      [{ id: "reference", position: { x: 100, y: 100 }, size }],
      viewport,
    );

    expect(result).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it("缩放后仍按固定屏幕像素阈值吸附", () => {
    const result = getSopAlignmentSnap(
      { x: 105, y: 100 },
      size,
      [{ id: "reference", position: { x: 100, y: 100 }, size }],
      { x: 20, y: 30, zoom: 2 },
    );

    expect(result.dx).toBe(-10);
    expect(result.dy).toBe(0);
  });
});
