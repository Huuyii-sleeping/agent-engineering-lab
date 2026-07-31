import {
  RuntimePortError,
  type AgentRunResult,
  type AgentRuntimePort,
  type GenerateAgentCommand,
  type RuntimeGateway,
} from "@orbit/runtime-contracts";
import { recordAuditEvent } from "../audit/runtime.js";
import type { AgentAppRuntimeDeps } from "../bootstrap/app-runtime.js";
import { AgentHost } from "../host/agent-host.js";
import type { AgentHostEvent } from "../host/events.js";
import type { AgentHostEventSubscriber } from "../host/events.js";
import { createAgentBridgeManifest, type AgentBridgeState } from "./bridge.js";
import {
  normalizeAgentRuntimeContext,
  summarizeSession,
  summarizeSessionTranscript,
  type AgentSessionRecord,
} from "./sessions.js";
import { resolveBoundSkills } from "../skills/loader.js";

export type AgentServiceDeps = AgentAppRuntimeDeps;

export type AgentServiceRuntimeOptions = {
  runtimeGateway: RuntimeGateway;
  runtimeInfo?: () => Promise<Record<string, unknown>> | Record<string, unknown>;
};

type ChatRequest = {
  session_id?: string;
  message?: string;
  agent?: unknown;
  include_scheduled_notifications?: boolean;
};

type ChatCallbacks = {
  onAssistantDelta?: (delta: string) => void | Promise<void>;
};

export type AgentServiceEvent = AgentHostEvent;

export type AgentServiceEventSubscriber = AgentHostEventSubscriber;

export class AgentService {
  private readonly host: AgentHost;
  private readonly toolService: AgentServiceDeps["toolService"];
  /** 工作流执行由 Agent runtime 负责，BFF 只消费此控制面。 */
  readonly workflowRuntime: RuntimeGateway["workflow"];
  /** 四个领域 Port 的进程内组合入口，生产路径唯一指向 Mastra。 */
  readonly runtimeGateway: RuntimeGateway;
  private readonly runtimeInfoProvider?: AgentServiceRuntimeOptions["runtimeInfo"];

  constructor(deps: AgentServiceDeps, host: AgentHost | undefined, runtimeOptions: AgentServiceRuntimeOptions) {
    this.host = host ?? new AgentHost(deps);
    this.toolService = deps.toolService;
    this.runtimeGateway = runtimeOptions.runtimeGateway;
    this.runtimeInfoProvider = runtimeOptions.runtimeInfo;
    this.workflowRuntime = this.runtimeGateway.workflow;
  }

  createSession(agent?: unknown): AgentSessionRecord {
    const normalizedAgent = normalizeAgentRuntimeContext(agent);
    const record = this.host.createSessionSync(normalizedAgent);
    void this.host.persistSession(record);
    return record;
  }

  async runtimeInfo(): Promise<Record<string, unknown>> {
    if (this.runtimeInfoProvider) return this.runtimeInfoProvider();
    const [agent, workflow] = await Promise.all([
      this.runtimeGateway.agent.capabilities(),
      this.runtimeGateway.workflow.capabilities(),
    ]);
    return {
      mode: "mastra-only",
      backends: {
        agent: { backend: "mastra", capabilities: agent },
        workflow: { backend: "mastra", capabilities: workflow },
      },
    };
  }

  listSessions(): AgentSessionRecord[] {
    return this.host.listSessions();
  }

  getSession(sessionId: string): AgentSessionRecord | null {
    return this.host.getSession(sessionId);
  }

  async toolsMetadata(): Promise<Array<Record<string, string>>> {
    return this.toolService.listToolMetadata();
  }

  async runToolByName(name: string, argumentsJson: string): Promise<string> {
    let input: unknown = {};
    try {
      input = JSON.parse(argumentsJson || "{}") as unknown;
    } catch {
      input = {};
    }
    try {
      const result = await this.runtimeGateway.tools.execute({
        toolId: name,
        input,
        ownerId: "local-direct-api",
        executor: { kind: "direct" },
        requestContext: { argumentsJson },
      });
      return typeof result.output === "string" ? result.output : JSON.stringify(result.output);
    } catch (error) {
      if (error instanceof RuntimePortError && typeof error.details.rawOutput === "string") {
        return error.details.rawOutput;
      }
      throw error;
    }
  }

  resolveAgentSkills(input: unknown): Record<string, unknown> {
    const agent = normalizeAgentRuntimeContext(input);
    if (!agent) {
      return {
        ok: false,
        error: {
          code: "INVALID_AGENT_CONTEXT",
          message: "agent context is required",
        },
      };
    }
    const resolvedSkills = resolveBoundSkills(agent);
    if (!resolvedSkills.ok) {
      return {
        ok: false,
        error: {
          code: "AGENT_SKILL_LOAD_FAILED",
          message: "agent skill binding could not be loaded",
          details: resolvedSkills.issues,
        },
        agent,
      };
    }
    return {
      ok: true,
      agent,
      skills: resolvedSkills.skills.map((skill) => ({
        name: skill.name,
        sourceType: skill.sourceType,
        path: skill.path,
        contentLength: skill.contentLength,
      })),
    };
  }

  getSessionDetail(sessionId: string): Record<string, unknown> | null {
    const session = this.getSession(sessionId);
    return session ? summarizeSessionTranscript(session) : null;
  }

  bridgeManifest(): Record<string, unknown> {
    return createAgentBridgeManifest();
  }

  bridgeState(): AgentBridgeState {
    const manifest = createAgentBridgeManifest();
    const sessions = this.listSessions().map((item) => summarizeSession(item));
    const eventWindow = this.host.eventWindow();
    return {
      ok: true,
      ready: true,
      name: manifest.name,
      version: manifest.version,
      capabilities: manifest.capabilities,
      session_count: sessions.length,
      sessions,
      latest_event_id: eventWindow.latestEventId,
      oldest_event_id: eventWindow.oldestEventId,
      buffered_event_count: eventWindow.bufferedEventCount,
    };
  }

  replayEventsSince(cursor: number | null): AgentServiceEvent[] {
    return this.host.listEventsSince(cursor);
  }

  subscribeEvents(subscriber: AgentServiceEventSubscriber): () => void {
    return this.host.subscribeEvents(subscriber);
  }

  async chat(
    input: ChatRequest,
    callbacks: ChatCallbacks = {},
    agentRuntime: AgentRuntimePort = this.runtimeGateway.agent,
  ): Promise<Record<string, unknown>> {
    const prompt = String(input.message ?? "").trim();
    if (!prompt) {
      return {
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "message is required",
        },
      };
    }

    const agent = normalizeAgentRuntimeContext(input.agent);
    const session = input.session_id
      ? this.getSession(String(input.session_id))
      : this.createSession(agent);
    if (!session) {
      return {
        ok: false,
        error: {
          code: "SESSION_NOT_FOUND",
          message: `session not found: ${String(input.session_id)}`,
        },
      };
    }
    if (session.busy) {
      return {
        ok: false,
        error: {
          code: "SESSION_BUSY",
          message: `session is busy: ${session.id}`,
        },
      };
    }
    if (agent) {
      session.agent = agent;
    }
    const ownerId = session.memoryBinding?.ownerId ?? "local-owner";
    const resourceId = session.memoryBinding?.resourceId ?? `session:${session.id}`;
    session.memoryBinding ??= {
      ownerId,
      resourceId,
      metadata: { source: "agent-session" },
    };
    await this.runtimeGateway.memory.createThread({
      id: session.id,
      ownerId,
      resourceId,
      metadata: { source: "agent-session" },
    });
    const allowedToolIds = (await this.toolService.listToolRegistrations()).map((tool) => tool.name);
    const command: GenerateAgentCommand = {
      agentId: session.agent?.id ?? "orbit-agent",
      agentVersion: session.agent?.skills.map((skill) => skill.version).filter(Boolean).join(",") || "default",
      sessionId: session.id,
      resourceId,
      threadId: session.id,
      messages: [{ role: "user", content: prompt }],
      requestContext: {
        ownerId,
        resourceId,
        threadId: session.id,
        includeScheduledNotifications: input.include_scheduled_notifications === true,
      },
      runtimeBinding: session.runtimeBinding,
      policy: {
        allowedToolIds,
        allowedSkillIds: session.agent?.skills.map((skill) => skill.skillId) ?? [],
      },
    };

    session.busy = true;
    session.updatedAt = Date.now();
    session.rounds += 1;
    session.history.push({ role: "user", content: prompt });
    await recordAuditEvent({
      category: "session",
      action: "chat",
      outcome: "started",
      subject: session.id,
      summary: "chat started",
      sessionId: session.id,
      metadata: {
        messageLength: prompt.length,
        rounds: session.rounds,
      },
    });
    this.host.emitEvent("chat.started", {
      session: summarizeSession(session),
      message: prompt,
    });
    try {
      let result: AgentRunResult | null = null;
      if (callbacks.onAssistantDelta) {
        for await (const event of agentRuntime.stream(command)) {
          if (event.type === "text.delta") await callbacks.onAssistantDelta(event.delta);
          if (event.type === "run.final") result = event.result;
        }
      } else {
        result = await agentRuntime.generate(command);
      }
      if (!result) throw new Error("Mastra Agent stream 未返回 run.final。");
      if (result.status !== "succeeded") {
        const error = result.error ?? {
          code: "MASTRA_AGENT_EXECUTION_FAILED",
          message: "Mastra Agent 执行失败。",
        };
        await recordAuditEvent({
          category: "session",
          action: "chat",
          outcome: "failed",
          subject: session.id,
          summary: error.message,
          sessionId: session.id,
          metadata: {
            errorCode: error.code,
            rounds: session.rounds,
          },
        });
        this.host.emitEvent("chat.failed", {
          session: summarizeSession(session),
          error,
        });
        return {
          ok: false,
          error,
          session: summarizeSession(session),
        };
      }
      session.history.push({ role: "assistant", content: result.text });
      session.updatedAt = Date.now();
      await recordAuditEvent({
        category: "session",
        action: "chat",
        outcome: "completed",
        subject: session.id,
        summary: "chat completed",
        sessionId: session.id,
        metadata: {
          messageCount: session.history.length,
          rounds: session.rounds,
        },
      });
      this.host.emitEvent("chat.completed", {
        session: summarizeSession(session),
        assistant: result.text,
      });
      return {
        ok: true,
        session: summarizeSession(session),
        assistant: result.text,
      };
    } catch (error) {
      await recordAuditEvent({
        category: "session",
        action: "chat",
        outcome: "failed",
        subject: session.id,
        summary: error instanceof Error ? error.message : String(error),
        sessionId: session.id,
        metadata: { rounds: session.rounds },
      });
      this.host.emitEvent("chat.failed", {
        session: summarizeSession(session),
        error: { code: "AGENT_EXECUTION_FAILED", message: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    } finally {
      session.busy = false;
      session.updatedAt = Date.now();
      await this.host.persistSession(session);
    }
  }
}
