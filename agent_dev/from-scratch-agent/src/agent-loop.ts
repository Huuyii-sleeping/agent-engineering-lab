import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { toAssistantMessage } from "./messages.js";
import { previewToolCall, runToolByName } from "./tools/index.js";

export type AgentRuntimeState = {
  roundsWithoutTodo: number;
  activeTaskId: number | null;
};

type AgentLoopOptions = {
  client: OpenAI;
  model: string;
  system: string;
  tools: ChatCompletionTool[];
  messages: ChatCompletionMessageParam[];
  runtimeState: AgentRuntimeState;
};

export async function agentLoop(opts: AgentLoopOptions): Promise<void> {
  const { client, model, system, tools, messages, runtimeState } = opts;

  const parseArgs = (raw: string): Record<string, unknown> => {
    try {
      return JSON.parse(raw || "{}") as Record<string, unknown>;
    } catch {
      return {};
    }
  };

  const parseTaskIdFromOutput = (output: string): number | null => {
    try {
      const parsed = JSON.parse(output) as { id?: unknown; error?: unknown };
      if (parsed && !parsed.error) {
        const id = Number(parsed.id);
        if (Number.isInteger(id) && id > 0) {
          return id;
        }
      }
      return null;
    } catch {
      return null;
    }
  };

  const isTodoAllCompleted = (args: Record<string, unknown>): boolean => {
    const items = args.items;
    if (!Array.isArray(items) || items.length === 0) {
      return false;
    }
    return items.every((item) => {
      if (typeof item !== "object" || item === null) {
        return false;
      }
      const status = String((item as Record<string, unknown>).status ?? "").toLowerCase();
      return status === "completed";
    });
  };

  while (true) {
    const requestMessages: ChatCompletionMessageParam[] = [{ role: "system", content: system }];
    if (runtimeState.roundsWithoutTodo >= 3) {
      requestMessages.push({
        role: "system",
        content: "<reminder>请调用 todo 工具更新任务列表并维护进度。</reminder>",
      });
    }
    requestMessages.push(...messages);

    const response = await client.chat.completions.create({
      model,
      messages: requestMessages,
      tools,
      max_tokens: 8_000,
    });

    const message = response.choices[0]?.message;
    if (!message) {
      return;
    }

    messages.push(toAssistantMessage(message));

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0) {
      runtimeState.roundsWithoutTodo += 1;
      return;
    }

    let usedTodo = false;
    for (const toolCall of toolCalls) {
      if (toolCall.type !== "function") {
        continue;
      }

      const toolArgs = parseArgs(toolCall.function.arguments);
      const preview = previewToolCall(toolCall.function.name, toolCall.function.arguments);
      console.log(`\u001b[33m$ ${preview}\u001b[0m`);
      const toolOutput = await runToolByName(toolCall.function.name, toolCall.function.arguments);
      console.log(toolOutput.slice(0, 200));

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolOutput,
      });

      if (toolCall.function.name === "todo") {
        usedTodo = true;

        if (runtimeState.activeTaskId && isTodoAllCompleted(toolArgs)) {
          const autoUpdateArgs = JSON.stringify({
            task_id: runtimeState.activeTaskId,
            status: "completed",
          });
          console.log(`\u001b[33m$ task_update ${runtimeState.activeTaskId} (auto)\u001b[0m`);
          const autoOutput = await runToolByName("task_update", autoUpdateArgs);
          console.log(autoOutput.slice(0, 200));
          runtimeState.activeTaskId = null;
        }
      }

      if (toolCall.function.name === "task_create") {
        const createdId = parseTaskIdFromOutput(toolOutput);
        if (createdId) {
          runtimeState.activeTaskId = createdId;
        }
      }

      if (toolCall.function.name === "task_update") {
        const taskId = Number(toolArgs.task_id);
        const status = String(toolArgs.status ?? "");
        if (runtimeState.activeTaskId && taskId === runtimeState.activeTaskId && status === "completed") {
          runtimeState.activeTaskId = null;
        }
      }
    }

    runtimeState.roundsWithoutTodo = usedTodo ? 0 : runtimeState.roundsWithoutTodo + 1;
  }
}
