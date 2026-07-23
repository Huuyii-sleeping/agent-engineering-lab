import type { DragEvent } from "react";
import type { BuiltinNodeType } from "@orbit/workflow-core";
import { X } from "lucide-react";
import { sopNodeCatalog } from "../../lib/sop-catalog";

/** 由 NodeDefinition registry 驱动的节点库。 */
export function SopPalette({ open, onAdd, onClose }: { open: boolean; onAdd: (type: BuiltinNodeType) => void; onClose: () => void }) {
  const startDrag = (event: DragEvent, type: BuiltinNodeType) => {
    event.dataTransfer.setData("application/sop-node", type);
    event.dataTransfer.effectAllowed = "move";
  };
  return (
    <aside className={`sop-pal ${open ? "is-open" : ""}`} aria-label="节点库">
      <div className="sop-panel-head">
        <div><div className="sop-pal-h">节点库</div><div className="sop-pal-hint">拖入画布，或点击添加</div></div>
        <button type="button" className="sop-panel-close" aria-label="关闭节点库" onClick={onClose}><X aria-hidden="true" /></button>
      </div>
      {sopNodeCatalog.map((meta) => {
        const Icon = meta.icon;
        return (
          <div key={meta.type} className="sop-pal-item" draggable style={{ borderColor: `${meta.color}55` }} onDragStart={(event) => startDrag(event, meta.type)} onClick={() => onAdd(meta.type)}>
            <span className="sop-pal-ic" style={{ color: meta.color }}><Icon width={16} height={16} aria-hidden="true" /></span>
            <div><div className="sop-pal-nm">{meta.label}</div><div className="sop-pal-ds">{meta.desc}</div></div>
          </div>
        );
      })}
    </aside>
  );
}
