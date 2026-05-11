import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { MODEL, createClient } from "../config.js";
import { classifyFallbackableError, MODEL_POLICY } from "../model-policy.js";
import { getExecutionContext, recordObservabilityEvent } from "../observability/runtime.js";
import { RUNTIME_CONFIG } from "../runtime-config.js";
import { nowTimestampMs } from "../time.js";
import { toAssistantMessage } from "../messages.js";
import { BASE_TOOLS, runBaseToolByName } from "./base.js";

type SubagentStatus = "idle" | "running" | "completed" | "failed" | "closed";

type SubagentRecord = {
  id: number;
  name: string;
  status: SubagentStatus;
  traceId: string | null;
  createdAt: number;
  updatedAt: number;
  lastInput: string | null;
  lastOutput: string | null;
  lastError: string | null;
};

type SubagentNotification = {
  agentId: number;
  agentName: string;
  status: "completed" | "failed";
  updatedAt: number;
  output?: string | null;
  error?: string | null;
};

function ok(data: Record<string, unknown>): string {
  return JSON.stringify({ ok: true, ...data }, null, 2);
}

function err(code: string, message: string, extra?: Record<string, unknown>): string {
  return JSON.stringify({ ok: false, error: { code, message }, ...(extra ?? {}) }, null, 2);
}

class SubagentManager {
  private nextId = 1;
  private readonly records = new Map<number, SubagentRecord>();
  private readonly runningJobs = new Map<number, Promise<void>>();
  private readonly notifications: SubagentNotification[] = [];
  private client: ReturnType<typeof createClient> | null = null;

  private now(): number {
    return nowTimestampMs();
  }

  private getRecord(agentIdArg: unknown): SubagentRecord | null {
    const agentId = Number(agentIdArg);
    if (!Number.isInteger(agentId) || agentId <= 0) {
      return null;
    }
    return this.records.get(agentId) ?? null;
  }

  private snapshot(record: SubagentRecord): Record<string, unknown> {
    return {
      id: record.id,
      name: record.name,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      lastInput: record.lastInput,
      lastOutput: record.lastOutput,
      lastError: record.lastError,
    };
  }

  private getClient(): ReturnType<typeof createClient> {
    if (!this.client) {
      this.client = createClient();
    }
    return this.client;
  }

  private pushCompletedNotification(record: SubagentRecord): void {
    void recordObservabilityEvent(
      "notification",
      {
        source: "subagent",
        agentId: record.id,
        agentName: record.name,
        status: "completed",
        output: record.lastOutput ?? "",
      },
      record.traceId ? { traceId: record.traceId } : undefined,
    );
    this.notifications.push({
      agentId: record.id,
      agentName: record.name,
      status: "completed",
      updatedAt: record.updatedAt,
      output: record.lastOutput,
    });
  }

  private pushFailedNotification(record: SubagentRecord): void {
    void recordObservabilityEvent(
      "notification",
      {
        source: "subagent",
        agentId: record.id,
        agentName: record.name,
        status: "failed",
        error: record.lastError ?? "",
      },
      record.traceId ? { traceId: record.traceId } : undefined,
    );
    this.notifications.push({
      agentId: record.id,
      agentName: record.name,
      status: "failed",
      updatedAt: record.updatedAt,
      error: record.lastError,
    });
  }

  async spawn(nameArg: unknown): Promise<string> {
    const name = String(nameArg ?? "").trim() || `worker-${this.nextId}`;
    const now = this.now();
    const record: SubagentRecord = {
      id: this.nextId,
      name,
      status: "idle",
      traceId: getExecutionContext()?.traceId ?? null,
      createdAt: now,
      updatedAt: now,
      lastInput: null,
      lastOutput: null,
      lastError: null,
    };
    this.records.set(record.id, record);
    this.nextId += 1;
    return ok({ agent: this.snapshot(record) });
  }

  async list(): Promise<string> {
    const agents = Array.from(this.records.values())
      .sort((a, b) => a.id - b.id)
      .map((record) => this.snapshot(record));
    return ok({ agents });
  }

  private async execute(record: SubagentRecord, prompt: string): Promise<void> {
    try {
      const client = this.getClient();
      const messages: ChatCompletionMessageParam[] = [
        {
          role: "system",
          content:
            "You are a focused worker agent. Use tools when needed and return concise factual results.",
        },
        { role: "user", content: prompt },
      ];

      for (let round = 0; round < RUNTIME_CONFIG.subagentMaxRounds; round += 1) {
        const promptTokens = Math.ceil(JSON.stringify(messages).length / 4);
        const selection = await MODEL_POLICY.selectModel("ops", MODEL, promptTokens);
        if (selection.budgetAction === "deny") {
          record.status = "failed";
          record.updatedAt = this.now();
          record.lastError = `MODEL_BUDGET_DENIED:${selection.budgetReason ?? "budget exceeded"}`;
          this.pushFailedNotification(record);
          return;
        }
        const selectedModel = selection.model;
        let modelUsed = selectedModel;
        let fallbackUsed = selection.budgetAction === "downgrade";
        let response;
        const startedAt = Date.now();
        try {
          response = await client.chat.completions.create({
            model: selectedModel,
            messages,
            tools: BASE_TOOLS,
            max_tokens: RUNTIME_CONFIG.subagentMaxTokens,
          });
        } catch (error) {
          if (selection.fallbackModel && classifyFallbackableError(error)) {
            modelUsed = selection.fallbackModel;
            fallbackUsed = true;
            response = await client.chat.completions.create({
              model: modelUsed,
              messages,
              tools: BASE_TOOLS,
              max_tokens: RUNTIME_CONFIG.subagentMaxTokens,
            });
          } else {
            throw error;
          }
        }

        const message = response.choices[0]?.message;
        if (!message) {
          break;
        }
        await MODEL_POLICY.finalizeUsage(
          {
            role: "ops",
            model: modelUsed,
            promptTokens,
            completionTokens: response.usage?.completion_tokens ?? 0,
            latencyMs: Date.now() - startedAt,
            fallbackUsed,
          },
          record.traceId ?? undefined,
        );
        messages.push(toAssistantMessage(message));

        const functionToolCalls = message.tool_calls?.filter(
          (toolCall): toolCall is ChatCompletionMessageFunctionToolCall => toolCall.type === "function",
        );

        if (!functionToolCalls || functionToolCalls.length === 0) {
          record.status = "completed";
          record.updatedAt = this.now();
          record.lastOutput = message.content ?? "";
          record.lastError = null;
          this.pushCompletedNotification(record);
          return;
        }

        for (const toolCall of functionToolCalls) {
          const toolOutput = await runBaseToolByName(toolCall.function.name, toolCall.function.arguments);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolOutput,
          });
        }
      }

      record.status = "failed";
      record.updatedAt = this.now();
      record.lastError = "SUBAGENT_MAX_ROUNDS_EXCEEDED";
      this.pushFailedNotification(record);
    } catch (error) {
      record.status = "failed";
      record.updatedAt = this.now();
      record.lastError = error instanceof Error ? error.message : String(error);
      this.pushFailedNotification(record);
    }
  }

  async send(agentIdArg: unknown, promptArg: unknown): Promise<string> {
    const record = this.getRecord(agentIdArg);
    if (!record) {
      return err("AGENT_NOT_FOUND", "subagent_send requires a valid agent_id");
    }
    if (record.status === "closed") {
      return err("AGENT_CLOSED", `agent ${record.id} is closed`);
    }
    if (record.status === "running") {
      return err("AGENT_BUSY", `agent ${record.id} is already running`);
    }

    const prompt = String(promptArg ?? "").trim();
    if (!prompt) {
      return err("INVALID_ARGUMENT", "subagent_send requires non-empty prompt");
    }

    record.status = "running";
    record.traceId = getExecutionContext()?.traceId ?? record.traceId;
    record.updatedAt = this.now();
    record.lastInput = prompt;
    record.lastOutput = null;
    record.lastError = null;

    const job = this.execute(record, prompt).finally(() => {
      this.runningJobs.delete(record.id);
    });
    this.runningJobs.set(record.id, job);

    return ok({ accepted: true, agent: this.snapshot(record) });
  }

  async wait(agentIdArg: unknown, timeoutMsArg: unknown): Promise<string> {
    const record = this.getRecord(agentIdArg);
    if (!record) {
      return err("AGENT_NOT_FOUND", "subagent_wait requires a valid agent_id");
    }

    const timeoutMsRaw =
      timeoutMsArg === undefined ? RUNTIME_CONFIG.subagentDefaultWaitTimeoutMs : Number(timeoutMsArg);
    if (!Number.isInteger(timeoutMsRaw) || timeoutMsRaw <= 0) {
      return err("INVALID_ARGUMENT", "timeout_ms must be a positive integer");
    }

    if (record.status !== "running") {
      return ok({ agent: this.snapshot(record) });
    }

    const runningJob = this.runningJobs.get(record.id);
    if (!runningJob) {
      return ok({ agent: this.snapshot(record) });
    }

    const timeoutPromise = new Promise<"timeout">((resolve) => {
      setTimeout(() => resolve("timeout"), timeoutMsRaw);
    });

    const result = await Promise.race([runningJob.then(() => "done" as const), timeoutPromise]);
    if (result === "timeout") {
      return err("WAIT_TIMEOUT", `agent ${record.id} did not finish within ${timeoutMsRaw}ms`, {
        agent: this.snapshot(record),
      });
    }

    return ok({ agent: this.snapshot(record) });
  }

  async close(agentIdArg: unknown): Promise<string> {
    const record = this.getRecord(agentIdArg);
    if (!record) {
      return err("AGENT_NOT_FOUND", "subagent_close requires a valid agent_id");
    }
    if (record.status === "running") {
      return err("AGENT_BUSY", `agent ${record.id} is running and cannot be closed`);
    }
    if (record.status === "closed") {
      return ok({ agent: this.snapshot(record) });
    }

    record.status = "closed";
    record.updatedAt = this.now();
    return ok({ agent: this.snapshot(record) });
  }

  drainNotifications(): SubagentNotification[] {
    const copy = [...this.notifications];
    this.notifications.length = 0;
    return copy;
  }
}

const SUBAGENTS = new SubagentManager();

export const SUBAGENT_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "subagent_spawn",
      description: "Create a new subagent worker.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "subagent_send",
      description: "Send a text task to a subagent asynchronously.",
      parameters: {
        type: "object",
        properties: {
          agent_id: { type: "integer" },
          prompt: { type: "string" },
        },
        required: ["agent_id", "prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "subagent_wait",
      description: "Wait for a subagent run to finish.",
      parameters: {
        type: "object",
        properties: {
          agent_id: { type: "integer" },
          timeout_ms: { type: "integer" },
        },
        required: ["agent_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "subagent_list",
      description: "List current subagent states.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "subagent_close",
      description: "Close a subagent.",
      parameters: {
        type: "object",
        properties: {
          agent_id: { type: "integer" },
        },
        required: ["agent_id"],
      },
    },
  },
];

export function drainSubagentNotifications(): SubagentNotification[] {
  return SUBAGENTS.drainNotifications();
}

export async function runSubagentSpawn(name: unknown): Promise<string> {
  return SUBAGENTS.spawn(name);
}

export async function runSubagentSend(agentId: unknown, prompt: unknown): Promise<string> {
  return SUBAGENTS.send(agentId, prompt);
}

export async function runSubagentWait(agentId: unknown, timeoutMs: unknown): Promise<string> {
  return SUBAGENTS.wait(agentId, timeoutMs);
}

export async function runSubagentList(): Promise<string> {
  return SUBAGENTS.list();
}

export async function runSubagentClose(agentId: unknown): Promise<string> {
  return SUBAGENTS.close(agentId);
}
