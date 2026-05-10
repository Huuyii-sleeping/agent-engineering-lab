import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { agentLoop, type AgentRuntimeState } from "../../src/agent-loop.js";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function isSystemMessage(message: ChatCompletionMessageParam): message is { role: "system"; content: string } {
  return message.role === "system" && typeof message.content === "string";
}

async function createSmokeWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "prd14-hooks-"));
  await mkdir(path.join(root, ".codex"), { recursive: true });
  await writeFile(path.join(root, "allowed.txt"), "allowed hook content\n", "utf8");
  await writeFile(
    path.join(root, "hook.mjs"),
    `
import process from "node:process";

let raw = "";
for await (const chunk of process.stdin) {
  raw += chunk.toString();
}

const input = JSON.parse(raw || "{}");
if (input.event === "PreToolUse" && input.payload?.tool_name === "write_file") {
  process.stdout.write(JSON.stringify({ action: "block", reason: "write_file blocked by smoke hook" }));
  process.exit(0);
}

if (input.event === "PostToolUse" && input.payload?.tool_name === "read_file") {
  process.stdout.write(JSON.stringify({ action: "append_message", message: "read_file reviewed by hook" }));
  process.exit(0);
}

process.stdout.write(JSON.stringify({ action: "continue" }));
`,
    "utf8",
  );
  await writeFile(
    path.join(root, ".codex", "hooks.json"),
    `${JSON.stringify(
      {
        hooks: {
          PreToolUse: [
            {
              type: "command",
              command: "node",
              args: ["./hook.mjs"],
              matcher: { tools: ["write_file"] },
            },
          ],
          PostToolUse: [
            {
              type: "command",
              command: "node",
              args: ["./hook.mjs"],
              matcher: { tools: ["read_file"] },
            },
          ],
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return root;
}

function createMockClient(seenRequests: ChatCompletionMessageParam[][]): OpenAI {
  let callCount = 0;
  return {
    chat: {
      completions: {
        create: async (request: { messages: ChatCompletionMessageParam[] }) => {
          seenRequests.push(request.messages);
          callCount += 1;
          if (callCount === 1) {
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: "",
                    tool_calls: [
                      {
                        id: "call_write",
                        type: "function",
                        function: {
                          name: "write_file",
                          arguments: JSON.stringify({ path: "blocked.txt", content: "should not exist" }),
                        },
                      },
                      {
                        id: "call_read",
                        type: "function",
                        function: {
                          name: "read_file",
                          arguments: JSON.stringify({ path: "allowed.txt" }),
                        },
                      },
                    ],
                  },
                },
              ],
              usage: { completion_tokens: 1 },
            };
          }
          return {
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "hooks smoke complete",
                },
              },
            ],
            usage: { completion_tokens: 1 },
          };
        },
      },
    },
  } as unknown as OpenAI;
}

async function main(): Promise<void> {
  const workspace = await createSmokeWorkspace();
  const previousCwd = process.cwd();
  const seenRequests: ChatCompletionMessageParam[][] = [];

  try {
    process.chdir(workspace);
    const client = createMockClient(seenRequests);
    const messages: ChatCompletionMessageParam[] = [{ role: "user", content: "run prd14 hooks smoke" }];
    const runtimeState: AgentRuntimeState = {
      sessionId: "session_prd14_smoke",
      roundsWithoutTodo: 0,
      activeTaskId: null,
      lastMemoryInput: null,
      roundCounter: 0,
    };

    await agentLoop({
      client,
      model: "smoke-model",
      promptSource: {
        core: "smoke-system",
        tools: [],
        skills: [],
        rules: [],
      },
      tools: [] as ChatCompletionTool[],
      messages,
      runtimeState,
    });

    assert(seenRequests.length === 2, "agent loop should make two model requests");
    assert(runtimeState.roundCounter === 2, "agent loop should advance two rounds");

    const blockedToolMessage = messages.find(
      (item) => item.role === "tool" && item.tool_call_id === "call_write" && String(item.content).includes("HOOK_BLOCKED"),
    );
    assert(blockedToolMessage, "write_file should be blocked by PreToolUse hook");

    const blockedPath = path.join(workspace, "blocked.txt");
    const blockedExists = await readFile(blockedPath, "utf8").then(
      () => true,
      () => false,
    );
    assert(blockedExists === false, "blocked write_file should not create the target file");

    const secondRequest = seenRequests[1] ?? [];
    assert(
      secondRequest.some((item) => isSystemMessage(item) && item.content.includes("read_file reviewed by hook")),
      "PostToolUse hook message should be injected into the next model request",
    );

    console.log("PRD14_HOOKS_SMOKE_OK");
  } finally {
    process.chdir(previousCwd);
    await rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error("PRD14_HOOKS_SMOKE_FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
