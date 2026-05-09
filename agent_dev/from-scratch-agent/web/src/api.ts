export type TodoStatus = "pending" | "in_progress" | "completed";

export type TodoItem = {
  id: string;
  text: string;
  status: TodoStatus;
};

export type TodoSnapshot = {
  schemaVersion: number;
  updatedAt: string | null;
  items: TodoItem[];
};

export type TaskItem = {
  schemaVersion: number;
  id: number;
  subject: string;
  description: string;
  status: TodoStatus;
  blockedBy: number[];
  owner: string;
  worktree: string | null;
};

export type ObservabilityMetrics = {
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

export type ObservabilityEvent = {
  schemaVersion: number;
  id: string;
  at: string;
  trace_id: string | null;
  span_id: string | null;
  kind: string;
  payload: Record<string, unknown>;
};

export type RuntimeSnapshot = {
  cwd: string;
  lastUpdatedAt: string | null;
  tasksCount: number;
  todosCount: number;
  inProgressTasks: number;
  completedTasks: number;
  activeTodoCount: number;
  tracesStarted: number;
  toolCalls: number;
  toolFailures: number;
  hasObservability: boolean;
};

async function requestJson<T>(input: string): Promise<T> {
  const response = await fetch(input);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export function fetchRuntimeSnapshot(): Promise<RuntimeSnapshot> {
  return requestJson<RuntimeSnapshot>("/api/runtime/snapshot");
}

export function fetchTasks(): Promise<TaskItem[]> {
  return requestJson<TaskItem[]>("/api/tasks");
}

export function fetchTodos(): Promise<TodoSnapshot> {
  return requestJson<TodoSnapshot>("/api/todos");
}

export function fetchObservabilityMetrics(): Promise<ObservabilityMetrics> {
  return requestJson<ObservabilityMetrics>("/api/observability/metrics");
}

export function fetchObservabilityEvents(traceId?: string): Promise<ObservabilityEvent[]> {
  const suffix = traceId ? `?trace_id=${encodeURIComponent(traceId)}` : "";
  return requestJson<ObservabilityEvent[]>(`/api/observability/events${suffix}`);
}
