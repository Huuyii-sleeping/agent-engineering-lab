import type { ChatMessage, SessionSummary } from "../../../api";
import type { SessionMetadataMap } from "../../../session-metadata";

export function formatTime(value: number | null): string {
  if (!value) {
    return "未记录";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function messageText(message: ChatMessage): string {
  if (typeof message.content === "string" && message.content.trim()) {
    return message.content;
  }
  return message.role === "assistant" ? "（空回复）" : "（空消息）";
}

export function roleLabel(role: ChatMessage["role"]): string {
  if (role === "assistant") {
    return "AI Studio";
  }
  if (role === "user") {
    return "我";
  }
  if (role === "tool") {
    return "工具";
  }
  return "系统";
}

export function sessionTimestamp(session: SessionSummary): number {
  return session.updatedAt ?? session.createdAt ?? 0;
}

export function sortSessionsByRecent(sessions: SessionSummary[]): SessionSummary[] {
  return [...sessions].sort((left, right) => sessionTimestamp(right) - sessionTimestamp(left));
}

export function sortSessionsForSidebar(sessions: SessionSummary[], metadata: SessionMetadataMap): SessionSummary[] {
  return [...sessions].sort((left, right) => {
    const leftPinned = metadata[left.id]?.pinned === true;
    const rightPinned = metadata[right.id]?.pinned === true;
    if (leftPinned !== rightPinned) {
      return leftPinned ? -1 : 1;
    }
    return sessionTimestamp(right) - sessionTimestamp(left);
  });
}

export function streamLabel(state: "connecting" | "connected" | "disconnected"): string {
  if (state === "connected") {
    return "SSE 已连接";
  }
  if (state === "connecting") {
    return "SSE 连接中";
  }
  return "SSE 未连接";
}
