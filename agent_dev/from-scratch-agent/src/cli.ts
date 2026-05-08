import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { agentLoop, type AgentRuntimeState } from "./agent-loop.js";
import { createClient, MODEL, SYSTEM } from "./config.js";
import { setCompactRuntimeContext } from "./tools/base.js";
import { TOOLS } from "./tools/index.js";

const PROMPT = "\u001b[36ms01 >> \u001b[0m";

export async function runCli(): Promise<void> {
  const rl = createInterface({ input, output });
  const history: ChatCompletionMessageParam[] = [];
  setCompactRuntimeContext({ messages: history });
  const client = createClient();
  const runtimeState: AgentRuntimeState = {
    roundsWithoutTodo: 0,
    activeTaskId: null,
    lastMemoryInput: null,
    roundCounter: 0,
  };

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

      history.push({ role: "user", content: query });
      await agentLoop({
        client,
        model: MODEL,
        system: SYSTEM,
        tools: TOOLS,
        messages: history,
        runtimeState,
      });

      const lastMessage = history[history.length - 1];
      if (lastMessage?.role === "assistant" && typeof lastMessage.content === "string") {
        console.log(lastMessage.content);
      }
      console.log();
    }
  } finally {
    rl.close();
  }
}
