import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as process from "node:process";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const fixtureServerPath = path.resolve(process.cwd(), "test/fixtures/mcp-demo-server.mjs");

async function withWorkspace<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), `${name}-`));
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function writeMcpConfig(): Promise<void> {
  await mkdir(path.join(process.cwd(), ".codex"), { recursive: true });
  await writeFile(
    path.join(process.cwd(), ".codex", "mcp.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        servers: [
          {
            name: "demo",
            command: process.execPath,
            args: [fixtureServerPath],
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function main(): Promise<void> {
  await withWorkspace("prd19-mcp-smoke", async () => {
    await writeMcpConfig();

    const [{ agentLoop }, { withCompactRuntimeContext }, toolsModule, securityModule, mcpModule] = await Promise.all([
      import("../../src/agent-loop.js"),
      import("../../src/tools/base.js"),
      import("../../src/tools/index.js"),
      import("../../src/tools/security.js"),
      import("../../src/tools/mcp.js"),
    ]);

    const tools = await toolsModule.listTools();
    const externalTool = tools.find(
      (tool) => tool.type === "function" && tool.function.name === "mcp__demo__echo_upper",
    );
    assert(externalTool, "expected mcp tool to be listed");

    const approval = JSON.parse(
      await securityModule.runSecurityRequestApproval("mcp__demo__echo_upper", '{"text":"mixed round"}'),
    ) as { request?: { request_id?: string } };
    await securityModule.runSecurityApprove(approval.request?.request_id);

    let callIndex = 0;
    const client = {
      chat: {
        completions: {
          create: async () => {
            if (callIndex === 0) {
              callIndex += 1;
              return {
                choices: [
                  {
                    finish_reason: "tool_calls",
                    message: {
                      role: "assistant",
                      content: "",
                      tool_calls: [
                        {
                          id: "call_native",
                          type: "function",
                          function: {
                            name: "task_create",
                            arguments: JSON.stringify({
                              subject: "prd19 mixed round",
                              description: "native plus mcp",
                            }),
                          },
                        },
                        {
                          id: "call_mcp",
                          type: "function",
                          function: {
                            name: "mcp__demo__echo_upper",
                            arguments: JSON.stringify({ text: "mixed round" }),
                          },
                        },
                      ],
                    },
                  },
                ],
                usage: { completion_tokens: 0 },
              };
            }
            callIndex += 1;
            return {
              choices: [
                {
                  finish_reason: "stop",
                  message: {
                    role: "assistant",
                    content: "mixed round complete",
                  },
                },
              ],
              usage: { completion_tokens: 4 },
            };
          },
        },
      },
    } as unknown as OpenAI;

    const messages: ChatCompletionMessageParam[] = [{ role: "user", content: "run native and mcp in one round" }];
    await withCompactRuntimeContext({ messages }, async () =>
      agentLoop({
        client,
        model: "fake-model",
        promptSource: {
          core: "test",
          tools: [],
          skills: [],
          rules: [],
        },
        tools,
        messages,
        runtimeState: {
          sessionId: "prd19-smoke",
          roundsWithoutTodo: 0,
          activeTaskId: null,
          lastMemoryInput: null,
          roundCounter: 0,
          touchedPaths: new Set<string>(),
          wroteWorkspaceFiles: false,
        },
      }),
    );

    const toolMessages = messages.filter((message) => message.role === "tool");
    assert(toolMessages.length === 2, "expected native and mcp tool messages");
    const nativeOutput = JSON.parse(String(toolMessages[0]?.content ?? "{}")) as { id?: number };
    const mcpOutput = JSON.parse(String(toolMessages[1]?.content ?? "{}")) as { echoed?: string };
    assert(typeof nativeOutput.id === "number", "task_create should produce a task id");
    assert(mcpOutput.echoed === "MIXED ROUND", "mcp tool should uppercase the payload");
    assert(messages[messages.length - 1]?.role === "assistant", "assistant reply should be appended");
    assert(
      typeof messages[messages.length - 1]?.content === "string" &&
        messages[messages.length - 1]?.content.includes("mixed round complete"),
      "assistant should finish the mixed tool round",
    );

    await mcpModule.resetMcpRegistryForTest();
    console.log("PRD19_MCP_SMOKE_OK");
  });
}

main().catch((error) => {
  console.error("PRD19_MCP_SMOKE_FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
