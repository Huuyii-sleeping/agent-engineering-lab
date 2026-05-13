import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { HookServiceLike } from "../services/index.js";
import { appendSystemMessages } from "./query-messages.js";
import type { AgentRuntimeState } from "./query-types.js";

export type UserPromptSubmitResult =
  | {
      ok: true;
      prompt: string;
    }
  | {
      ok: false;
      error: {
        code: "HOOK_BLOCKED";
        message: string;
      };
    };

export async function applyUserPromptSubmit(input: {
  history: ChatCompletionMessageParam[];
  runtimeState: AgentRuntimeState;
  prompt: string;
  hookService: HookServiceLike;
}): Promise<UserPromptSubmitResult> {
  const prompt = input.prompt.trim();
  const promptHooks = await input.hookService.run("UserPromptSubmit", {
    session_id: input.runtimeState.sessionId,
    payload: { prompt },
  });
  if (promptHooks.blocked) {
    return {
      ok: false,
      error: {
        code: "HOOK_BLOCKED",
        message: promptHooks.blockReason ?? "prompt blocked by hook",
      },
    };
  }

  appendSystemMessages(input.history, promptHooks.messages);
  input.history.push({ role: "user", content: prompt });
  return {
    ok: true,
    prompt,
  };
}
