import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import { sanitizeAndRedactText, sanitizeMcpIdentifier } from "../security/data-hygiene.js";
import { RUNTIME_CONFIG } from "../runtime-config.js";
import { nowTimestampMs, parseTimestampMs } from "../time.js";

type ObservabilityMetrics = {
  schemaVersion: number;
  updatedAt: number;
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
  estimatedModelCostUsd: number;
  totalModelLatencyMs: number;
  perModel: Record<
    string,
    {
      requests: number;
      estimatedCostUsd: number;
      totalLatencyMs: number;
    }
  >;
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
  at: number;
  trace_id: string | null;
  span_id: string | null;
  kind: string;
  payload: Record<string, unknown>;
};

export type ExecutionContext = {
  traceId: string;
  spanId?: string;
  replayMode?: "dry_run" | "live";
};

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function trimText(value: string, limit = RUNTIME_CONFIG.observabilityFieldMaxChars): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}...`;
}

function sanitizePrimitiveString(value: string, key?: string, mcpContext = false): string {
  if (key === "serverName" && mcpContext) {
    return "[mcp_server]";
  }
  if (key === "remoteTool" && mcpContext) {
    return "[mcp_remote_tool]";
  }
  const cleaned = sanitizeAndRedactText(value);
  return trimText(cleaned.startsWith("mcp__") ? sanitizeMcpIdentifier(cleaned) : cleaned);
}

function sanitizeValue(value: unknown, key?: string, mcpContext = false): unknown {
  if (typeof value === "string") {
    return sanitizePrimitiveString(value, key, mcpContext);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, key, mcpContext));
  }
  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(input)) {
      out[key] = sanitizeValue(item, key, mcpContext);
    }
    return out;
  }
  return value;
}

function defaultMetrics(): ObservabilityMetrics {
  return {
    schemaVersion: 1,
    updatedAt: nowTimestampMs(),
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
    estimatedModelCostUsd: 0,
    totalModelLatencyMs: 0,
    perModel: {},
    perTool: {},
  };
}

class ObservabilityRuntime {
  private initRoot: string | null = null;
  private initPromise: Promise<void> | null = null;
  private metrics: ObservabilityMetrics | null = null;
  private activeContext: ExecutionContext | null = null;

  private paths(): { root: string; eventsPath: string; metricsPath: string } {
    const root = path.join(process.cwd(), ".observability");
    return {
      root,
      eventsPath: path.join(root, "events.jsonl"),
      metricsPath: path.join(root, "metrics.json"),
    };
  }

  private async ensureInit(): Promise<void> {
    const paths = this.paths();
    if (this.initRoot !== paths.root) {
      this.initRoot = paths.root;
      this.metrics = null;
      this.initPromise = (async () => {
        await mkdir(paths.root, { recursive: true });
        await this.ensureFile(paths.eventsPath, "");
        await this.ensureFile(paths.metricsPath, `${JSON.stringify(defaultMetrics(), null, 2)}\n`);
      })();
    }
    await this.initPromise;
  }

  private async ensureFile(filePath: string, content: string): Promise<void> {
    try {
      await readFile(filePath, "utf8");
    } catch {
      await writeFile(filePath, content, "utf8");
    }
  }

  private async loadMetrics(): Promise<ObservabilityMetrics> {
    await this.ensureInit();
    if (this.metrics) {
      return this.metrics;
    }
    const { metricsPath } = this.paths();
    const raw = await readFile(metricsPath, "utf8").catch(() => "");
    try {
      const parsed = JSON.parse(raw) as Partial<ObservabilityMetrics>;
      this.metrics = {
        ...defaultMetrics(),
        ...parsed,
        schemaVersion: 1,
        updatedAt: parseTimestampMs(parsed.updatedAt, nowTimestampMs()),
        perModel: parsed.perModel && typeof parsed.perModel === "object" ? parsed.perModel : {},
        perTool: parsed.perTool && typeof parsed.perTool === "object" ? parsed.perTool : {},
      };
    } catch {
      this.metrics = defaultMetrics();
    }
    return this.metrics;
  }

  private async saveMetrics(): Promise<void> {
    const metrics = await this.loadMetrics();
    const { metricsPath } = this.paths();
    metrics.updatedAt = nowTimestampMs();
    await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`, "utf8");
  }

  private updateMetrics(kind: string, payload: Record<string, unknown>, metrics: ObservabilityMetrics): void {
    if (kind === "loop_start") {
      metrics.tracesStarted += 1;
      return;
    }
    if (kind === "model_request") {
      metrics.modelRequests += 1;
      metrics.estimatedPromptTokens += Number(payload.estimatedPromptTokens ?? 0) || 0;
      return;
    }
    if (kind === "model_response") {
      metrics.modelResponses += 1;
      metrics.completionTokens += Number(payload.completionTokens ?? 0) || 0;
      return;
    }
    if (kind === "model_policy_usage") {
      const model = String(payload.model ?? "unknown");
      const latencyMs = Number(payload.latencyMs ?? 0) || 0;
      const estimatedCostUsd = Number(payload.estimatedCostUsd ?? 0) || 0;
      metrics.estimatedModelCostUsd += estimatedCostUsd;
      metrics.totalModelLatencyMs += latencyMs;
      const bucket = metrics.perModel[model] ?? { requests: 0, estimatedCostUsd: 0, totalLatencyMs: 0 };
      bucket.requests += 1;
      bucket.estimatedCostUsd += estimatedCostUsd;
      bucket.totalLatencyMs += latencyMs;
      metrics.perModel[model] = bucket;
      return;
    }
    if (kind === "notification" || kind === "background_task") {
      metrics.notifications += 1;
      return;
    }
    if (kind === "security_blocked") {
      metrics.securityBlocks += 1;
      return;
    }
    if (kind !== "tool_result") {
      return;
    }

    const toolName = String(payload.toolName ?? "unknown");
    const durationMs = Number(payload.durationMs ?? 0) || 0;
    const ok = payload.ok !== false;
    metrics.toolCalls += 1;
    metrics.totalToolDurationMs += durationMs;
    metrics.maxToolDurationMs = Math.max(metrics.maxToolDurationMs, durationMs);
    if (!ok) {
      metrics.toolFailures += 1;
    }
    const bucket = metrics.perTool[toolName] ?? { calls: 0, failures: 0, totalDurationMs: 0 };
    bucket.calls += 1;
    bucket.totalDurationMs += durationMs;
    if (!ok) {
      bucket.failures += 1;
    }
    metrics.perTool[toolName] = bucket;
  }

  createTraceId(): string {
    return makeId("trace");
  }

  createSpanId(): string {
    return makeId("span");
  }

  setExecutionContext(context: ExecutionContext | null): void {
    this.activeContext = context;
  }

  getExecutionContext(): ExecutionContext | null {
    return this.activeContext;
  }

  async withExecutionContext<T>(context: ExecutionContext, fn: () => Promise<T>): Promise<T> {
    const previous = this.activeContext;
    this.activeContext = context;
    try {
      return await fn();
    } finally {
      this.activeContext = previous;
    }
  }

  isReplayDryRun(): boolean {
    return this.activeContext?.replayMode === "dry_run";
  }

  async recordEvent(
    kind: string,
    payload: Record<string, unknown>,
    context?: Partial<ExecutionContext>,
  ): Promise<ObservabilityEvent> {
    await this.ensureInit();
    const active = this.activeContext;
    const traceId = context?.traceId ?? active?.traceId ?? null;
    const spanId = context?.spanId ?? active?.spanId ?? null;
    const mcpContext = kind.startsWith("mcp") || String(payload.toolName ?? "").startsWith("mcp__");
    const event: ObservabilityEvent = {
      schemaVersion: 1,
      id: makeId("evt"),
      at: nowTimestampMs(),
      trace_id: traceId,
      span_id: spanId,
      kind,
      payload: sanitizeValue(payload, undefined, mcpContext) as Record<string, unknown>,
    };
    const { eventsPath } = this.paths();
    await appendFile(eventsPath, `${JSON.stringify(event)}\n`, "utf8");
    const metrics = await this.loadMetrics();
    this.updateMetrics(kind, event.payload, metrics);
    await this.saveMetrics();
    return event;
  }

  async readEvents(traceId?: string): Promise<ObservabilityEvent[]> {
    await this.ensureInit();
    const { eventsPath } = this.paths();
    const raw = await readFile(eventsPath, "utf8").catch(() => "");
    const lines = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const out: ObservabilityEvent[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as Partial<ObservabilityEvent>;
        const normalized: ObservabilityEvent = {
          schemaVersion: Number(parsed.schemaVersion ?? 1) || 1,
          id: String(parsed.id ?? ""),
          at: parseTimestampMs(parsed.at, 0),
          trace_id: typeof parsed.trace_id === "string" ? parsed.trace_id : null,
          span_id: typeof parsed.span_id === "string" ? parsed.span_id : null,
          kind: String(parsed.kind ?? ""),
          payload:
            parsed.payload && typeof parsed.payload === "object" ? (parsed.payload as Record<string, unknown>) : {},
        };
        if (!traceId || normalized.trace_id === traceId) {
          out.push(normalized);
        }
      } catch {
        // ignore malformed line
      }
    }
    return out;
  }
}

const OBSERVABILITY = new ObservabilityRuntime();

export function createTraceId(): string {
  return OBSERVABILITY.createTraceId();
}

export function createSpanId(): string {
  return OBSERVABILITY.createSpanId();
}

export function getExecutionContext(): ExecutionContext | null {
  return OBSERVABILITY.getExecutionContext();
}

export function setExecutionContext(context: ExecutionContext | null): void {
  OBSERVABILITY.setExecutionContext(context);
}

export async function withExecutionContext<T>(context: ExecutionContext, fn: () => Promise<T>): Promise<T> {
  return OBSERVABILITY.withExecutionContext(context, fn);
}

export function isReplayDryRun(): boolean {
  return OBSERVABILITY.isReplayDryRun();
}

export async function recordObservabilityEvent(
  kind: string,
  payload: Record<string, unknown>,
  context?: Partial<ExecutionContext>,
): Promise<ObservabilityEvent> {
  return OBSERVABILITY.recordEvent(kind, payload, context);
}

export async function readObservabilityEvents(traceId?: string): Promise<ObservabilityEvent[]> {
  return OBSERVABILITY.readEvents(traceId);
}
