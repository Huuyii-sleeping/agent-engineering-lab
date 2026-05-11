import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { AgentRuntimeState } from "../agent-loop.js";
import type { AgentAppRuntimeDeps } from "../bootstrap/app-runtime.js";
import { runHooks } from "../hooks/index.js";
import { appendSystemMessages, findLastAssistantText } from "./query-messages.js";
import { withCompactRuntimeContext } from "../tools/base.js";

export type QueryRuntimeResult =
  | {
      ok: true;
      assistant: string;
    }
  | {
      ok: false;
      error: {
        code: "HOOK_BLOCKED";
        message: string;
      };
    };

type RunUserQueryOptions = {
  app: AgentAppRuntimeDeps;
  history: ChatCompletionMessageParam[];
  runtimeState: AgentRuntimeState;
  prompt: string;
};

export async function runUserQuery(opts: RunUserQueryOptions): Promise<QueryRuntimeResult> {
  const prompt = opts.prompt.trim();
  const promptHooks = await runHooks("UserPromptSubmit", {
    session_id: opts.runtimeState.sessionId,
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

  appendSystemMessages(opts.history, promptHooks.messages);
  opts.history.push({ role: "user", content: prompt });
  const tools = await opts.app.toolsResolver();
  await withCompactRuntimeContext({ messages: opts.history }, async () =>
    opts.app.loopRunner({
      client: opts.app.client,
      model: opts.app.model,
      promptSource: opts.app.promptSource,
      tools,
      messages: opts.history,
      runtimeState: opts.runtimeState,
    }),
  );

  return {
    ok: true,
    assistant: findLastAssistantText(opts.history),
  };
}
