import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { createAgentAppRuntime, createAgentRuntimeState, type AgentAppRuntimeDeps } from "./bootstrap/app-runtime.js";
import { RUNTIME_CONFIG } from "./runtime-config.js";
import { runUserQuery } from "./runtime/query-runtime.js";
import type { AgentRuntimeState } from "./runtime/query-types.js";
import { withCompactRuntimeContext } from "./tools/base.js";
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
  promptSource: AgentAppRuntimeDeps["promptSource"];
  printAsyncEvent: (label: string, content: string) => void;
  schedulerTick?: typeof tickScheduler;
  peekScheduledCount?: typeof peekScheduledNotificationCount;
  queryEngine?: AgentAppRuntimeDeps["queryEngine"];
};

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
  const queryEngine = opts.queryEngine;

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
      if (!queryEngine) {
        throw new Error("scheduled round requires queryEngine");
      }
      await withCompactRuntimeContext({ messages: opts.history }, async () =>
        queryEngine.run({
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

type RunCliOverrides = Partial<AgentAppRuntimeDeps>;

export async function runCli(overrides: RunCliOverrides = {}): Promise<void> {
  const app = createAgentAppRuntime(overrides);
  const rl = createInterface({ input, output });
  const history: ChatCompletionMessageParam[] = [];
  const runtimeState = createAgentRuntimeState(randomUUID());
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
      client: app.client,
      model: app.model,
      promptSource: app.promptSource,
      printAsyncEvent,
      queryEngine: app.queryEngine,
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

      agentBusy = true;
      try {
        const result = await runUserQuery({
          app,
          history,
          runtimeState,
          prompt: query,
        });
        if (!result.ok) {
          console.log(`\u001b[31m[hook blocked]\u001b[0m ${result.error.message}`);
          console.log();
          continue;
        }
        if (result.assistant) {
          console.log(result.assistant);
        }
        console.log();
      } finally {
        agentBusy = false;
      }
    }
  } finally {
    clearInterval(schedulerInterval);
    rl.close();
  }
}
