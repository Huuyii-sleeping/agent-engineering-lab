import { ArrowLeft, Box, ChevronRight, Workflow } from "lucide-react";
import type { SopScopeCrumb } from "../sop-subgraph-adapter";

/** 在同一画布中显示并切换顶层 Workflow 与容器子图作用域。 */
export function SopContainerScopeBar({ crumbs, onNavigate, onExit }: {
  crumbs: SopScopeCrumb[];
  onNavigate: (path: string[]) => void;
  onExit: () => void;
}) {
  const active = crumbs.at(-1)!;
  const nested = crumbs.length > 1;
  return (
    <nav className={`sop-scope-bar ${nested ? "is-nested" : ""}`} aria-label="流程编辑作用域">
      <div className="sop-scope-context">
        <button type="button" className="sop-scope-back" disabled={!nested} onClick={onExit} aria-label="返回上层流程">
          <ArrowLeft aria-hidden="true" />
        </button>
        <span className="sop-scope-kicker">编辑作用域</span>
        <div className="sop-scope-crumbs">
          {crumbs.map((crumb, index) => {
            const current = index === crumbs.length - 1;
            return (
              <span key={`${crumb.nodeId ?? "root"}-${index}`} className="sop-scope-crumb">
                {index > 0 ? <ChevronRight aria-hidden="true" /> : null}
                <button type="button" aria-current={current ? "page" : undefined} disabled={current} onClick={() => onNavigate(crumb.path)}>
                  {index === 0 ? <Workflow aria-hidden="true" /> : <Box aria-hidden="true" />}
                  <span>{index === 0 ? "主流程" : crumb.label}</span>
                </button>
              </span>
            );
          })}
        </div>
      </div>
      <div className="sop-scope-identity">
        <span>{nested ? "容器内部流程" : "顶层编排"}</span>
        <code>{active.subgraphId ?? "workflow-root"}</code>
      </div>
    </nav>
  );
}
