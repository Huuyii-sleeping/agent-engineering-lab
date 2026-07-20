import { useEffect, useState } from "react";
import { SopList } from "../../../features/sop/components/SopList";
import { SopCanvas } from "../../../features/sop/components/SopCanvas";
import { createSopDraft, listSopDrafts, writeSopDrafts } from "../../../features/sop/lib/sop-store";
import type { SopDraft } from "../../../features/sop/lib/sop-types";

/** SOP Builder 入口：列表页（默认）与 DAG 画布编辑器二选一。 */
export function SopBuilderView({ active, query }: { active: boolean; query: string }) {
  const [drafts, setDrafts] = useState<SopDraft[]>([]);
  const [mode, setMode] = useState<"list" | "canvas">("list");
  const [editing, setEditing] = useState<SopDraft | null>(null);

  useEffect(() => {
    if (active) {
      setDrafts(listSopDrafts(window.localStorage));
    }
  }, [active]);

  function persist(next: SopDraft[]): void {
    setDrafts(next);
    writeSopDrafts(window.localStorage, next);
  }

  function handleEdit(draft: SopDraft): void {
    setEditing(draft);
    setMode("canvas");
  }

  function handleNew(): void {
    setEditing(createSopDraft());
    setMode("canvas");
  }

  function handleSave(draft: SopDraft): void {
    const exists = drafts.some((item) => item.id === draft.id);
    persist(exists ? drafts.map((item) => (item.id === draft.id ? draft : item)) : [draft, ...drafts]);
    setMode("list");
    setEditing(null);
  }

  function handleDelete(id: string): void {
    persist(drafts.filter((item) => item.id !== id));
  }

  function handleBack(): void {
    setDrafts(listSopDrafts(window.localStorage));
    setMode("list");
    setEditing(null);
  }

  if (mode === "canvas" && editing) {
    return (
      <section className={`view-pad builder-canvas ${active ? "" : "view-hide"}`} data-view="builder" data-mode="canvas">
        <SopCanvas key={editing.id} initial={editing} onSave={handleSave} onBack={handleBack} />
      </section>
    );
  }

  return (
    <section className={`view-pad ${active ? "" : "view-hide"}`} data-view="builder">
      <SopList drafts={drafts} query={query} onEdit={handleEdit} onNew={handleNew} onDelete={handleDelete} />
    </section>
  );
}
