export const modules = [
  {
    name: "核心循环",
    detail: "agent-loop + tool routing + memory injection",
    status: "ready",
  },
  {
    name: "任务可视化",
    detail: "todo / task_create / task_update / task_list",
    status: "ready",
  },
  {
    name: "可观测性",
    detail: "trace_id / span_id / JSONL events / metrics",
    status: "ready",
  },
  {
    name: "安全边界",
    detail: "write / edit / shell / background approval gating",
    status: "ready",
  },
  {
    name: "子代理与协作",
    detail: "spawn / send / wait / inbox / team protocol",
    status: "ready",
  },
  {
    name: "Web 接入层",
    detail: "HTTP API + live snapshots + replay viewer",
    status: "in-progress",
  },
] as const;

export const roadmap = [
  {
    step: "1. 建立 web 目录",
    status: "done",
    detail: "独立 Vite 前端骨架已就位。",
  },
  {
    step: "2. 暴露只读快照",
    status: "done",
    detail: "已接入 runtime / tasks / observability 的 read-only API。",
  },
  {
    step: "3. 任务与待办面板",
    status: "done",
    detail: "前端已经渲染真实 task/todo 数据，并支持手动刷新。",
  },
  {
    step: "4. 回放与事件流",
    status: "next",
    detail: "下一步补 trace_id 过滤和单条轨迹详情视图。",
  },
] as const;

export const endpoints = [
  { method: "GET", path: "/api/runtime/snapshot", detail: "整体运行状态" },
  { method: "GET", path: "/api/tasks", detail: "持久化任务列表" },
  { method: "GET", path: "/api/todos", detail: "会话内 todo 快照" },
  { method: "GET", path: "/api/observability/metrics", detail: "指标快照" },
  { method: "GET", path: "/api/observability/events?trace_id=", detail: "轨迹回放事件" },
] as const;
