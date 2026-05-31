import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type { HookEventName, HookRunResult } from "../../src/hooks/index.js";
import type { ObservabilityEvent } from "../../src/observability/runtime.js";
import type { StaticPromptSource } from "../../src/prompt/types.js";
import type {
  DeliveryServiceLike,
  MemoryInjectionResult,
  MemoryServiceLike,
  ModelPolicyServiceLike,
  NotificationServiceLike,
  PendingQueryNotifications,
  RuntimeCoordinationServiceLike,
  RuntimeServices,
} from "../../src/services/index.js";
import type { ModelRole, ModelSelection } from "../../src/model-policy.js";
import { QueryEngine } from "../../src/runtime/query-engine.js";
import type { AgentRuntimeState } from "../../src/runtime/query-types.js";
import type { ToolRegistration } from "../../src/tools/protocol.js";
import { toChatCompletionTool, toToolMetadata } from "../../src/tools/protocol.js";
import type { ToolServiceLike } from "../../src/tools/service.js";
import type { ScheduledPromptNotification } from "../../src/tools/scheduler.js";
import type { HarnessModelScriptItem } from "./model.js";
import {
  createDeterministicOpenAIClient,
  type DeterministicOpenAIClient,
  type HarnessOpenAIRequestRecord,
} from "./openai-client.js";
import {
  type HarnessWorkspace,
  type HarnessWorkspaceOptions,
  withHarnessWorkspace,
} from "./workspace.js";

export type HarnessToolHandlerInput = {
  args: Record<string, unknown>;
  argumentsJson: string;
  workspace: HarnessWorkspace;
};

export type HarnessAgentToolFixture = {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  output?: string;
  failure?: string;
  readOnly?: boolean;
  parallelSafe?: boolean;
  mutatesWorkspace?: boolean;
  handler?: (input: HarnessToolHandlerInput) => Promise<string> | string;
};

export type HarnessToolRecord = {
  toolName: string;
  toolCallId: string | null;
  argumentsJson: string;
  output: string;
  startedOrder: number;
  finishedOrder: number;
};

export type HarnessHookRecord = {
  event: HookEventName;
  invocation: {
    session_id: string;
    trace_id?: string;
    span_id?: string;
    payload: Record<string, unknown>;
  };
  result: HookRunResult;
};

export type HarnessAssertion =
  | {
      name: string;
      expectAssistantContains: string;
    }
  | {
      name: string;
      expectToolResultOrder: string[];
    }
  | {
      name: string;
      expectFile: { path: string; contains?: string; equals?: string; exists?: boolean };
    }
  | {
      name: string;
      expectTraceEvent: string;
    }
  | {
      name: string;
      expectMetric: {
        name: "modelRequests" | "modelResponses" | "toolCalls" | "toolFailures" | "notifications";
        equals: number;
      };
    }
  | {
      name: string;
      expectRuntimeState: Partial<
        Pick<AgentRuntimeState, "roundCounter" | "roundsWithoutTodo" | "wroteWorkspaceFiles">
      >;
    }
  | {
      name: string;
      expectBlockedStatus: string;
    };

export type HarnessAgentScenario = {
  name: string;
  workspace?: HarnessWorkspaceOptions;
  model: HarnessModelScriptItem[];
  modelName?: string;
  promptSource?: StaticPromptSource;
  messages?: ChatCompletionMessageParam[];
  tools?: ChatCompletionTool[];
  toolFixtures?: HarnessAgentToolFixture[];
  runtimeState?: Partial<AgentRuntimeState>;
  includeScheduledNotifications?: boolean;
  scheduledNotifications?: ScheduledPromptNotification[];
  hookBlocks?: Partial<Record<HookEventName, string>>;
  assertions?: HarnessAssertion[];
  timeoutMs?: number;
};

export type HarnessAgentScenarioStepResult = {
  name: string;
  status: "passed" | "failed";
  message?: string;
};

export type HarnessAgentScenarioResult = {
  name: string;
  status: "passed" | "failed";
  failedStep: string | null;
  steps: HarnessAgentScenarioStepResult[];
  stopReason: string | null;
  messages: ChatCompletionMessageParam[];
  runtimeState: AgentRuntimeState;
  toolRecords: HarnessToolRecord[];
  hookRecords: HarnessHookRecord[];
  observabilityEvents: ObservabilityEvent[];
  modelRequests: HarnessOpenAIRequestRecord[];
  toolConcurrency: {
    maxActive: number;
  };
};

type InternalToolRecord = Omit<HarnessToolRecord, "toolCallId">;

function parseToolArgs(argumentsJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(argumentsJson) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function createToolRegistration(fixture: HarnessAgentToolFixture): ToolRegistration {
  return {
    name: fixture.name,
    description: fixture.description ?? `${fixture.name} harness fixture`,
    parameters: fixture.parameters ?? { type: "object", properties: {} },
    target: "base",
    allowDuringReplay: true,
    execution: {
      readOnly: fixture.readOnly !== false,
      mutatesWorkspace: fixture.mutatesWorkspace === true,
      parallelSafe: fixture.parallelSafe === true,
      riskLevel: fixture.mutatesWorkspace ? "medium" : "low",
    },
  };
}

class HarnessToolService implements ToolServiceLike {
  readonly records: InternalToolRecord[] = [];
  readonly registrations: ToolRegistration[];
  private readonly fixtures: Map<string, HarnessAgentToolFixture>;
  private active = 0;
  private sequence = 0;
  maxActive = 0;

  constructor(
    fixtures: HarnessAgentToolFixture[],
    private readonly workspace: HarnessWorkspace,
  ) {
    this.fixtures = new Map(fixtures.map((fixture) => [fixture.name, fixture]));
    this.registrations = fixtures.map(createToolRegistration);
  }

  async listTools(): Promise<ChatCompletionTool[]> {
    return this.registrations.map(toChatCompletionTool);
  }

  async listToolRegistrations(): Promise<ToolRegistration[]> {
    return this.registrations.map((registration) => ({ ...registration }));
  }

  async listToolMetadata(): Promise<Array<Record<string, string>>> {
    return this.registrations.map(toToolMetadata);
  }

  async getToolRegistration(name: string): Promise<ToolRegistration | null> {
    return this.registrations.find((registration) => registration.name === name) ?? null;
  }

  previewToolCall(name: string, argumentsJson: string): string {
    return `${name}(${argumentsJson})`;
  }

  async runToolByName(name: string, argumentsJson: string): Promise<string> {
    const fixture = this.fixtures.get(name);
    if (!fixture) {
      throw new Error(`harness tool fixture not found: ${name}`);
    }
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    const startedOrder = ++this.sequence;
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (fixture.failure) {
        throw new Error(fixture.failure);
      }
      const args = parseToolArgs(argumentsJson);
      const output =
        fixture.handler !== undefined
          ? await fixture.handler({ args, argumentsJson, workspace: this.workspace })
          : (fixture.output ?? "");
      const finishedOrder = ++this.sequence;
      this.records.push({
        toolName: name,
        argumentsJson,
        output,
        startedOrder,
        finishedOrder,
      });
      return output;
    } finally {
      this.active -= 1;
    }
  }
}

class HarnessHookService {
  readonly records: HarnessHookRecord[] = [];

  constructor(private readonly blocks: Partial<Record<HookEventName, string>> = {}) {}

  async run(
    event: HookEventName,
    invocation: Omit<HarnessHookRecord["invocation"], "event" | "cwd">,
  ): Promise<HookRunResult> {
    const blockReason = this.blocks[event] ?? null;
    const result: HookRunResult = {
      blocked: blockReason !== null,
      blockReason,
      messages: [],
      matched: blockReason ? 1 : 0,
      executed: blockReason ? 1 : 0,
      errors: [],
    };
    this.records.push({
      event,
      invocation: {
        session_id: invocation.session_id,
        trace_id: invocation.trace_id,
        span_id: invocation.span_id,
        payload: { ...invocation.payload },
      },
      result,
    });
    return result;
  }
}

class HarnessObservabilityService {
  readonly events: ObservabilityEvent[] = [];
  private traceCounter = 0;
  private spanCounter = 0;

  createTraceId(): string {
    this.traceCounter += 1;
    return `trace_harness_${this.traceCounter}`;
  }

  createSpanId(): string {
    this.spanCounter += 1;
    return `span_harness_${this.spanCounter}`;
  }

  async withExecutionContext<T>(
    _context: { traceId: string; spanId?: string },
    fn: () => Promise<T>,
  ): Promise<T> {
    return fn();
  }

  async recordEvent(
    kind: string,
    payload: Record<string, unknown>,
    context?: { traceId?: string; spanId?: string },
  ): Promise<ObservabilityEvent> {
    const event: ObservabilityEvent = {
      schemaVersion: 1,
      id: `evt_harness_${this.events.length + 1}`,
      at: this.events.length + 1,
      trace_id: context?.traceId ?? null,
      span_id: context?.spanId ?? null,
      kind,
      payload: { ...payload },
    };
    this.events.push(event);
    return event;
  }
}

class HarnessMemoryService implements MemoryServiceLike {
  async autoExtract(): Promise<void> {}

  async buildInjectionForQuery(): Promise<MemoryInjectionResult> {
    return { content: null, usedEntries: 0, estimatedTokens: 0 };
  }

  async runAdd(): Promise<string> {
    return JSON.stringify({ ok: true });
  }

  async runSearch(): Promise<string> {
    return JSON.stringify({ ok: true, entries: [] });
  }

  async runList(): Promise<string> {
    return JSON.stringify({ ok: true, entries: [] });
  }
}

class HarnessNotificationService implements NotificationServiceLike {
  private scheduled: ScheduledPromptNotification[];

  constructor(scheduled: ScheduledPromptNotification[] = []) {
    this.scheduled = [...scheduled];
  }

  async drainPendingQueryNotifications(
    opts: { includeScheduled?: boolean } = {},
  ): Promise<PendingQueryNotifications> {
    const scheduled = opts.includeScheduled === false ? [] : this.scheduled.splice(0);
    return {
      scheduled,
      subagent: [],
      background: [],
      team: [],
    };
  }
}

class HarnessDeliveryService implements DeliveryServiceLike {
  async loadLatestReport(): Promise<null> {
    return null;
  }

  async runValidation() {
    return {
      summary: {
        status: "passed",
        passedStages: 1,
        totalStages: 1,
      },
      latestFailure: null,
    } as never;
  }

  async runValidateTool(): Promise<string> {
    return JSON.stringify({ ok: true });
  }

  async runReportTool(): Promise<string> {
    return JSON.stringify({ ok: true });
  }
}

class HarnessModelPolicyService implements ModelPolicyServiceLike {
  async selectModel(
    role: ModelRole,
    defaultModel: string,
    estimatedPromptTokens: number,
  ): Promise<ModelSelection> {
    return {
      role,
      model: defaultModel,
      fallbackModel: null,
      estimatedPromptTokens,
      estimatedPromptCostUsd: 0,
      budgetAction: "allow",
      budgetReason: null,
    };
  }

  async selectFallbackModel(): Promise<null> {
    return null;
  }

  async finalizeUsage(): Promise<void> {}
}

class HarnessRuntimeCoordinationService implements RuntimeCoordinationServiceLike {
  async runAutonomyTick(): Promise<{ ok: true; action: "idle" }> {
    return { ok: true, action: "idle" };
  }

  async tickScheduler(): Promise<void> {}

  async peekScheduledPromptCount(): Promise<number> {
    return 0;
  }
}

function defaultPromptSource(): StaticPromptSource {
  return {
    core: "You are a deterministic harness agent.",
    tools: [],
    skills: [],
    rules: [],
  };
}

export function createHarnessRuntimeState(
  overrides: Partial<AgentRuntimeState> = {},
): AgentRuntimeState {
  return {
    sessionId: "harness-session",
    roundsWithoutTodo: 0,
    activeTaskId: null,
    lastMemoryInput: null,
    roundCounter: 0,
    touchedPaths: new Set<string>(),
    wroteWorkspaceFiles: false,
    ...overrides,
  };
}

function cloneMessage(message: ChatCompletionMessageParam): ChatCompletionMessageParam {
  return JSON.parse(JSON.stringify(message)) as ChatCompletionMessageParam;
}

function extractStopReason(hookRecords: HarnessHookRecord[]): string | null {
  const stop = [...hookRecords].reverse().find((record) => record.event === "Stop");
  const outcome = stop?.invocation.payload.outcome;
  return typeof outcome === "string" ? outcome : null;
}

function buildToolRecords(
  messages: ChatCompletionMessageParam[],
  internalRecords: InternalToolRecord[],
): HarnessToolRecord[] {
  const toolMessages = messages.filter((message) => message.role === "tool") as Array<
    ChatCompletionMessageParam & { role: "tool"; tool_call_id?: string }
  >;
  return internalRecords.map((record, index) => ({
    ...record,
    toolCallId: toolMessages[index]?.tool_call_id ?? null,
  }));
}

function assertCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function countMetric(
  name: Extract<HarnessAssertion, { expectMetric: unknown }>["expectMetric"]["name"],
  events: ObservabilityEvent[],
): number {
  if (name === "modelRequests") {
    return events.filter((event) => event.kind === "model_request").length;
  }
  if (name === "modelResponses") {
    return events.filter((event) => event.kind === "model_response").length;
  }
  if (name === "toolCalls") {
    return events.filter((event) => event.kind === "tool_result").length;
  }
  if (name === "toolFailures") {
    return events.filter((event) => event.kind === "tool_result" && event.payload.ok === false)
      .length;
  }
  return events.filter((event) => event.kind === "notification").length;
}

async function runAssertion(
  assertion: HarnessAssertion,
  input: {
    workspace: HarnessWorkspace;
    messages: ChatCompletionMessageParam[];
    runtimeState: AgentRuntimeState;
    toolRecords: HarnessToolRecord[];
    observabilityEvents: ObservabilityEvent[];
    stopReason: string | null;
  },
): Promise<void> {
  if ("expectAssistantContains" in assertion) {
    assertCondition(
      input.messages.some(
        (message) =>
          message.role === "assistant" &&
          typeof message.content === "string" &&
          message.content.includes(assertion.expectAssistantContains),
      ),
      `assistant output did not contain ${assertion.expectAssistantContains}`,
    );
    return;
  }
  if ("expectToolResultOrder" in assertion) {
    assertCondition(
      JSON.stringify(input.toolRecords.map((record) => record.toolCallId)) ===
        JSON.stringify(assertion.expectToolResultOrder),
      `tool result order did not equal ${assertion.expectToolResultOrder.join(", ")}`,
    );
    return;
  }
  if ("expectFile" in assertion) {
    const exists = await input.workspace.exists(assertion.expectFile.path);
    if (assertion.expectFile.exists !== undefined) {
      assertCondition(
        exists === assertion.expectFile.exists,
        `${assertion.expectFile.path} existence expected ${assertion.expectFile.exists}`,
      );
    }
    if (!exists) {
      throw new Error(`${assertion.expectFile.path} does not exist`);
    }
    const content = await input.workspace.readText(assertion.expectFile.path);
    if (assertion.expectFile.equals !== undefined) {
      assertCondition(
        content === assertion.expectFile.equals,
        `${assertion.expectFile.path} did not equal expected content`,
      );
    }
    if (assertion.expectFile.contains !== undefined) {
      assertCondition(
        content.includes(assertion.expectFile.contains),
        `${assertion.expectFile.path} did not contain ${assertion.expectFile.contains}`,
      );
    }
    return;
  }
  if ("expectTraceEvent" in assertion) {
    assertCondition(
      input.observabilityEvents.some((event) => event.kind === assertion.expectTraceEvent),
      `trace event not recorded: ${assertion.expectTraceEvent}`,
    );
    return;
  }
  if ("expectMetric" in assertion) {
    const actual = countMetric(assertion.expectMetric.name, input.observabilityEvents);
    assertCondition(
      actual === assertion.expectMetric.equals,
      `metric ${assertion.expectMetric.name} expected ${assertion.expectMetric.equals} but got ${actual}`,
    );
    return;
  }
  if ("expectRuntimeState" in assertion) {
    for (const [key, value] of Object.entries(assertion.expectRuntimeState)) {
      assertCondition(
        input.runtimeState[key as keyof AgentRuntimeState] === value,
        `runtime state ${key} did not equal ${String(value)}`,
      );
    }
    return;
  }
  if ("expectBlockedStatus" in assertion) {
    assertCondition(
      input.stopReason === assertion.expectBlockedStatus,
      `stop reason did not equal ${assertion.expectBlockedStatus}`,
    );
  }
}

async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`harness scenario timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export async function runHarnessAgentScenario(
  scenario: HarnessAgentScenario,
): Promise<HarnessAgentScenarioResult> {
  const steps: HarnessAgentScenarioStepResult[] = [];
  let failedStep: string | null = null;
  let stopReason: string | null = null;
  const messages = (scenario.messages ?? []).map(cloneMessage);
  const runtimeState = createHarnessRuntimeState(scenario.runtimeState);
  let client: DeterministicOpenAIClient | null = null;
  let toolService: HarnessToolService | null = null;
  let hookService: HarnessHookService | null = null;
  let observabilityService: HarnessObservabilityService | null = null;
  let toolRecords: HarnessToolRecord[] = [];

  await withHarnessWorkspace(scenario.workspace ?? {}, async (workspace) => {
    client = createDeterministicOpenAIClient(scenario.model);
    toolService = new HarnessToolService(scenario.toolFixtures ?? [], workspace);
    hookService = new HarnessHookService(scenario.hookBlocks);
    observabilityService = new HarnessObservabilityService();
    const runtimeServices: RuntimeServices = {
      toolService,
      hookService,
      memoryService: new HarnessMemoryService(),
      notificationService: new HarnessNotificationService(scenario.scheduledNotifications),
      observabilityService,
      deliveryService: new HarnessDeliveryService(),
      modelPolicyService: new HarnessModelPolicyService(),
      runtimeCoordinationService: new HarnessRuntimeCoordinationService(),
    };
    const engine = new QueryEngine({
      client,
      model: scenario.modelName ?? "harness-model",
      promptSource: scenario.promptSource ?? defaultPromptSource(),
      runtimeServices,
    });

    try {
      await runWithTimeout(
        engine.run({
          messages,
          runtimeState,
          tools: scenario.tools,
          includeScheduledNotifications: scenario.includeScheduledNotifications,
        }),
        scenario.timeoutMs ?? 5_000,
      );
      steps.push({ name: "agent run", status: "passed" });
    } catch (error) {
      failedStep = "agent run";
      steps.push({
        name: "agent run",
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }

    stopReason = extractStopReason(hookService.records);
    toolRecords = buildToolRecords(messages, toolService.records);

    if (!failedStep) {
      for (const assertion of scenario.assertions ?? []) {
        try {
          await runAssertion(assertion, {
            workspace,
            messages,
            runtimeState,
            toolRecords,
            observabilityEvents: observabilityService.events,
            stopReason,
          });
          steps.push({ name: assertion.name, status: "passed" });
        } catch (error) {
          failedStep = assertion.name;
          steps.push({
            name: assertion.name,
            status: "failed",
            message: error instanceof Error ? error.message : String(error),
          });
          break;
        }
      }
    }
  });

  return {
    name: scenario.name,
    status: failedStep ? "failed" : "passed",
    failedStep,
    steps,
    stopReason,
    messages,
    runtimeState,
    toolRecords,
    hookRecords: hookService?.records ?? [],
    observabilityEvents: observabilityService?.events ?? [],
    modelRequests: client?.requests ?? [],
    toolConcurrency: {
      maxActive: toolService?.maxActive ?? 0,
    },
  };
}
