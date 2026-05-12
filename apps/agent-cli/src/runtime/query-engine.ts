import { toAssistantMessage } from "../messages.js";
import type { StaticPromptSource } from "../prompt/types.js";
import {
  finalizeAssistantOnlyRound,
  finalizeToolDrivenRound,
  runQueryStopStage,
} from "./query-finalization.js";
import { requestQueryModel } from "./query-model.js";
import { prepareQueryRound } from "./query-preparation.js";
import { runQueryToolStage } from "./query-tools.js";
import { RUNTIME_CONFIG } from "../runtime-config.js";
import type { QueryEngineRunInput } from "./query-types.js";
import type OpenAI from "openai";
import type { RuntimeServices } from "../services/runtime-services.js";

type QueryEngineDeps = {
  client: OpenAI;
  model: string;
  promptSource: StaticPromptSource;
  runtimeServices: RuntimeServices;
};

export class QueryEngine {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly promptSource: StaticPromptSource;
  private readonly runtimeServices: RuntimeServices;

  constructor(deps: QueryEngineDeps) {
    this.client = deps.client;
    this.model = deps.model;
    this.promptSource = deps.promptSource;
    this.runtimeServices = deps.runtimeServices;
  }

  async run(opts: QueryEngineRunInput): Promise<void> {
    const summarizeText = (value: string, max = 160): string => {
      const trimmed = value.trim();
      if (trimmed.length <= max) {
        return trimmed;
      }
      return `${trimmed.slice(0, max)}...`;
    };

    while (true) {
      opts.runtimeState.roundCounter += 1;
      opts.runtimeState.touchedPaths.clear();
      opts.runtimeState.wroteWorkspaceFiles = false;
      const traceId = this.runtimeServices.observabilityService.createTraceId();
      let stopReason = "tool_calls_processed";
      let stopToolCallCount = 0;
      const latestUser = [...opts.messages]
        .reverse()
        .find((item) => item.role === "user" && typeof item.content === "string") as
        | { role: "user"; content: string }
        | undefined;
      try {
        const tools = opts.tools ?? (await this.runtimeServices.toolService.listTools());
        await this.runtimeServices.observabilityService.recordEvent(
          "loop_start",
          {
            round: opts.runtimeState.roundCounter,
            latestUserInput: latestUser?.content ? summarizeText(latestUser.content) : "",
          },
          { traceId },
        );
        const preparedRound = await prepareQueryRound({
          runtimeState: opts.runtimeState,
          traceId,
          latestUserInput: latestUser?.content ?? "",
          hookService: this.runtimeServices.hookService,
          memoryService: this.runtimeServices.memoryService,
          notificationService: this.runtimeServices.notificationService,
          observabilityService: this.runtimeServices.observabilityService,
          runtimeCoordinationService: this.runtimeServices.runtimeCoordinationService,
        });
        if (!preparedRound.ok) {
          stopReason = "session_start_blocked";
          opts.messages.push({
            role: "assistant",
            content: `Current round blocked by hook: ${preparedRound.blockedReason}`,
          });
          return;
        }
        const modelResult = await requestQueryModel({
          client: this.client,
          model: this.model,
          promptSource: this.promptSource,
          tools,
          messages: opts.messages,
          runtimeState: opts.runtimeState,
          traceId,
          latestUserInput: latestUser?.content ?? "",
          memoryContext: preparedRound.memoryContext,
          dynamicSystemMessages: preparedRound.dynamicSystemMessages,
          modelPolicyService: this.runtimeServices.modelPolicyService,
          observabilityService: this.runtimeServices.observabilityService,
        });
        if (!modelResult.ok) {
          stopReason = modelResult.stopReason;
          return;
        }

        opts.messages.push(toAssistantMessage(modelResult.message));

        const toolCalls = modelResult.message.tool_calls ?? [];
        stopToolCallCount = toolCalls.length;
        if (toolCalls.length === 0) {
          stopReason = finalizeAssistantOnlyRound(opts.runtimeState).stopReason;
          return;
        }

        const toolStage = await runQueryToolStage({
          message: modelResult.message,
          messages: opts.messages,
          runtimeState: opts.runtimeState,
          traceId,
          toolService: this.runtimeServices.toolService,
          hookService: this.runtimeServices.hookService,
          observabilityService: this.runtimeServices.observabilityService,
        });

        stopReason = (
          await finalizeToolDrivenRound({
            messages: opts.messages,
            runtimeState: opts.runtimeState,
            traceId,
            usedTodo: toolStage.usedTodo,
            deliveryAutoRunEnabled: RUNTIME_CONFIG.deliveryAutoRunEnabled,
            deliveryService: this.runtimeServices.deliveryService,
          })
        ).stopReason;
      } finally {
        await runQueryStopStage({
          messages: opts.messages,
          runtimeState: opts.runtimeState,
          traceId,
          stopReason,
          stopToolCallCount,
          hookService: this.runtimeServices.hookService,
        });
      }
    }
  }
}
