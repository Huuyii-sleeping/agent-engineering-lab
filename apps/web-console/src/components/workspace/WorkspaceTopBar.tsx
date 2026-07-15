import { Plus, Search } from "lucide-react";

export function WorkspaceTopBar({
  title,
  sub,
  primary,
  query,
  onQueryChange,
  onPrimary,
}: {
  title: string;
  sub: string;
  primary: string;
  query: string;
  onQueryChange: (value: string) => void;
  onPrimary: () => void;
}) {
  return (
    <header className="topbar">
      <div>
        <div className="top-title">{title}</div>
        <div className="top-sub">{sub}</div>
      </div>
      <div className="top-sp" />
      <label className="search">
        <Search aria-hidden="true" />
        <input
          value={query}
          placeholder="搜索会话、技能或 Agent"
          onChange={(event) => onQueryChange(event.currentTarget.value)}
        />
      </label>
      <button type="button" className="btn btn-primary" onClick={onPrimary}>
        <Plus aria-hidden="true" />
        <span>{primary}</span>
      </button>
    </header>
  );
}
