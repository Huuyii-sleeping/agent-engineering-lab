import { Plus } from "lucide-react";

export function NewConversationPanel({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="starter-panel starter-panel--new">
      <h2>有什么我能帮你的？</h2>
      {onCreate ? (
        <button className="primary-action" type="button" onClick={onCreate}>
          <Plus size={18} strokeWidth={2.2} aria-hidden="true" />
          <span>新建对话</span>
        </button>
      ) : null}
    </div>
  );
}
