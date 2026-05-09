import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  fetchObservabilityEvents,
  fetchObservabilityMetrics,
  fetchRuntimeSnapshot,
  fetchTasks,
  fetchTodos,
  type ObservabilityEvent,
  type ObservabilityMetrics,
  type RuntimeSnapshot,
  type TaskItem,
  type TodoSnapshot,
} from "./api";
import { endpoints, modules, roadmap } from "./lib/constants";
import { formatCompactNumber, formatDateTime, formatDurationMs } from "./lib/format";
import { getStatusMeta, sortTasks } from "./lib/status";
import "./styles.css";

const moduleStyles = {
  ready: {
    label: "ready",
    tagClass: "text-emerald-300",
    cardClass: "border-white/[0.08] bg-white/[0.04]",
  },
  "in-progress": {
    label: "in progress",
    tagClass: "text-amber-300",
    cardClass: "border-amber-200/[0.12] bg-amber-100/[0.04]",
  },
  planned: {
    label: "planned",
    tagClass: "text-slate-300",
    cardClass: "border-white/[0.08] bg-white/[0.04]",
  },
} as const;

const roadmapStyles = {
  done: "text-emerald-300",
  next: "text-amber-300",
  later: "text-slate-300",
} as const;

type DashboardState = {
  runtime: RuntimeSnapshot | null;
  tasks: TaskItem[];
  todos: TodoSnapshot | null;
  metrics: ObservabilityMetrics | null;
  events: ObservabilityEvent[];
};

const initialState: DashboardState = {
  runtime: null,
  tasks: [],
  todos: null,
  metrics: null,
  events: [],
};

async function loadDashboard(): Promise<DashboardState> {
  const [runtime, tasks, todos, metrics, events] = await Promise.all([
    fetchRuntimeSnapshot(),
    fetchTasks(),
    fetchTodos(),
    fetchObservabilityMetrics(),
    fetchObservabilityEvents(),
  ]);
  return { runtime, tasks, todos, metrics, events };
}

function App() {
  const [state, setState] = useState<DashboardState>(initialState);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (mode: "initial" | "manual") => {
    if (mode === "initial") {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const next = await loadDashboard();
      setState(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void refresh("initial");
  }, []);

  const sortedTasks = sortTasks(state.tasks);
  const topTools = Object.entries(state.metrics?.perTool ?? {})
    .sort((a, b) => b[1].calls - a[1].calls)
    .slice(0, 5);
  const heroStats = [
    {
      label: "当前形态",
      value: state.runtime ? `${state.runtime.tasksCount} tasks` : "--",
      note: state.runtime ? `${state.runtime.todosCount} todos in snapshot` : "等待 API 返回",
    },
    {
      label: "执行轨迹",
      value: state.runtime ? formatCompactNumber(state.runtime.tracesStarted) : "--",
      note: "来自 observability metrics",
    },
    {
      label: "工具调用",
      value: state.runtime ? formatCompactNumber(state.runtime.toolCalls) : "--",
      note: state.runtime ? `${state.runtime.toolFailures} failures` : "等待 API 返回",
    },
    {
      label: "最后刷新",
      value: state.runtime?.lastUpdatedAt ? formatDateTime(state.runtime.lastUpdatedAt) : "--",
      note: "只读快照视图",
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden text-slate-50">
      <div className="floating-orb absolute -right-32 -top-40 h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgba(91,231,196,0.28),transparent_60%)] blur-2xl" />
      <div className="floating-orb absolute -left-24 top-96 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(255,179,71,0.24),transparent_62%)] blur-2xl [animation-delay:-5s]" />
      <main className="relative z-10 mx-auto flex w-[min(1380px,calc(100vw-32px))] flex-col gap-5 py-8 max-sm:w-[min(100vw-18px,100%)] max-sm:py-5">
        <section className="surface-card lift-in p-7 max-sm:p-5">
          <div className="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-start">
            <span className="text-xs uppercase tracking-[0.18em] text-emerald-300">
              apps/web-console
            </span>
            <div className="flex items-center gap-3 max-sm:w-full max-sm:flex-col max-sm:items-start">
              <span className="rounded-full border border-white/[0.12] bg-white/[0.04] px-3 py-1 text-sm text-slate-300">
                read-only live snapshot
              </span>
              <button
                type="button"
                onClick={() => void refresh("manual")}
                disabled={refreshing}
                className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-300/16 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? "刷新中..." : "刷新数据"}
              </button>
            </div>
          </div>
          <div className="mt-6 max-w-3xl">
            <h1 className="m-0 text-[clamp(2.8rem,6vw,5.5rem)] font-bold leading-[0.96] tracking-[-0.03em]">
              Agent Runtime Console
            </h1>
            <p className="mt-3 max-w-[60ch] text-[1.05rem] leading-7 text-slate-300">
              现在已经直接读取 `apps/agent-cli` 下的 `.tasks`、`.runtime/todos.json` 和 `.observability`，前端展示的是实际快照，不再是静态占位。
            </p>
          </div>
          {error ? (
            <div className="mt-5 rounded-2xl border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
              API 读取失败：{error}
            </div>
          ) : null}
          <div className="mt-7 grid grid-cols-4 gap-3.5 max-lg:grid-cols-1">
            {heroStats.map((item) => (
              <article
                key={item.label}
                className="min-h-[122px] rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4"
              >
                <span className="text-sm text-slate-300">{item.label}</span>
                <strong className="my-2 block text-[1.8rem] font-semibold">{item.value}</strong>
                <small className="text-sm text-slate-400">{item.note}</small>
              </article>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)] gap-5 max-lg:grid-cols-1">
          <article className="surface-card p-6">
            <div className="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-start">
              <h2 className="m-0 text-[1.3rem] font-bold tracking-[-0.03em]">当前能力矩阵</h2>
              <span className="text-sm text-slate-400">基于现有源码</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3.5 max-lg:grid-cols-1">
              {modules.map((item) => (
                <article
                  key={item.name}
                  className={`lift-in rounded-2xl border p-4 min-h-[150px] ${moduleStyles[item.status].cardClass}`}
                >
                  <div
                    className={`inline-flex rounded-full border border-white/[0.12] bg-white/[0.04] px-3 py-1 text-sm ${moduleStyles[item.status].tagClass}`}
                  >
                    {moduleStyles[item.status].label}
                  </div>
                  <h3 className="mt-4 text-[1.08rem] font-semibold tracking-[-0.03em]">{item.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{item.detail}</p>
                </article>
              ))}
            </div>
          </article>

          <article className="surface-card p-6">
            <div className="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-start">
              <h2 className="m-0 text-[1.3rem] font-bold tracking-[-0.03em]">Web 接入路线</h2>
              <span className="text-sm text-slate-400">read-only first</span>
            </div>
            <div className="mt-5 grid gap-3">
              {roadmap.map((item) => (
                <div key={item.step} className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
                  <div className={`mb-2 font-semibold ${roadmapStyles[item.status]}`}>{item.step}</div>
                  <div className="text-sm leading-6 text-slate-300">{item.detail}</div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="grid grid-cols-2 gap-5 max-lg:grid-cols-1">
          <article className="surface-card p-6">
            <div className="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-start">
              <h2 className="m-0 text-[1.3rem] font-bold tracking-[-0.03em]">任务面板</h2>
              <span className="text-sm text-slate-400">
                {state.runtime ? `${state.runtime.inProgressTasks} in progress` : "等待 API 返回"}
              </span>
            </div>
            <div className="mt-5 grid gap-3">
              {loading ? (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 text-sm text-slate-300">
                  正在加载任务数据...
                </div>
              ) : sortedTasks.length === 0 ? (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 text-sm text-slate-300">
                  还没有持久化任务。
                </div>
              ) : (
                sortedTasks.map((item) => {
                  const meta = getStatusMeta(item.status);
                  return (
                    <div key={item.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
                      <div className="flex items-start justify-between gap-3 max-sm:flex-col max-sm:items-start">
                        <div>
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Task #{item.id}</div>
                          <strong className="mt-1 block text-base font-semibold">{item.subject}</strong>
                        </div>
                        <span
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${meta.badgeClass}`}
                        >
                          <span className={`h-2 w-2 rounded-full ${meta.dotClass}`} />
                          {meta.label}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-300">
                        {item.description || "无补充描述。"}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                        <span className="rounded-full border border-white/[0.08] px-2.5 py-1">
                          owner: {item.owner || "unclaimed"}
                        </span>
                        <span className="rounded-full border border-white/[0.08] px-2.5 py-1">
                          blockedBy: {item.blockedBy.length > 0 ? item.blockedBy.join(", ") : "none"}
                        </span>
                        <span className="rounded-full border border-white/[0.08] px-2.5 py-1">
                          worktree: {item.worktree || "none"}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </article>

          <article className="surface-card p-6">
            <div className="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-start">
              <h2 className="m-0 text-[1.3rem] font-bold tracking-[-0.03em]">Todo 快照</h2>
              <span className="text-sm text-slate-400">
                {state.todos?.updatedAt ? formatDateTime(state.todos.updatedAt) : "等待快照"}
              </span>
            </div>
            <div className="mt-5 grid gap-3">
              {loading ? (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 text-sm text-slate-300">
                  正在加载 todo 快照...
                </div>
              ) : !state.todos || state.todos.items.length === 0 ? (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 text-sm text-slate-300">
                  当前没有 todo 快照。需要 agent 实际调用一次 `todo` 工具后才会落盘。
                </div>
              ) : (
                state.todos.items.map((item) => {
                  const meta = getStatusMeta(item.status);
                  return (
                    <div key={item.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <strong className="text-sm font-semibold">#{item.id}</strong>
                        <span
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${meta.badgeClass}`}
                        >
                          <span className={`h-2 w-2 rounded-full ${meta.dotClass}`} />
                          {meta.label}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-300">{item.text}</p>
                    </div>
                  );
                })
              )}
            </div>
          </article>
        </section>

        <section className="grid grid-cols-2 gap-5 max-lg:grid-cols-1">
          <article className="surface-card p-6">
            <div className="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-start">
              <h2 className="m-0 text-[1.3rem] font-bold tracking-[-0.03em]">可观测性指标</h2>
              <span className="text-sm text-slate-400">
                {state.metrics?.updatedAt ? formatDateTime(state.metrics.updatedAt) : "未生成 metrics"}
              </span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 max-sm:grid-cols-1">
              {[
                { label: "model requests", value: formatCompactNumber(state.metrics?.modelRequests ?? 0) },
                { label: "model responses", value: formatCompactNumber(state.metrics?.modelResponses ?? 0) },
                { label: "tool failures", value: formatCompactNumber(state.metrics?.toolFailures ?? 0) },
                { label: "max tool latency", value: formatDurationMs(state.metrics?.maxToolDurationMs ?? 0) },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4"
                >
                  <div className="text-sm text-slate-400">{item.label}</div>
                  <div className="mt-2 text-2xl font-semibold">{item.value}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-3">
              {topTools.length === 0 ? (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 text-sm text-slate-300">
                  还没有工具统计。
                </div>
              ) : (
                topTools.map(([toolName, tool]) => (
                  <div
                    key={toolName}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 max-sm:flex-col max-sm:items-start"
                  >
                    <div>
                      <strong className="block text-sm font-semibold">{toolName}</strong>
                      <p className="mt-1 text-sm text-slate-400">
                        {tool.failures} failures · {formatDurationMs(tool.totalDurationMs)} total
                      </p>
                    </div>
                    <span className="rounded-full border border-white/[0.08] px-3 py-1 text-sm text-slate-300">
                      {tool.calls} calls
                    </span>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="surface-card p-6">
            <div className="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-start">
              <h2 className="m-0 text-[1.3rem] font-bold tracking-[-0.03em]">最近事件</h2>
              <span className="text-sm text-slate-400">{state.events.length} events</span>
            </div>
            <div className="mt-5 grid gap-3">
              {loading ? (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 text-sm text-slate-300">
                  正在加载事件流...
                </div>
              ) : state.events.length === 0 ? (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 text-sm text-slate-300">
                  还没有事件数据。
                </div>
              ) : (
                state.events.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
                    <div className="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-start">
                      <span className="text-sm text-slate-300">{item.kind}</span>
                      <code className="font-mono text-sm text-emerald-300">
                        {item.trace_id || item.span_id || "no-trace"}
                      </code>
                    </div>
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                      {formatDateTime(item.at)}
                    </p>
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-white/[0.06] bg-slate-950/40 p-3 text-xs leading-6 text-slate-300">
                      {JSON.stringify(item.payload, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </article>
        </section>

        <section className="surface-card p-6">
          <div className="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-start">
            <h2 className="m-0 text-[1.3rem] font-bold tracking-[-0.03em]">只读 API</h2>
            <span className="text-sm text-slate-400">Vite middleware</span>
          </div>
          <div className="mt-5 grid gap-3">
            {endpoints.map((item) => (
              <div
                key={item.path}
                className="grid grid-cols-[76px_minmax(0,1fr)] gap-3.5 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 max-sm:grid-cols-1"
              >
                <code className="font-mono text-sm text-emerald-300">{item.method}</code>
                <div>
                  <strong className="block text-[0.95rem] font-semibold">{item.path}</strong>
                  <p className="mt-1 text-sm leading-6 text-slate-300">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
