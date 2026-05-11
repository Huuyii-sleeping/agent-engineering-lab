import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { agentLoop, type AgentRuntimeState } from "./agent-loop.js";
import { createClient, ensureModelConfigured, getStaticPromptSource, MODEL } from "./config.js";
import { runHooks } from "./hooks/index.js";
import type { StaticPromptSource } from "./prompt/types.js";
import { RUNTIME_CONFIG } from "./runtime-config.js";
import { withCompactRuntimeContext } from "./tools/base.js";
import { listTools } from "./tools/index.js";
import { peekScheduledNotificationCount, tickScheduler } from "./tools/scheduler.js";

const PROMPT = "\u001b[36ms01 >> \u001b[0m";

type LineEditor = {
  line: string;
  write(input: string): void;
};

type ChunkWriter = {
  write(chunk: string): void;
};

type ScheduledRoundOptions = {
  isAgentBusy: () => boolean;
  setAgentBusy: (busy: boolean) => void;
  history: ChatCompletionMessageParam[];
  runtimeState: AgentRuntimeState;
  client: OpenAI;
  model: string;
  promptSource: StaticPromptSource;
  printAsyncEvent: (label: string, content: string) => void;
  schedulerTick?: typeof tickScheduler;
  peekScheduledCount?: typeof peekScheduledNotificationCount;
  loopRunner?: typeof agentLoop;
};

function appendSystemMessages(messages: ChatCompletionMessageParam[], items: string[]): void {
  for (const item of items) {
    const content = item.trim();
    if (!content) {
      continue;
    }
    messages.push({ role: "system", content });
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function renderAsyncCliEvent(opts: {
  output: ChunkWriter;
  prompt: string;
  label: string;
  content: string;
  waitingForInput: boolean;
  lineEditor?: LineEditor;
}): void {
  const body = opts.content.trim()
    ? `\u001b[36m[${opts.label}]\u001b[0m ${opts.content.trim()}`
    : `\u001b[36m[${opts.label}]\u001b[0m`;
  if (!opts.waitingForInput) {
    opts.output.write(`\n${body}\n`);
    return;
  }

  const bufferedInput = opts.lineEditor?.line ?? "";
  opts.output.write("\r\u001b[2K");
  opts.output.write(`\n${body}\n`);
  opts.output.write(opts.prompt);
  if (bufferedInput && opts.lineEditor) {
    opts.lineEditor.write(bufferedInput);
  }
}

export async function runScheduledRound(opts: ScheduledRoundOptions): Promise<boolean> {
  const schedulerTick = opts.schedulerTick ?? tickScheduler;
  const peekScheduledCount = opts.peekScheduledCount ?? peekScheduledNotificationCount;
  const loopRunner = opts.loopRunner ?? agentLoop;

  try {
    if (opts.isAgentBusy()) {
      return false;
    }
    await schedulerTick();
    const dueCount = await peekScheduledCount();
    if (dueCount === 0) {
      return false;
    }

    opts.setAgentBusy(true);
    opts.printAsyncEvent("scheduled due", `${dueCount} scheduled prompt${dueCount === 1 ? "" : "s"} due now.`);
    try {
      opts.history.push({ role: "user", content: "Handle any scheduled prompts that are due now." });
      const tools = await listTools();
      await withCompactRuntimeContext({ messages: opts.history }, async () =>
        loopRunner({
          client: opts.client,
          model: opts.model,
          promptSource: opts.promptSource,
          tools,
          messages: opts.history,
          runtimeState: opts.runtimeState,
        }),
      );
      const lastMessage = opts.history[opts.history.length - 1];
      if (lastMessage?.role === "assistant" && typeof lastMessage.content === "string" && lastMessage.content.trim()) {
        opts.printAsyncEvent("scheduled", lastMessage.content);
      } else {
        opts.printAsyncEvent(
          "scheduled",
          "Scheduled prompt processed without a text reply. Check tool output and side effects above.",
        );
      }
      return true;
    } catch (error) {
      opts.printAsyncEvent("scheduled error", formatError(error));
      return false;
    } finally {
      opts.setAgentBusy(false);
    }
  } catch (error) {
    opts.printAsyncEvent("scheduled error", formatError(error));
    return false;
  }
}

export async function runCli(): Promise<void> {
  ensureModelConfigured();
  const rl = createInterface({ input, output });
  const history: ChatCompletionMessageParam[] = [];
  const client = createClient();
  const promptSource = getStaticPromptSource();
  const runtimeState: AgentRuntimeState = {
    sessionId: randomUUID(),
    roundsWithoutTodo: 0,
    activeTaskId: null,
    lastMemoryInput: null,
    roundCounter: 0,
    touchedPaths: new Set<string>(),
    wroteWorkspaceFiles: false,
  };
  let agentBusy = false;
  let waitingForInput = false;
  const printAsyncEvent = (label: string, content: string) => {
    renderAsyncCliEvent({
      output,
      prompt: PROMPT,
      label,
      content,
      waitingForInput,
      lineEditor: rl,
    });
  };
  const schedulerInterval = setInterval(() => {
    void runScheduledRound({
      isAgentBusy: () => agentBusy,
      setAgentBusy: (busy) => {
        agentBusy = busy;
      },
      history,
      runtimeState,
      client,
      model: MODEL,
      promptSource,
      printAsyncEvent,
    });
  }, RUNTIME_CONFIG.schedulerPollIntervalMs);

  try {
    while (true) {
      let query = "";
      try {
        waitingForInput = true;
        query = await rl.question(PROMPT);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ERR_USE_AFTER_CLOSE") {
          break;
        }
        throw error;
      } finally {
        waitingForInput = false;
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
      const tools = await listTools();
      await withCompactRuntimeContext({ messages: history }, async () =>
        agentLoop({
          client,
          model: MODEL,
          promptSource,
          tools,
          messages: history,
          runtimeState,
        }),
      );
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
