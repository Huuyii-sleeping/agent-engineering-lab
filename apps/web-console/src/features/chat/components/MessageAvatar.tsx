import { Bot, CircleDot, UserRound, Wrench } from "lucide-react";
import type { ChatMessage } from "../../../api";

export function MessageAvatar({ role }: { role: ChatMessage["role"] }) {
  const Icon = role === "user" ? UserRound : role === "tool" ? Wrench : role === "system" ? CircleDot : Bot;
  return (
    <div className={`message-avatar message-avatar--${role}`} aria-hidden="true">
      <Icon size={16} strokeWidth={2.2} />
    </div>
  );
}
