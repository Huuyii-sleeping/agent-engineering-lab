import { workspaceTabs } from "../../app/navigation";
import type { WorkspaceTab } from "../../app/types";

export function WorkspaceTabs({ activeView, onChange }: { activeView: WorkspaceTab; onChange: (view: WorkspaceTab) => void }) {
  return (
    <header className="workspace-tabs" aria-label="工作台标签">
      <div className="workspace-tabs-copy">
        <span>Workspace</span>
        <strong>{workspaceTabs.find((tab) => tab.view === activeView)?.label ?? "工作台"}</strong>
      </div>
      <div className="workspace-tab-list" role="tablist">
        {workspaceTabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.view === activeView;
          return (
            <button
              className={`workspace-tab ${active ? "workspace-tab--active" : ""}`}
              key={tab.view}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.view)}
              title={tab.description}
            >
              <Icon size={16} strokeWidth={2.2} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
}
