import type { Viewport } from "@xyflow/react";

/** React Flow 画布容器尺寸。 */
export type SopCanvasSize = {
  width: number;
  height: number;
};

/**
 * 画布容器改变尺寸时平移视口，使原来的视觉中心仍位于新容器中心。
 * 缩放值保持不变，避免折叠侧栏或打开运行面板时打断用户的缩放状态。
 */
export function centerViewportAfterResize(viewport: Viewport, previous: SopCanvasSize, next: SopCanvasSize): Viewport {
  return {
    x: viewport.x + (next.width - previous.width) / 2,
    y: viewport.y + (next.height - previous.height) / 2,
    zoom: viewport.zoom,
  };
}
