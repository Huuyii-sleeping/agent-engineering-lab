import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiRequestError,
  autoSaveSopDraft,
  createDraftFromSopVersion,
  createSopDraftRemote,
  deleteSopDraftRemote,
  fetchSopDraft,
  fetchSopDrafts,
  fetchSopVersions,
  importSopDraft,
  publishSopDraft,
  saveSopDraftRemote,
  type SopVersionSummary,
} from "../../../api";
import { SopList } from "../../../features/sop/components/SopList";
import { SopCanvas } from "../../../features/sop/components/SopCanvas";
import { clearSopRecovery, readSopRecovery, writeSopRecovery } from "../../../features/sop/lib/sop-recovery-cache";
import { createSopDraft, listSopDrafts, readLegacySopBackup } from "../../../features/sop/lib/sop-store";
import type { SopDraft } from "../../../features/sop/lib/sop-types";
import { SopLifecyclePanel } from "../../../features/sop/versions/components/SopLifecyclePanel";

type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";
type DraftConflict = { local: SopDraft; remote: SopDraft };
type LifecycleState = "idle" | "loading" | "publishing" | "restoring" | "error";

function conflictFromError(error: unknown, local: SopDraft): DraftConflict | null {
  if (!(error instanceof ApiRequestError) || error.code !== "SOP_REVISION_CONFLICT") return null;
  const current = error.metadata.current;
  if (!current || typeof current !== "object" || (current as { schemaVersion?: unknown }).schemaVersion !== 2) return null;
  return { local, remote: current as SopDraft };
}

/** SOP Builder 入口：BFF 是权威数据源，localStorage 仅保存迁移来源和未提交恢复副本。 */
export function SopBuilderView({ active, query }: { active: boolean; query: string }) {
  const [drafts, setDrafts] = useState<SopDraft[]>([]);
  const [mode, setMode] = useState<"list" | "canvas">("list");
  const [editing, setEditing] = useState<SopDraft | null>(null);
  const [legacyBackup, setLegacyBackup] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState<DraftConflict | null>(null);
  const [canvasGeneration, setCanvasGeneration] = useState(0);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [lifecycleOpen, setLifecycleOpen] = useState(false);
  const [lifecycleState, setLifecycleState] = useState<LifecycleState>("idle");
  const [lifecycleMessage, setLifecycleMessage] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [versions, setVersions] = useState<SopVersionSummary[]>([]);
  const editingRef = useRef<SopDraft | null>(null);
  const autoSaveInFlightRef = useRef(false);
  const pendingAutoSaveRef = useRef<SopDraft | null>(null);

  const adoptEditing = useCallback((draft: SopDraft | null) => {
    editingRef.current = draft;
    setEditing(draft);
  }, []);

  const updateDraftList = useCallback((draft: SopDraft) => {
    setDrafts((current) => [draft, ...current.filter((item) => item.id !== draft.id)].sort((left, right) => right.updatedAt - left.updatedAt));
  }, []);

  const loadDrafts = useCallback(async () => {
    setLoadState("loading");
    setMessage("");
    try {
      let remote = await fetchSopDrafts();
      if (remote.length === 0) {
        const migrationSource = listSopDrafts(window.localStorage);
        for (const draft of migrationSource) {
          try {
            await createSopDraftRemote(draft);
          } catch (error) {
            if (!(error instanceof ApiRequestError) || error.status !== 400) throw error;
          }
        }
        remote = await fetchSopDrafts();
      }
      setDrafts(remote);
      setLegacyBackup(readLegacySopBackup(window.localStorage));
      setLoadState("ready");
    } catch (error) {
      setLoadState("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const loadVersions = useCallback(async (workflowId: string) => {
    setLifecycleState("loading");
    setLifecycleMessage("");
    try {
      setVersions(await fetchSopVersions(workflowId));
      setLifecycleState("idle");
    } catch (error) {
      setLifecycleState("error");
      setLifecycleMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    if (active) void loadDrafts();
  }, [active, loadDrafts]);

  async function handleEdit(draft: SopDraft): Promise<void> {
    setMessage("");
    try {
      const serverDraft = await fetchSopDraft(draft.id);
      const recovery = readSopRecovery(window.localStorage, serverDraft);
      adoptEditing(recovery ? { ...recovery, revision: serverDraft.revision, createdAt: serverDraft.createdAt } : serverDraft);
      setSaveState(recovery ? "error" : "idle");
      setHasPendingChanges(Boolean(recovery));
      setMessage(recovery ? "已恢复浏览器中尚未提交的修改。" : "");
      setConflict(null);
      setLifecycleOpen(false);
      setVersions([]);
      setCanvasGeneration((value) => value + 1);
      setMode("canvas");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleNew(): Promise<void> {
    setMessage("");
    try {
      const created = await createSopDraftRemote(createSopDraft());
      updateDraftList(created);
      adoptEditing(created);
      setSaveState("idle");
      setHasPendingChanges(false);
      setConflict(null);
      setLifecycleOpen(false);
      setVersions([]);
      setCanvasGeneration((value) => value + 1);
      setMode("canvas");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function flushAutoSave(): Promise<void> {
    if (autoSaveInFlightRef.current || conflict) return;
    autoSaveInFlightRef.current = true;
    setSaveState("saving");
    try {
      while (pendingAutoSaveRef.current) {
        const local = pendingAutoSaveRef.current;
        pendingAutoSaveRef.current = null;
        const base = editingRef.current;
        if (!base || base.id !== local.id) break;
        try {
          const saved = await autoSaveSopDraft(base.id, base.revision, local);
          adoptEditing(saved);
          updateDraftList(saved);
          clearSopRecovery(window.localStorage, saved.id);
          setSaveState("saved");
          setHasPendingChanges(false);
          setMessage("已自动保存到本地 BFF");
        } catch (error) {
          const nextConflict = conflictFromError(error, local);
          if (nextConflict) {
            pendingAutoSaveRef.current = null;
            setConflict(nextConflict);
            setSaveState("conflict");
            setMessage("检测到服务端 revision 冲突，请选择恢复方式。 ");
            break;
          }
          setSaveState("error");
          setMessage(error instanceof Error ? error.message : String(error));
          break;
        }
      }
    } finally {
      autoSaveInFlightRef.current = false;
    }
  }

  function handleAutoSave(draft: SopDraft): void {
    pendingAutoSaveRef.current = draft;
    void flushAutoSave();
  }

  function handleRecoveryChange(draft: SopDraft): void {
    const serverRevision = editingRef.current?.revision ?? draft.revision;
    writeSopRecovery(window.localStorage, serverRevision, draft);
    setHasPendingChanges(true);
    setSaveState("idle");
    setMessage("有修改正在等待自动保存…");
  }

  async function handleSave(draft: SopDraft): Promise<void> {
    const base = editingRef.current;
    if (!base) return;
    pendingAutoSaveRef.current = null;
    setSaveState("saving");
    try {
      const saved = await saveSopDraftRemote(base.id, base.revision, draft);
      clearSopRecovery(window.localStorage, saved.id);
      updateDraftList(saved);
      adoptEditing(null);
      setSaveState("saved");
      setHasPendingChanges(false);
      setMessage("草稿已保存");
      setMode("list");
    } catch (error) {
      const nextConflict = conflictFromError(error, draft);
      if (nextConflict) {
        setConflict(nextConflict);
        setSaveState("conflict");
        setMessage("检测到服务端 revision 冲突，请选择恢复方式。 ");
        return;
      }
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleDelete(id: string): Promise<void> {
    const draft = drafts.find((item) => item.id === id);
    if (!draft) return;
    try {
      await deleteSopDraftRemote(id, draft.revision);
      clearSopRecovery(window.localStorage, id);
      setDrafts((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      await loadDrafts();
    }
  }

  async function handleBack(): Promise<void> {
    pendingAutoSaveRef.current = null;
    adoptEditing(null);
    setConflict(null);
    setLifecycleOpen(false);
    setMode("list");
    await loadDrafts();
  }

  function useRemoteConflictDraft(): void {
    if (!conflict) return;
    clearSopRecovery(window.localStorage, conflict.remote.id);
    adoptEditing(conflict.remote);
    updateDraftList(conflict.remote);
    setConflict(null);
    setSaveState("saved");
    setHasPendingChanges(false);
    setMessage("已加载服务端最新草稿。 ");
    setCanvasGeneration((value) => value + 1);
  }

  async function overwriteConflictWithLocal(): Promise<void> {
    if (!conflict) return;
    try {
      const saved = await saveSopDraftRemote(conflict.remote.id, conflict.remote.revision, conflict.local);
      clearSopRecovery(window.localStorage, saved.id);
      adoptEditing(saved);
      updateDraftList(saved);
      setConflict(null);
      setSaveState("saved");
      setHasPendingChanges(false);
      setMessage("本地修改已基于最新 revision 保存。 ");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveConflictAsCopy(): Promise<void> {
    if (!conflict) return;
    try {
      const copy = await importSopDraft({ ...conflict.local, name: `${conflict.local.name} · 冲突副本` });
      clearSopRecovery(window.localStorage, conflict.local.id);
      adoptEditing(copy);
      updateDraftList(copy);
      setConflict(null);
      setSaveState("saved");
      setHasPendingChanges(false);
      setMessage("已将本地修改另存为独立草稿。 ");
      setCanvasGeneration((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function openLifecycle(): void {
    const draft = editingRef.current;
    if (!draft) return;
    setLifecycleOpen(true);
    void loadVersions(draft.id);
  }

  async function handlePublish(): Promise<void> {
    const draft = editingRef.current;
    if (!draft || hasPendingChanges || saveState === "saving" || saveState === "conflict" || saveState === "error") return;
    setLifecycleState("publishing");
    setLifecycleMessage("");
    try {
      const version = await publishSopDraft(draft.id, draft.revision, releaseNotes);
      setReleaseNotes("");
      setLifecycleMessage(`v${version.version} 已发布，内容 Hash ${version.contentHash.slice(0, 12)}。`);
      setVersions(await fetchSopVersions(draft.id));
      setLifecycleState("idle");
    } catch (error) {
      const nextConflict = conflictFromError(error, draft);
      if (nextConflict) {
        setConflict(nextConflict);
        setSaveState("conflict");
        setLifecycleOpen(false);
        setMessage("发布前检测到服务端 revision 冲突，请先选择恢复方式。 ");
        return;
      }
      setLifecycleState("error");
      setLifecycleMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleRestoreVersion(versionId: string): Promise<void> {
    const draft = editingRef.current;
    if (!draft) return;
    setLifecycleState("restoring");
    setLifecycleMessage("");
    try {
      const restored = await createDraftFromSopVersion(draft.id, versionId);
      updateDraftList(restored);
      adoptEditing(restored);
      setHasPendingChanges(false);
      setSaveState("saved");
      setLifecycleOpen(false);
      setVersions([]);
      setMessage("已从历史版本创建独立恢复草稿，原版本保持不变。 ");
      setCanvasGeneration((value) => value + 1);
    } catch (error) {
      setLifecycleState("error");
      setLifecycleMessage(error instanceof Error ? error.message : String(error));
    }
  }

  if (mode === "canvas" && editing) {
    return (
      <section className={`view-pad builder-canvas ${active ? "" : "view-hide"}`} data-view="builder" data-mode="canvas">
        {message || conflict ? (
          <div className={`sop-sync-banner ${saveState}`} role={saveState === "error" || saveState === "conflict" ? "alert" : "status"}>
            <span>{message || "草稿同步状态"}</span>
            {conflict ? (
              <div>
                <button type="button" onClick={useRemoteConflictDraft}>使用服务器版本</button>
                <button type="button" onClick={() => void overwriteConflictWithLocal()}>保留本地修改</button>
                <button type="button" onClick={() => void saveConflictAsCopy()}>另存为副本</button>
              </div>
            ) : null}
          </div>
        ) : null}
        <SopCanvas
          key={`${editing.id}:${canvasGeneration}`}
          initial={editing}
          legacyBackup={legacyBackup}
          onSave={handleSave}
          onAutoSave={handleAutoSave}
          onRecoveryChange={handleRecoveryChange}
          onBack={() => { void handleBack(); }}
          onOpenLifecycle={openLifecycle}
        />
        <SopLifecyclePanel
          open={lifecycleOpen}
          draftName={editing.name}
          revision={editing.revision}
          versions={versions}
          releaseNotes={releaseNotes}
          state={lifecycleState}
          message={lifecycleMessage}
          canPublish={!hasPendingChanges && saveState !== "saving" && saveState !== "conflict" && saveState !== "error"}
          onReleaseNotesChange={setReleaseNotes}
          onPublish={() => { void handlePublish(); }}
          onRestore={(versionId) => { void handleRestoreVersion(versionId); }}
          onRefresh={() => { void loadVersions(editing.id); }}
          onClose={() => setLifecycleOpen(false)}
        />
      </section>
    );
  }

  return (
    <section className={`view-pad ${active ? "" : "view-hide"}`} data-view="builder">
      {loadState === "loading" ? <div className="sop-list-status">正在加载服务端 SOP 草稿…</div> : null}
      {message ? <div className={`sop-list-status ${loadState === "error" ? "error" : ""}`}>{message}</div> : null}
      <SopList drafts={drafts} query={query} onEdit={(draft) => { void handleEdit(draft); }} onNew={() => { void handleNew(); }} onDelete={(id) => { void handleDelete(id); }} />
    </section>
  );
}
