import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Workflow } from "lucide-react";
import type { SopDraft, SopNodeType } from "../lib/sop-types";
import { SOP_TYPE_META } from "../lib/sop-catalog";
import { validateSop } from "../lib/sop-validate";

const LIST_PALETTE = ["#22c55e", "#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b", "#ec4899"];

function draftAccent(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return LIST_PALETTE[Math.abs(hash) % LIST_PALETTE.length];
}

function timeLabel(value: number): string {
  if (!value) return "未知";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function nodeTypeCount(draft: SopDraft, type: SopNodeType): number {
  return draft.nodes.filter((node) => node.type === type).length;
}

export function SopList({
  drafts,
  query,
  onEdit,
  onNew,
  onDelete,
}: {
  drafts: SopDraft[];
  query: string;
  onEdit: (draft: SopDraft) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const [filter, setFilter] = useState<string>("all");

  const keyword = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    return drafts.filter((draft) => {
      const haystack = `${draft.name} ${draft.summary}`.toLowerCase();
      if (keyword && !haystack.includes(keyword)) return false;
      if (filter === "ai" && nodeTypeCount(draft, "ai") === 0) return false;
      if (filter === "condition" && nodeTypeCount(draft, "condition") === 0) return false;
      if (filter === "empty" && draft.nodes.length === 0) return false;
      return true;
    });
  }, [drafts, keyword, filter]);

  const filterItems = [
    { key: "all", label: "全部", count: drafts.length },
    { key: "ai", label: "含 AI 节点", count: drafts.filter((d) => nodeTypeCount(d, "ai") > 0).length },
    { key: "condition", label: "含条件分支", count: drafts.filter((d) => nodeTypeCount(d, "condition") > 0).length },
    { key: "empty", label: "空白草稿", count: drafts.filter((d) => d.nodes.length === 0).length },
  ];

  return (
    <>
      <div className="section-head">
        <span className="eyebrow">SOP Builder · 流程编排</span>
        <h2 className="h2">用有向无环图编排你的自动化流程</h2>
        <p className="sub">拖拽节点构建 DAG，支持条件分支、AI 节点与工具调用，本地持久化草稿。</p>
      </div>

      <div className="hub">
        <div className="hub-toolbar">
          <div className="hub-filter-group">
            <span className="hub-filter-label">筛选</span>
            <div className="hub-filter-pills">
              {filterItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`hub-pill ${filter === item.key ? "on" : ""}`}
                  onClick={() => setFilter(item.key)}
                >
                  {item.label}
                  <span className="c">{item.count}</span>
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-primary btn-sm" onClick={onNew}>
            <Plus aria-hidden="true" /> 新建流程
          </button>
        </div>

        <div className="skill-grid">
          {filtered.length === 0 ? (
            <div className="skill-empty">
              没有匹配的流程{keyword ? `（关键词“${query}”）` : ""}
            </div>
          ) : (
            filtered.map((draft) => {
              const accent = draftAccent(draft.id);
              const validation = validateSop(draft);
              return (
                <article key={draft.id} className="skill">
                  <div className="skill-accent" style={{ background: accent }} aria-hidden="true" />
                  <div className="skill-top">
                    <span
                      className="icon-box skill-icon"
                      style={{ color: accent, borderColor: `${accent}33`, background: `${accent}12` }}
                      aria-hidden="true"
                    >
                      <Workflow width={18} height={18} />
                    </span>
                    <div>
                      <div className="skill-name">{draft.name}</div>
                      <div className="skill-ver">{draft.nodes.length} 个节点 · {draft.edges.length} 条连线</div>
                    </div>
                    <span style={{ marginLeft: "auto" }}>
                      {validation.ok ? (
                        <span className="pill green"><span className="d" />可运行</span>
                      ) : (
                        <span className="pill amber"><span className="d" />待完善</span>
                      )}
                    </span>
                  </div>

                  <div className="skill-meta">
                    <span className="chip" style={{ color: accent, borderColor: `${accent}44`, background: `${accent}14` }}>
                      {SOP_TYPE_META.start.label} → {SOP_TYPE_META.end.label}
                    </span>
                    {nodeTypeCount(draft, "ai") > 0 ? <span className="chip">{nodeTypeCount(draft, "ai")} AI</span> : null}
                    {nodeTypeCount(draft, "condition") > 0 ? <span className="chip">{nodeTypeCount(draft, "condition")} 分支</span> : null}
                  </div>

                  <div className="skill-desc">{draft.summary || "（暂无描述）"}</div>

                  <div className="skill-foot">
                    <span>更新 {timeLabel(draft.updatedAt)}</span>
                    <span className="sp" />
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDelete(draft.id)}>
                      <Trash2 aria-hidden="true" /> 删除
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(draft)}>
                      <Pencil aria-hidden="true" /> 编辑
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
