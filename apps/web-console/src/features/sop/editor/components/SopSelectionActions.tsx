import { Copy, Trash2 } from "lucide-react";

/** 节点选择操作区。 */
export function SopSelectionActions({ onDuplicate, onDelete }: { onDuplicate: () => void; onDelete: () => void }) {
  return (
    <div className="sop-action-row">
      <button type="button" className="btn btn-ghost btn-sm" onClick={onDuplicate}><Copy width={13} height={13} aria-hidden="true" />复制</button>
      <button type="button" className="btn btn-ghost btn-sm sop-del" onClick={onDelete}><Trash2 width={13} height={13} aria-hidden="true" />删除</button>
    </div>
  );
}
