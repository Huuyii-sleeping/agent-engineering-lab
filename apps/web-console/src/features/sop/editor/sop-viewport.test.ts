import { describe, expect, it } from "vitest";
import { centerViewportAfterResize } from "./sop-viewport";

describe("centerViewportAfterResize", () => {
  it("画布扩展时保持缩放并将视觉中心移动到新中心", () => {
    expect(centerViewportAfterResize(
      { x: 120, y: 30, zoom: 0.9 },
      { width: 674, height: 766 },
      { width: 850, height: 766 },
    )).toEqual({ x: 208, y: 30, zoom: 0.9 });
  });

  it("运行面板占用高度时同步上移视口中心", () => {
    expect(centerViewportAfterResize(
      { x: 40, y: 80, zoom: 1.2 },
      { width: 900, height: 700 },
      { width: 900, height: 420 },
    )).toEqual({ x: 40, y: -60, zoom: 1.2 });
  });
});
