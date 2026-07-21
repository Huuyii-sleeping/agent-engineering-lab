import { Clock3, GitCommitHorizontal, History, RefreshCw, Rocket, RotateCcw, X } from "lucide-react";
import type { SopVersionSummary } from "../../../../api";

function dateTime(value: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/** SOP 发布与不可变版本轨道。 */
export function SopLifecyclePanel(props: {
  open: boolean;
  draftName: string;
  revision: number;
  versions: SopVersionSummary[];
  releaseNotes: string;
  state: "idle" | "loading" | "publishing" | "restoring" | "error";
  message: string;
  canPublish: boolean;
  onReleaseNotesChange: (value: string) => void;
  onPublish: () => void;
  onRestore: (versionId: string) => void;
  onRefresh: () => void;
  onClose: () => void;
}) {
  if (!props.open) return null;

  return (
    <>
      <button type="button" className="sop-lifecycle-scrim" aria-label="关闭发布与版本面板" onClick={props.onClose} />
      <aside className="sop-lifecycle-panel" role="dialog" aria-modal="true" aria-label="发布与版本">
        <header className="sop-lifecycle-head">
          <div>
            <span className="sop-lifecycle-eyebrow"><GitCommitHorizontal aria-hidden="true" />版本轨道</span>
            <h3>发布与版本</h3>
            <p>{props.draftName} · 草稿 rev {props.revision}</p>
          </div>
          <button type="button" className="sop-lifecycle-close" aria-label="关闭" onClick={props.onClose}><X aria-hidden="true" /></button>
        </header>

        <section className="sop-release-card">
          <div className="sop-release-title">
            <span><Rocket aria-hidden="true" />发布当前草稿</span>
            <span className={props.canPublish ? "ready" : "waiting"}>{props.canPublish ? "可发布" : "等待同步"}</span>
          </div>
          <p>发布会创建不可变快照；之后继续编辑草稿不会改变历史版本。</p>
          <label>
            <span>发布说明</span>
            <textarea
              rows={3}
              maxLength={500}
              value={props.releaseNotes}
              placeholder="例如：补齐审批分支并调整输出字段"
              onChange={(event) => props.onReleaseNotesChange(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="sop-release-submit"
            disabled={!props.canPublish || props.state === "publishing"}
            onClick={props.onPublish}
          >
            <Rocket aria-hidden="true" />
            {props.state === "publishing" ? "正在发布…" : "发布新版本"}
          </button>
          {props.message ? <div className={`sop-lifecycle-message ${props.state === "error" ? "error" : ""}`}>{props.message}</div> : null}
        </section>

        <section className="sop-version-section">
          <div className="sop-version-section-head">
            <div><History aria-hidden="true" /><span>历史版本</span><strong>{props.versions.length}</strong></div>
            <button type="button" aria-label="刷新版本列表" title="刷新版本列表" onClick={props.onRefresh}><RefreshCw aria-hidden="true" /></button>
          </div>

          {props.state === "loading" ? <div className="sop-version-empty">正在读取版本轨道…</div> : null}
          {props.state !== "loading" && props.versions.length === 0 ? (
            <div className="sop-version-empty">还没有发布版本。填写说明并发布首个不可变快照。</div>
          ) : null}
          <div className="sop-version-list">
            {props.versions.map((version, index) => (
              <article key={version.id} className="sop-version-item">
                <div className="sop-version-line" aria-hidden="true"><span /></div>
                <div className="sop-version-copy">
                  <div className="sop-version-title">
                    <strong>v{version.version}</strong>
                    {index === 0 ? <span>最新发布</span> : null}
                  </div>
                  <p>{version.releaseNotes || "未填写发布说明"}</p>
                  <div className="sop-version-meta">
                    <span><Clock3 aria-hidden="true" />{dateTime(version.createdAt)}</span>
                    <span>{version.nodeCount} 节点</span>
                    <span>{version.edgeCount} 连线</span>
                  </div>
                  <code title={version.contentHash}>{version.contentHash.slice(0, 12)}</code>
                  <button
                    type="button"
                    className="sop-version-restore"
                    disabled={props.state === "restoring"}
                    onClick={() => props.onRestore(version.id)}
                  ><RotateCcw aria-hidden="true" />创建恢复草稿</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </aside>
    </>
  );
}
