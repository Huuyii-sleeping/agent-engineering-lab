import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { appendSystemMessages } from "./query-messages.js";
import { markWriteSideEffect } from "./query-tool-results.js";
import { executeQueryFunctionToolCall } from "./query-tool-executor.js";
import { runPostToolUseHooks } from "./query-tool-hooks.js";
import { maybeAutoCompleteTaskFromTodo, syncActiveTaskState } from "./query-tool-task-sync.js";
import type { QueryFunctionToolCall, QueryToolStageResult, RunQueryToolStageOptions } from "./query-tool-types.js";
import {
  activateConditionalSkillsForPaths,
  getConfiguredSkillSummaries,
  toPromptSkillCatalogBlocks,
} from "../skills/loader.js";
import type { ToolRegistration } from "../tools/protocol.js";

export type { QueryToolStageResult } from "./query-tool-types.js";

function isFunctionToolCall(toolCall: NonNullable<RunQueryToolStageOptions["message"]["tool_calls"]>[number]): toolCall is QueryFunctionToolCall {
  return toolCall.type === "function";
}

type ToolWorkItem = {
  toolCall: QueryFunctionToolCall;
  registration: ToolRegistration | null;
};

function canRunInParallel(item: ToolWorkItem): boolean {
  return Boolean(item.registration?.execution.readOnly && item.registration.execution.parallelSafe);
}

async function buildToolWorkItems(opts: RunQueryToolStageOptions): Promise<ToolWorkItem[]> {
  const out: ToolWorkItem[] = [];
  for (const toolCall of opts.message.tool_calls ?? []) {
    if (!isFunctionToolCall(toolCall)) {
      continue;
    }
    const registration = opts.toolService.getToolRegistration
      ? await opts.toolService.getToolRegistration(toolCall.function.name)
      : null;
    out.push({ toolCall, registration });
  }
  return out;
}

function buildBatches(items: ToolWorkItem[]): ToolWorkItem[][] {
  const batches: ToolWorkItem[][] = [];
  let currentParallel: ToolWorkItem[] = [];
  for (const item of items) {
    if (canRunInParallel(item)) {
      currentParallel.push(item);
      continue;
    }
    if (currentParallel.length > 0) {
      batches.push(currentParallel);
      currentParallel = [];
    }
    batches.push([item]);
  }
  if (currentParallel.length > 0) {
    batches.push(currentParallel);
  }
  return batches;
}

function ensureActivatedSkillNames(opts: RunQueryToolStageOptions): Set<string> {
  if (!opts.runtimeState.activatedSkillNames) {
    opts.runtimeState.activatedSkillNames = new Set<string>();
  }
  return opts.runtimeState.activatedSkillNames;
}

function getFileToolPaths(toolName: string, toolArgs: Record<string, unknown>): string[] {
  if (toolName !== "read_file" && toolName !== "write_file" && toolName !== "edit_file") {
    return [];
  }
  const target = typeof toolArgs.path === "string" ? toolArgs.path.trim() : "";
  return target ? [target] : [];
}

function collectConditionalSkillActivationMessages(opts: {
  runtimeState: RunQueryToolStageOptions["runtimeState"];
  toolName: string;
  toolArgs: Record<string, unknown>;
}): string[] {
  const paths = getFileToolPaths(opts.toolName, opts.toolArgs);
  if (paths.length === 0) {
    return [];
  }
  const configured = getConfiguredSkillSummaries();
  const activatedSkillNames = opts.runtimeState.activatedSkillNames ?? new Set<string>();
  const newlyActivated = activateConditionalSkillsForPaths(configured.selected, paths).filter(
    (skill) => !activatedSkillNames.has(skill.name.toLowerCase()),
  );
  if (newlyActivated.length === 0) {
    return [];
  }
  if (!opts.runtimeState.activatedSkillNames) {
    opts.runtimeState.activatedSkillNames = activatedSkillNames;
  }
  for (const skill of newlyActivated) {
    activatedSkillNames.add(skill.name.toLowerCase());
  }
  return [
    [
      "<activated_skills>",
      "The following path-scoped skills now match files used in this session. Load full instructions with load_skill before applying them.",
      toPromptSkillCatalogBlocks(newlyActivated, { includeConditional: true }).join("\n\n"),
      "</activated_skills>",
    ].join("\n"),
  ];
}

export async function runQueryToolStage(opts: RunQueryToolStageOptions): Promise<QueryToolStageResult> {
  let usedTodo = false;
  ensureActivatedSkillNames(opts);
  const batches = buildBatches(await buildToolWorkItems(opts));

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    const parallel = batch.length > 1 && batch.every(canRunInParallel);
    await opts.observabilityService.recordEvent(
      "tool_batch",
      {
        batchIndex,
        mode: parallel ? "parallel" : "serial",
        toolNames: batch.map((item) => item.toolCall.function.name),
      },
      { traceId: opts.traceId },
    );

    const executions = parallel
      ? await Promise.all(
          batch.map(async (item) => {
            const localMessages: ChatCompletionMessageParam[] = [];
            const result = await executeQueryFunctionToolCall({
              toolCall: item.toolCall,
              messages: localMessages,
              runtimeState: opts.runtimeState,
              traceId: opts.traceId,
              toolService: opts.toolService,
              hookService: opts.hookService,
              observabilityService: opts.observabilityService,
            });
            return { result, localMessages };
          }),
        )
      : [
          {
            result: await executeQueryFunctionToolCall({
              toolCall: batch[0].toolCall,
              messages: opts.messages,
              runtimeState: opts.runtimeState,
              traceId: opts.traceId,
              toolService: opts.toolService,
              hookService: opts.hookService,
              observabilityService: opts.observabilityService,
            }),
            localMessages: [],
          },
        ];

    for (const execution of executions) {
      if (parallel) {
        opts.messages.push(...execution.localMessages);
      }
      const result = execution.result;

      if (result.blocked) {
        continue;
      }

      if (result.analyzed.ok) {
        markWriteSideEffect(opts.runtimeState, result.toolName, result.toolArgs);
        appendSystemMessages(
          opts.messages,
          collectConditionalSkillActivationMessages({
            runtimeState: opts.runtimeState,
            toolName: result.toolName,
            toolArgs: result.toolArgs,
          }),
        );
      }
      const postToolHooks = await runPostToolUseHooks({
        hookService: opts.hookService,
        runtimeState: opts.runtimeState,
        traceId: opts.traceId,
        spanId: result.spanId,
        toolName: result.toolName,
        toolArgs: result.toolArgs,
        toolOutput: result.toolOutput,
        toolOk: result.analyzed.ok,
        errorCode: result.analyzed.errorCode,
      });
      appendSystemMessages(opts.messages, postToolHooks.messages);

      const todoUsed = await maybeAutoCompleteTaskFromTodo({
        runtimeState: opts.runtimeState,
        toolName: result.toolName,
        toolArgs: result.toolArgs,
        traceId: opts.traceId,
        toolService: opts.toolService,
        observabilityService: opts.observabilityService,
      });
      usedTodo = usedTodo || todoUsed;

      syncActiveTaskState({
        runtimeState: opts.runtimeState,
        toolName: result.toolName,
        toolArgs: result.toolArgs,
        toolOutput: result.toolOutput,
      });
    }
  }

  return { usedTodo };
}
