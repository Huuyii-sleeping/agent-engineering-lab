import type { TaskItem, TodoStatus } from "../api";

export function getStatusMeta(status: TodoStatus): {
  label: string;
  badgeClass: string;
  dotClass: string;
} {
  if (status === "completed") {
    return {
      label: "completed",
      badgeClass: "border-emerald-300/20 bg-emerald-300/10 text-emerald-200",
      dotClass: "bg-emerald-300",
    };
  }
  if (status === "in_progress") {
    return {
      label: "in progress",
      badgeClass: "border-amber-300/20 bg-amber-300/10 text-amber-200",
      dotClass: "bg-amber-300",
    };
  }
  return {
    label: "pending",
    badgeClass: "border-slate-200/12 bg-white/[0.04] text-slate-300",
    dotClass: "bg-slate-400",
  };
}

export function sortTasks(tasks: TaskItem[]): TaskItem[] {
  const rank: Record<TodoStatus, number> = {
    in_progress: 0,
    pending: 1,
    completed: 2,
  };
  return [...tasks].sort((a, b) => {
    const byStatus = rank[a.status] - rank[b.status];
    if (byStatus !== 0) {
      return byStatus;
    }
    return a.id - b.id;
  });
}
