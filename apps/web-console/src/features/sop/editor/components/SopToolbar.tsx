import { ArrowDown, ArrowLeft, ArrowRight, Check, Download, FileJson, FlaskConical, Focus, GitBranch, Hand, Lock, MousePointer2, PackageCheck, Play, Redo2, Rocket, Search, TriangleAlert, Undo2, Upload } from "lucide-react";

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** 编辑器顶栏，显示 dirty revision 和静态诊断状态。 */
export function SopToolbar(props: {
  name: string;
  summary: string;
  dirtyRevision: number;
  debugState: { status: string; message?: string };
  legacyBackup: string | null;
  onNameChange: (value: string) => void;
  onSummaryChange: (value: string) => void;
  onBack: () => void;
  onValidate: () => void;
  onSave: () => void;
  onOpenLifecycle: () => void;
  onExportJson: () => void;
  onImportText: (text: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  searchQuery: string;
  searchCount: number;
  onSearchChange: (value: string) => void;
  onFocusSearch: () => void;
  onUndo: () => void;
  onRedo: () => void;
  interactionMode: "select" | "pan";
  onInteractionModeChange: (mode: "select" | "pan") => void;
  onLayout: (direction: "LR" | "TB") => Promise<void>;
  onFitSelection: () => void;
  onTogglePin: () => void;
  canTestNode: boolean;
  onTestNode: () => void;
  onRunDraft: () => void;
  onRunProduction: () => void;
}) {
  return (
    <div className="sop-top">
      <div className="sop-top-primary">
        <button type="button" className="sop-back-action" onClick={props.onBack}>
          <ArrowLeft aria-hidden="true" />
          <span>返回</span>
        </button>
        <div className="sop-flow-identity">
          <span className="sop-flow-mark" aria-hidden="true"><GitBranch /></span>
          <div className="sop-flow-copy">
            <input aria-label="流程名称" className="sop-name" value={props.name} placeholder="流程名称" onChange={(event) => props.onNameChange(event.target.value)} />
            <input aria-label="流程描述" className="sop-sum" value={props.summary} placeholder="一句话描述" onChange={(event) => props.onSummaryChange(event.target.value)} />
          </div>
        </div>
        <span className={`sop-editor-status ${props.debugState.status}`} title={props.debugState.message}>
          <span className="sop-status-dot" aria-hidden="true" />
          <span>rev {props.dirtyRevision}</span>
          <span className="sop-status-separator" aria-hidden="true" />
          <strong>{props.debugState.message ?? "待编辑"}</strong>
        </span>
      </div>

      <div className="sop-top-actions">
        <div className="sop-node-search">
          <Search aria-hidden="true" />
          <input aria-label="搜索节点" value={props.searchQuery} placeholder="搜索节点" onChange={(event) => props.onSearchChange(event.target.value)} />
          <button type="button" aria-label={`${props.searchCount} 个搜索结果`} onClick={props.onFocusSearch}>{props.searchCount}</button>
        </div>
        <div className="sop-tool-mode" role="group" aria-label="画布交互模式">
          <button
            type="button"
            className={`btn btn-ghost btn-sm ${props.interactionMode === "select" ? "is-active" : ""}`}
            aria-pressed={props.interactionMode === "select"}
            data-testid="sop-select-mode"
            onClick={() => props.onInteractionModeChange("select")}
            title="选择节点与框选（V）"
          ><MousePointer2 aria-hidden="true" />选择</button>
          <button
            type="button"
            className={`btn btn-ghost btn-sm ${props.interactionMode === "pan" ? "is-active" : ""}`}
            aria-pressed={props.interactionMode === "pan"}
            data-testid="sop-pan-mode"
            onClick={() => props.onInteractionModeChange("pan")}
            title="按住左键拖动画布（H）"
          ><Hand aria-hidden="true" />平移</button>
        </div>
        <div className="sop-action-cluster" role="group" aria-label="编辑与布局工具">
          <button type="button" className="sop-icon-action" disabled={!props.canUndo} onClick={props.onUndo} aria-label="撤销" title="撤销"><Undo2 /></button>
          <button type="button" className="sop-icon-action" disabled={!props.canRedo} onClick={props.onRedo} aria-label="重做" title="重做"><Redo2 /></button>
          <button type="button" className="sop-icon-action" onClick={() => void props.onLayout("LR")} aria-label="横向布局" title="横向布局"><ArrowRight /></button>
          <button type="button" className="sop-icon-action" onClick={() => void props.onLayout("TB")} aria-label="纵向布局" title="纵向布局"><ArrowDown /></button>
          <button type="button" className="sop-icon-action" onClick={props.onFitSelection} aria-label="定位选中" title="定位选中"><Focus /></button>
          <button type="button" className="sop-icon-action" onClick={props.onTogglePin} aria-label="固定或取消固定" title="固定或取消固定"><Lock /></button>
        </div>
        <div className="sop-top-sp" />
        <div className="sop-run-actions" role="group" aria-label="运行调试">
          <button type="button" disabled={!props.canTestNode} onClick={props.onTestNode} title={props.canTestNode ? "试运行当前节点" : "先选择一个节点"}><FlaskConical aria-hidden="true" />试节点</button>
          <button type="button" onClick={props.onRunDraft} title="运行当前画布草稿"><Play aria-hidden="true" />跑草稿</button>
          <button type="button" onClick={props.onRunProduction} title="运行不可变发布版本"><PackageCheck aria-hidden="true" />跑版本</button>
        </div>
        <div className="sop-action-cluster" role="group" aria-label="流程文件工具">
          <button type="button" className="sop-icon-action" onClick={props.onExportJson} aria-label="查看 JSON" title="查看 JSON"><FileJson aria-hidden="true" /></button>
          <label className="sop-icon-action sop-json-upload" aria-label="导入 JSON" title="导入 JSON"><Upload aria-hidden="true" /><input type="file" accept=".json,application/json" onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void file.text().then(props.onImportText);
            event.target.value = "";
          }} /></label>
          {props.legacyBackup ? <button type="button" className="sop-icon-action" onClick={() => downloadText(`sop-v1-backup-${Date.now()}.json`, props.legacyBackup!)} aria-label="下载 v1 备份" title="下载迁移前的只读 v1 草稿"><Download aria-hidden="true" /></button> : null}
        </div>
        <button type="button" className="sop-validate-action" title="检查流程" onClick={props.onValidate}><TriangleAlert aria-hidden="true" />检查</button>
        <button type="button" className="sop-save-action" onClick={props.onSave}><Check aria-hidden="true" />保存草稿</button>
        <button type="button" className="sop-publish-action" onClick={props.onOpenLifecycle}><Rocket aria-hidden="true" />发布</button>
      </div>
    </div>
  );
}
