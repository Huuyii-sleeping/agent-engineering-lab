import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { StaticPromptSource } from "../../src/prompt/types.js";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createRuntimeState() {
  return {
    sessionId: "session_prd17_smoke",
    roundsWithoutTodo: 0,
    activeTaskId: null,
    lastMemoryInput: null,
    roundCounter: 0,
    touchedPaths: new Set<string>(),
    wroteWorkspaceFiles: false,
  };
}

const PROMPT_SOURCE: StaticPromptSource = {
  core: "smoke-system",
  tools: [],
  skills: [],
  rules: [],
};

async function withWorkspace<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const workspace = await mkdtemp(path.join(tmpdir(), `${name}-`));
  const previousCwd = process.cwd();
  try {
    process.chdir(workspace);
    return await fn();
  } finally {
    process.chdir(previousCwd);
    await rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
}

function buildClient(
  handler: (request: { messages: ChatCompletionMessageParam[] }, callCount: number) => Promise<unknown>,
): OpenAI {
  let callCount = 0;
  return {
    chat: {
      completions: {
        create: async (request: { messages: ChatCompletionMessageParam[] }) => {
          callCount += 1;
          return handler(request, callCount);
        },
      },
    },
  } as unknown as OpenAI;
}

async function main(): Promise<void> {
  await withWorkspace("prd17-scheduler", async () => {
    const { agentLoop } = await import("../../src/agent-loop.js");
    const { SchedulerManager, setSchedulerNowProvider } = await import("../../src/tools/scheduler.js");
    const scheduler = new SchedulerManager(() => path.join(process.cwd(), ".schedule"));

    const created = await scheduler.createSchedule("5 1 10 * * *", "Follow up on the durable scheduled task.", true, true);
    assert(created.ok, "schedule should be created");
    if (!created.ok) {
      throw new Error("schedule should be created");
    }
    assert(typeof created.schedule.created_at === "number", "schedule timestamps should use epoch milliseconds");

    const recordsPath = path.join(process.cwd(), ".schedule", "records.json");
    const recordsRaw = await readFile(recordsPath, "utf8");
    assert(recordsRaw.includes("Follow up on the durable scheduled task."), "schedule should be persisted to disk");
    assert(recordsRaw.includes('"created_at": '), "persisted schedule should store numeric created_at");

    const firstTick = await scheduler.tick(new Date("2026-05-11T10:01:05+08:00"));
    assert(firstTick.fired.length === 1, "matching schedule should enqueue a scheduled prompt");
    assert(firstTick.fired[0] && typeof firstTick.fired[0].firedAt === "number", "fired notification should use epoch milliseconds");

    const secondTick = await scheduler.tick(new Date("2026-05-11T10:01:05.600+08:00"));
    assert(secondTick.fired.length === 0, "same schedule should not fire twice in the same second");

    const restartedScheduler = new SchedulerManager(() => path.join(process.cwd(), ".schedule"));
    const listed = await restartedScheduler.listSchedules();
    assert(listed.length === 1 && listed[0]?.durable === true, "durable schedule should survive restart");

    const seenRequests: ChatCompletionMessageParam[][] = [];
    const client = buildClient(async (request) => {
      seenRequests.push(request.messages);
      return {
        choices: [
          {
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: "scheduled prompt handled",
            },
          },
        ],
        usage: { completion_tokens: 1 },
      };
    });

    const messages: ChatCompletionMessageParam[] = [{ role: "user", content: "run scheduled smoke" }];
    setSchedulerNowProvider(() => new Date("2026-05-11T10:01:05.600+08:00"));
    try {
      await agentLoop({
        client,
        model: "smoke-model",
        promptSource: PROMPT_SOURCE,
        tools: [] as ChatCompletionTool[],
        messages,
        runtimeState: createRuntimeState(),
        includeScheduledNotifications: true,
      });
    } finally {
      setSchedulerNowProvider(null);
    }

    assert(seenRequests.length === 1, "agent loop should make one request");
    const firstRequest = seenRequests[0] ?? [];
    assert(
      firstRequest.some(
        (item) =>
          item.role === "system" &&
          typeof item.content === "string" &&
          item.content.includes("<scheduled_prompt") &&
          item.content.includes("Follow up on the durable scheduled task."),
      ),
      "scheduled prompt should be injected into the next model request",
    );

    console.log("PRD17_SCHEDULER_SMOKE_OK");
  });
}

main().catch((error) => {
  console.error("PRD17_SCHEDULER_SMOKE_FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
