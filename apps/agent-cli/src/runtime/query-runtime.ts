import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { AgentAppRuntimeDeps } from "../bootstrap/app-runtime.js";
import { withCompactRuntimeContext } from "../tools/context-compact.js";
import { findLastAssistantText } from "./query-messages.js";
import type { AgentRuntimeState } from "./query-types.js";
import { applyUserPromptSubmit } from "./query-user-prompt.js";

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
  const promptSubmit = await applyUserPromptSubmit({
    history: opts.history,
    runtimeState: opts.runtimeState,
    prompt: opts.prompt,
    hookService: opts.app.hookService,
  });
  if (!promptSubmit.ok) {
    return {
      ok: false,
      error: promptSubmit.error,
    };
  }

  await withCompactRuntimeContext({ messages: opts.history }, async () =>
    opts.app.queryEngine.run({
      messages: opts.history,
      runtimeState: opts.runtimeState,
    }),
  );

  return {
    ok: true,
    assistant: findLastAssistantText(opts.history),
  };
}
