import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

type TodoStatus = "pending" | "in_progress" | "completed";

type TaskItem = {
  schemaVersion: number;
  id: number;
  subject: string;
  description: string;
  status: TodoStatus;
  blockedBy: number[];
  owner: string;
  worktree: string | null;
};

type TodoItem = {
  id: string;
  text: string;
  status: TodoStatus;
};

type TodoSnapshot = {
  schemaVersion: number;
  updatedAt: number | null;
  items: TodoItem[];
};

type ObservabilityMetrics = {
  schemaVersion: number;
  updatedAt: number | null;
  tracesStarted: number;
  modelRequests: number;
  modelResponses: number;
  notifications: number;
  securityBlocks: number;
  toolCalls: number;
  toolFailures: number;
  totalToolDurationMs: number;
  maxToolDurationMs: number;
  estimatedPromptTokens: number;
  completionTokens: number;
  perTool: Record<
    string,
    {
      calls: number;
      failures: number;
      totalDurationMs: number;
    }
  >;
};

type ObservabilityEvent = {
  schemaVersion: number;
  id: string;
  at: number;
  trace_id: string | null;
  span_id: string | null;
  kind: string;
  payload: Record<string, unknown>;
};

const webDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(webDir, "..", "agent-cli");
const tasksDir = path.join(projectRoot, ".tasks");
const observabilityDir = path.join(projectRoot, ".observability");
const runtimeDir = path.join(projectRoot, ".runtime");

function parseTimestampMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return Math.trunc(numeric);
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  const raw = await readFile(filePath, "utf8").catch(() => "");
  if (!raw.trim()) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function readTasks(): Promise<TaskItem[]> {
  const files = await readdir(tasksDir).catch(() => []);
  const taskFiles = files
    .filter((file) => /^task_\d+\.json$/.test(file))
    .sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0));
  const tasks = await Promise.all(
    taskFiles.map(async (file) => {
      const parsed = await readJsonFile<Partial<TaskItem>>(path.join(tasksDir, file), {});
      return {
        schemaVersion: Number(parsed.schemaVersion ?? 1),
        id: Number(parsed.id ?? 0),
        subject: String(parsed.subject ?? ""),
        description: String(parsed.description ?? ""),
        status: (parsed.status as TodoStatus) ?? "pending",
        blockedBy: Array.isArray(parsed.blockedBy) ? parsed.blockedBy.map((value) => Number(value)) : [],
        owner: String(parsed.owner ?? ""),
        worktree: parsed.worktree ? String(parsed.worktree) : null,
      } satisfies TaskItem;
    }),
  );
  return tasks.filter((task) => Number.isInteger(task.id) && task.id > 0);
}

async function readTodos(): Promise<TodoSnapshot> {
  const parsed = await readJsonFile<Partial<TodoSnapshot>>(path.join(runtimeDir, "todos.json"), {
    schemaVersion: 1,
    updatedAt: null,
    items: [],
  });
  const items = Array.isArray(parsed.items)
    ? parsed.items
        .map((item) => {
          const rec = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
          const id = String(rec.id ?? "").trim();
          const text = String(rec.text ?? "").trim();
          const status = String(rec.status ?? "").toLowerCase();
          if (!id || !text) {
            return null;
          }
          if (status !== "pending" && status !== "in_progress" && status !== "completed") {
            return null;
          }
          return { id, text, status: status as TodoStatus };
        })
        .filter((item): item is TodoItem => Boolean(item))
    : [];
  return {
    schemaVersion: 1,
    updatedAt: parseTimestampMs(parsed.updatedAt),
    items,
  };
}

async function readMetrics(): Promise<ObservabilityMetrics> {
  const parsed = await readJsonFile<Partial<ObservabilityMetrics>>(path.join(observabilityDir, "metrics.json"), {});
  return {
    schemaVersion: Number(parsed.schemaVersion ?? 1),
    updatedAt: parseTimestampMs(parsed.updatedAt),
    tracesStarted: Number(parsed.tracesStarted ?? 0),
    modelRequests: Number(parsed.modelRequests ?? 0),
    modelResponses: Number(parsed.modelResponses ?? 0),
    notifications: Number(parsed.notifications ?? 0),
    securityBlocks: Number(parsed.securityBlocks ?? 0),
    toolCalls: Number(parsed.toolCalls ?? 0),
    toolFailures: Number(parsed.toolFailures ?? 0),
    totalToolDurationMs: Number(parsed.totalToolDurationMs ?? 0),
    maxToolDurationMs: Number(parsed.maxToolDurationMs ?? 0),
    estimatedPromptTokens: Number(parsed.estimatedPromptTokens ?? 0),
    completionTokens: Number(parsed.completionTokens ?? 0),
    perTool: parsed.perTool && typeof parsed.perTool === "object" ? parsed.perTool : {},
  };
}

async function readEvents(traceId?: string | null): Promise<ObservabilityEvent[]> {
  const raw = await readFile(path.join(observabilityDir, "events.jsonl"), "utf8").catch(() => "");
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const events: ObservabilityEvent[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as Partial<ObservabilityEvent>;
      const event: ObservabilityEvent = {
        schemaVersion: Number(parsed.schemaVersion ?? 1),
        id: String(parsed.id ?? ""),
        at: parseTimestampMs(parsed.at) ?? 0,
        trace_id: typeof parsed.trace_id === "string" ? parsed.trace_id : null,
        span_id: typeof parsed.span_id === "string" ? parsed.span_id : null,
        kind: String(parsed.kind ?? ""),
        payload: parsed.payload && typeof parsed.payload === "object" ? (parsed.payload as Record<string, unknown>) : {},
      };
      if (!traceId || event.trace_id === traceId) {
        events.push(event);
      }
    } catch {
      // ignore malformed events
    }
  }
  return events.sort((a, b) => b.at - a.at);
}

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  plugins: [
    tailwindcss(),
    react(),
    {
      name: "agent-readonly-api",
      configureServer(server) {
        server.middlewares.use("/api/runtime/snapshot", async (_req, res) => {
          const [tasks, todos, metrics] = await Promise.all([readTasks(), readTodos(), readMetrics()]);
          const completedTasks = tasks.filter((task) => task.status === "completed").length;
          const inProgressTasks = tasks.filter((task) => task.status === "in_progress").length;
          const updatedAtCandidates = [todos.updatedAt, metrics.updatedAt].filter((value): value is number =>
            typeof value === "number",
          );
          const lastUpdatedAt =
            updatedAtCandidates.length > 0 ? updatedAtCandidates.sort((a, b) => b - a)[0] : null;
          const snapshot = {
            cwd: projectRoot,
            lastUpdatedAt,
            tasksCount: tasks.length,
            todosCount: todos.items.length,
            inProgressTasks,
            completedTasks,
            activeTodoCount: todos.items.filter((item) => item.status === "in_progress").length,
            tracesStarted: metrics.tracesStarted,
            toolCalls: metrics.toolCalls,
            toolFailures: metrics.toolFailures,
            hasObservability: metrics.updatedAt !== null || metrics.toolCalls > 0 || metrics.tracesStarted > 0,
          };
          const response = jsonResponse(snapshot);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(await response.text());
        });

        server.middlewares.use("/api/tasks", async (_req, res) => {
          const response = jsonResponse(await readTasks());
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(await response.text());
        });

        server.middlewares.use("/api/todos", async (_req, res) => {
          const response = jsonResponse(await readTodos());
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(await response.text());
        });

        server.middlewares.use("/api/observability/metrics", async (_req, res) => {
          const response = jsonResponse(await readMetrics());
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(await response.text());
        });

        server.middlewares.use("/api/observability/events", async (req, res) => {
          const url = req.url ? new URL(req.url, "http://localhost") : null;
          const traceId = url?.searchParams.get("trace_id");
          const events = await readEvents(traceId);
          const response = jsonResponse(events.slice(0, 80));
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(await response.text());
        });
      },
    },
  ],
});
