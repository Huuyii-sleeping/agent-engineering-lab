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
  updatedAt: string | null;
  items: TodoItem[];
};

type ObservabilityMetrics = {
  schemaVersion: number;
  updatedAt: string | null;
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
  at: string;
  trace_id: string | null;
  span_id: string | null;
  kind: string;
  payload: Record<string, unknown>;
};

const webDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(webDir, "..");
const tasksDir = path.join(projectRoot, ".tasks");
const observabilityDir = path.join(projectRoot, ".observability");
const runtimeDir = path.join(projectRoot, ".runtime");

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
    updatedAt: parsed.updatedAt ? String(parsed.updatedAt) : null,
    items,
  };
}

async function readMetrics(): Promise<ObservabilityMetrics> {
  return readJsonFile<ObservabilityMetrics>(path.join(observabilityDir, "metrics.json"), {
    schemaVersion: 1,
    updatedAt: null,
    tracesStarted: 0,
    modelRequests: 0,
    modelResponses: 0,
    notifications: 0,
    securityBlocks: 0,
    toolCalls: 0,
    toolFailures: 0,
    totalToolDurationMs: 0,
    maxToolDurationMs: 0,
    estimatedPromptTokens: 0,
    completionTokens: 0,
    perTool: {},
  });
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
      const event = JSON.parse(line) as ObservabilityEvent;
      if (!traceId || event.trace_id === traceId) {
        events.push(event);
      }
    } catch {
      // ignore malformed events
    }
  }
  return events.sort((a, b) => (a.at < b.at ? 1 : -1));
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
          const updatedAtCandidates = [todos.updatedAt, metrics.updatedAt].filter(Boolean) as string[];
          const lastUpdatedAt =
            updatedAtCandidates.length > 0 ? updatedAtCandidates.sort((a, b) => (a < b ? 1 : -1))[0] : null;
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
