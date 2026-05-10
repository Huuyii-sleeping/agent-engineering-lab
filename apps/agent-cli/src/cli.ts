import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { agentLoop, type AgentRuntimeState } from "./agent-loop.js";
import { createClient, ensureModelConfigured, getStaticPromptSource, MODEL } from "./config.js";
import { runHooks } from "./hooks/index.js";
import { RUNTIME_CONFIG } from "./runtime-config.js";
import { setCompactRuntimeContext } from "./tools/base.js";
import { TOOLS } from "./tools/index.js";
import { peekScheduledNotificationCount, tickScheduler } from "./tools/scheduler.js";

const PROMPT = "\u001b[36ms01 >> \u001b[0m";

function appendSystemMessages(messages: ChatCompletionMessageParam[], items: string[]): void {
  for (const item of items) {
    const content = item.trim();
    if (!content) {
      continue;
    }
    messages.push({ role: "system", content });
  }
}

export async function runCli(): Promise<void> {
  ensureModelConfigured();
  const rl = createInterface({ input, output });
  const history: ChatCompletionMessageParam[] = [];
  setCompactRuntimeContext({ messages: history });
  const client = createClient();
  const promptSource = getStaticPromptSource();
  const runtimeState: AgentRuntimeState = {
    sessionId: randomUUID(),
    roundsWithoutTodo: 0,
    activeTaskId: null,
    lastMemoryInput: null,
    roundCounter: 0,
  };
  let agentBusy = false;
  const runScheduledRound = async (): Promise<void> => {
    if (agentBusy) {
      return;
    }
    await tickScheduler();
    if ((await peekScheduledNotificationCount()) === 0) {
      return;
    }
    agentBusy = true;
    try {
      history.push({ role: "user", content: "Handle any scheduled prompts that are due now." });
      await agentLoop({
        client,
        model: MODEL,
        promptSource,
        tools: TOOLS,
        messages: history,
        runtimeState,
      });
      const lastMessage = history[history.length - 1];
      if (lastMessage?.role === "assistant" && typeof lastMessage.content === "string") {
        console.log(`\n\u001b[36m[scheduled]\u001b[0m ${lastMessage.content}\n`);
      }
    } finally {
      agentBusy = false;
    }
  };
  const schedulerInterval = setInterval(() => {
    void runScheduledRound().catch(() => {});
  }, RUNTIME_CONFIG.schedulerPollIntervalMs);

  try {
    while (true) {
      let query = "";
      try {
        query = await rl.question(PROMPT);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ERR_USE_AFTER_CLOSE") {
          break;
        }
        throw error;
      }

      const normalized = query.trim().toLowerCase();
      if (!query.trim() || normalized === "q" || normalized === "exit") {
        break;
      }

      const promptHooks = await runHooks("UserPromptSubmit", {
        session_id: runtimeState.sessionId,
        payload: { prompt: query },
      });
      if (promptHooks.blocked) {
        console.log(`\u001b[31m[hook blocked]\u001b[0m ${promptHooks.blockReason ?? "prompt blocked by hook"}`);
        console.log();
        continue;
      }
      appendSystemMessages(history, promptHooks.messages);
      history.push({ role: "user", content: query });
      agentBusy = true;
      await agentLoop({
        client,
        model: MODEL,
        promptSource,
        tools: TOOLS,
        messages: history,
        runtimeState,
      });
      agentBusy = false;

      const lastMessage = history[history.length - 1];
      if (lastMessage?.role === "assistant" && typeof lastMessage.content === "string") {
        console.log(lastMessage.content);
      }
      console.log();
    }
  } finally {
    clearInterval(schedulerInterval);
    rl.close();
  }
}
