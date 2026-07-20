/** 画布节点在 flow 坐标系中的尺寸。 */
export interface SopNodeSize {
  w: number;
  h: number;
}

/** 参与智能吸附计算的节点盒。 */
export interface SopNodeBox {
  id: string;
  position: { x: number; y: number };
  size: SopNodeSize;
}

/** React Flow 当前视口变换。 */
export interface SopViewport {
  x: number;
  y: number;
  zoom: number;
}

/** 智能对齐辅助线，坐标均为画布容器本地像素。 */
export interface SopAlignmentGuide {
  axis: "x" | "y";
  value: number;
  start: number;
  end: number;
  kind: "center" | "edge";
}

/** 智能吸附结果；dx / dy 为屏幕本地像素偏移。 */
export interface SopAlignmentResult {
  dx: number;
  dy: number;
  guides: SopAlignmentGuide[];
}

interface LocalRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  cx: number;
  cy: number;
}

type AnchorName = "start" | "center" | "end";

interface SnapCandidate {
  axis: "x" | "y";
  anchor: AnchorName;
  delta: number;
  target: number;
  referenceId: string;
}

/** 默认吸附半径，使用屏幕像素保证不同缩放比例下手感一致。 */
export const SOP_SNAP_THRESHOLD_PX = 12;

const GUIDE_PADDING_PX = 14;

function toLocalRect(
  position: { x: number; y: number },
  size: SopNodeSize,
  viewport: SopViewport,
): LocalRect {
  const left = position.x * viewport.zoom + viewport.x;
  const top = position.y * viewport.zoom + viewport.y;
  const width = size.w * viewport.zoom;
  const height = size.h * viewport.zoom;
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    cx: left + width / 2,
    cy: top + height / 2,
  };
}

function anchorValue(rect: LocalRect, axis: "x" | "y", anchor: AnchorName): number {
  if (axis === "x") {
    if (anchor === "start") return rect.left;
    if (anchor === "end") return rect.right;
    return rect.cx;
  }
  if (anchor === "start") return rect.top;
  if (anchor === "end") return rect.bottom;
  return rect.cy;
}

function findBestCandidate(
  axis: "x" | "y",
  dragged: LocalRect,
  references: { id: string; rect: LocalRect }[],
  threshold: number,
): SnapCandidate | null {
  let best: SnapCandidate | null = null;

  for (const reference of references) {
    for (const anchor of ["center", "start", "end"] as const) {
      const delta = anchorValue(reference.rect, axis, anchor) - anchorValue(dragged, axis, anchor);
      if (Math.abs(delta) > threshold) continue;

      const candidate: SnapCandidate = {
        axis,
        anchor,
        delta,
        target: anchorValue(reference.rect, axis, anchor),
        referenceId: reference.id,
      };
      if (!best) {
        best = candidate;
        continue;
      }

      const distance = Math.abs(candidate.delta);
      const bestDistance = Math.abs(best.delta);
      const centerWinsTie = distance === bestDistance
        && candidate.anchor === "center"
        && best.anchor !== "center";
      const stableNodeOrder = distance === bestDistance
        && candidate.anchor === best.anchor
        && candidate.referenceId.localeCompare(best.referenceId) < 0;
      if (distance < bestDistance || centerWinsTie || stableNodeOrder) best = candidate;
    }
  }

  return best;
}

function moveRect(rect: LocalRect, dx: number, dy: number): LocalRect {
  return {
    left: rect.left + dx,
    right: rect.right + dx,
    cx: rect.cx + dx,
    top: rect.top + dy,
    bottom: rect.bottom + dy,
    cy: rect.cy + dy,
  };
}

function referencesOnGuide(
  candidate: SnapCandidate,
  references: { id: string; rect: LocalRect }[],
): LocalRect[] {
  return references
    .filter(({ rect }) =>
      (["start", "center", "end"] as const).some(
        (anchor) => Math.abs(anchorValue(rect, candidate.axis, anchor) - candidate.target) < 0.5,
      ),
    )
    .map(({ rect }) => rect);
}

/**
 * 计算节点拖动时的最佳双轴吸附结果。
 * 每个轴只选择一个最近候选，中心对齐在等距情况下优先，避免多条辅助线闪烁。
 */
export function getSopAlignmentSnap(
  draggedPosition: { x: number; y: number },
  draggedSize: SopNodeSize,
  otherNodes: SopNodeBox[],
  viewport: SopViewport,
  threshold = SOP_SNAP_THRESHOLD_PX,
): SopAlignmentResult {
  if (otherNodes.length === 0) return { dx: 0, dy: 0, guides: [] };

  const draggedRect = toLocalRect(draggedPosition, draggedSize, viewport);
  const references = otherNodes.map((node) => ({
    id: node.id,
    rect: toLocalRect(node.position, node.size, viewport),
  }));
  const xCandidate = findBestCandidate("x", draggedRect, references, threshold);
  const yCandidate = findBestCandidate("y", draggedRect, references, threshold);
  const dx = xCandidate?.delta ?? 0;
  const dy = yCandidate?.delta ?? 0;
  const snappedRect = moveRect(draggedRect, dx, dy);
  const guides: SopAlignmentGuide[] = [];

  if (xCandidate) {
    const alignedRects = referencesOnGuide(xCandidate, references);
    guides.push({
      axis: "x",
      value: xCandidate.target,
      start: Math.min(snappedRect.top, ...alignedRects.map((rect) => rect.top)) - GUIDE_PADDING_PX,
      end: Math.max(snappedRect.bottom, ...alignedRects.map((rect) => rect.bottom)) + GUIDE_PADDING_PX,
      kind: xCandidate.anchor === "center" ? "center" : "edge",
    });
  }

  if (yCandidate) {
    const alignedRects = referencesOnGuide(yCandidate, references);
    guides.push({
      axis: "y",
      value: yCandidate.target,
      start: Math.min(snappedRect.left, ...alignedRects.map((rect) => rect.left)) - GUIDE_PADDING_PX,
      end: Math.max(snappedRect.right, ...alignedRects.map((rect) => rect.right)) + GUIDE_PADDING_PX,
      kind: yCandidate.anchor === "center" ? "center" : "edge",
    });
  }

  return { dx, dy, guides };
}
