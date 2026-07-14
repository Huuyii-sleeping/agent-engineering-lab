import type { SVGProps } from "react";

type BrandMarkProps = SVGProps<SVGSVGElement> & { size?: number };

/**
 * Orbit 产品标识：单色几何标。
 * 外环 = 本地运行边界；中心实心节点 = 协调器（Orchestrator）；三个环绕节点 = 被编排的智能体。
 * 通过 currentColor 继承容器颜色，契合黑白基调。
 */
export function BrandMark({ size = 20, ...props }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label="Orbit"
      {...props}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.35" />
      <line x1="12" y1="12" x2="12" y2="3" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="12" y1="12" x2="19.8" y2="16.5" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="12" y1="12" x2="4.2" y2="16.5" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5" />
      <circle cx="12" cy="3" r="2" fill="currentColor" />
      <circle cx="19.8" cy="16.5" r="2" fill="currentColor" />
      <circle cx="4.2" cy="16.5" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" />
    </svg>
  );
}
