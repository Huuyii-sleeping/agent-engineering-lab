import type { SopAlignmentGuide } from "../../lib/sop-alignment";

/** 节点吸附时的中心线、边缘线和双轴锁定点。 */
export function SopAlignmentOverlay({ guides }: { guides: SopAlignmentGuide[] }) {
  const vertical = guides.find((line) => line.axis === "x");
  const horizontal = guides.find((line) => line.axis === "y");
  if (guides.length === 0) return null;
  return (
    <svg className="sop-align-svg" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 10, overflow: "visible" }}>
      {guides.map((line, index) => line.axis === "x"
        ? <line key={`x-${index}`} className={`sop-align-line ${line.kind}`} x1={line.value} y1={line.start} x2={line.value} y2={line.end} />
        : <line key={`y-${index}`} className={`sop-align-line ${line.kind}`} x1={line.start} y1={line.value} x2={line.end} y2={line.value} />)}
      {vertical && horizontal ? <circle className="sop-align-lock" cx={vertical.value} cy={horizontal.value} r={3.5} /> : null}
    </svg>
  );
}
