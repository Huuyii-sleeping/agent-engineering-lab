import { Download, FileJson, Upload } from "lucide-react";

function downloadJson(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name.replace(/\s+/g, "_") || "sop"}_${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** workflow v2 JSON 查看、导入和下载面板。 */
export function SopJsonPanel(props: { name: string; text: string; error: string | null; onTextChange: (text: string) => void; onImport: () => void; onClose: () => void }) {
  return (
    <div className="sop-insp-in">
      <div className="sop-insp-h"><FileJson width={14} height={14} aria-hidden="true" />Workflow JSON<button type="button" className="btn btn-ghost btn-sm sop-json-close" onClick={props.onClose}>✕</button></div>
      <div className="sop-json-desc">支持 workflow v2；旧 SOP v1 JSON 会通过迁移器导入，失败时不会覆盖画布。</div>
      <textarea className="sop-json-editor" rows={16} value={props.text} onChange={(event) => props.onTextChange(event.target.value)} spellCheck={false} />
      {props.error ? <div className="sop-valid-item err">{props.error}</div> : null}
      <div className="sop-action-row" style={{ marginTop: 10 }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={props.onImport}><Upload width={13} height={13} aria-hidden="true" />导入到画布</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadJson(props.name, props.text)}><Download width={13} height={13} aria-hidden="true" />下载文件</button>
      </div>
    </div>
  );
}
