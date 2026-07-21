import { ArrowDown, ArrowLeft, ArrowRight, Check, Download, FileJson, Focus, Hand, Lock, MousePointer2, Redo2, Search, TriangleAlert, Undo2, Upload } from "lucide-react";

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
}) {
  return (
    <div className="sop-top">
      <button type="button" className="btn btn-ghost btn-sm" onClick={props.onBack}><ArrowLeft aria-hidden="true" />返回列表</button>
      <input className="sop-name" value={props.name} placeholder="流程名称" onChange={(event) => props.onNameChange(event.target.value)} />
      <input className="sop-sum" value={props.summary} placeholder="一句话描述" onChange={(event) => props.onSummaryChange(event.target.value)} />
      <span className={`sop-editor-status ${props.debugState.status}`} title={props.debugState.message}>rev +{props.dirtyRevision} · {props.debugState.message ?? "待编辑"}</span>
      <div className="sop-node-search"><Search width={13} /><input value={props.searchQuery} placeholder="搜索节点" onChange={(event) => props.onSearchChange(event.target.value)} /><button type="button" onClick={props.onFocusSearch}>{props.searchCount}</button></div>
      <div className="sop-top-sp" />
      <div className="sop-top-actions">
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
          ><Hand aria-hidden="true" />拖动画布</button>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" disabled={!props.canUndo} onClick={props.onUndo} title="撤销"><Undo2 /></button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={!props.canRedo} onClick={props.onRedo} title="重做"><Redo2 /></button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void props.onLayout("LR")} title="横向布局"><ArrowRight /></button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void props.onLayout("TB")} title="纵向布局"><ArrowDown /></button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={props.onFitSelection} title="定位选中"><Focus /></button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={props.onTogglePin} title="固定或取消固定"><Lock /></button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={props.onValidate}><TriangleAlert aria-hidden="true" />校验流程</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={props.onSave}><Check aria-hidden="true" />保存草稿</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={props.onExportJson}><FileJson width={14} height={14} aria-hidden="true" />JSON</button>
        <label className="btn btn-ghost btn-sm sop-json-upload"><Upload width={14} height={14} aria-hidden="true" />导入<input type="file" accept=".json,application/json" onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          void file.text().then(props.onImportText);
          event.target.value = "";
        }} /></label>
        {props.legacyBackup ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadText(`sop-v1-backup-${Date.now()}.json`, props.legacyBackup!)} title="下载迁移前的只读 v1 草稿"><Download width={14} height={14} aria-hidden="true" />v1 备份</button> : null}
      </div>
    </div>
  );
}
