import type {
  HarnessAgentScenario,
  HarnessAgentScenarioResult,
} from "./agent.js";
import { runHarnessAgentScenario } from "./agent.js";
import { runHarnessServiceSessionResumeScenario } from "./service-session.js";

/** A stable production harness scenario registered in the local matrix. */
export type HarnessMatrixScenario = {
  name: string;
  description: string;
} & (
  | {
      scenario: HarnessAgentScenario;
    }
  | {
      run: () => Promise<HarnessMatrixResultItem>;
    }
);

/** Options for running the local harness scenario matrix. */
export type HarnessMatrixRunOptions = {
  names?: string[];
};

/** A single matrix result, including synthetic failures such as unknown scenario names. */
export type HarnessMatrixResultItem = Pick<
  HarnessAgentScenarioResult,
  "name" | "status" | "failedStep" | "steps"
>;

/** Structured result for a harness matrix run. */
export type HarnessMatrixResult = {
  total: number;
  passed: number;
  failed: number;
  results: HarnessMatrixResultItem[];
};

const PRODUCTION_HARNESS_SCENARIOS: HarnessMatrixScenario[] = [
  {
    name: "assistant-only",
    description: "assistant-only QueryEngine round",
    scenario: {
      name: "assistant-only",
      model: [{ type: "message", content: "done from real engine" }],
      messages: [{ role: "user", content: "finish it" }],
      assertions: [
        { name: "model request metric", expectMetric: { name: "modelRequests", equals: 1 } },
      ],
    },
  },
  {
    name: "tool-driven-readonly-order",
    description: "readonly parallel tool calls preserve tool result order",
    scenario: {
      name: "tool-driven-readonly-order",
      model: [
        {
          type: "tool_calls",
          toolCalls: [
            { id: "call_read_a", name: "read_file", argumentsJson: '{"path":"a.txt"}' },
            { id: "call_read_b", name: "read_file", argumentsJson: '{"path":"b.txt"}' },
          ],
        },
        { type: "message", content: "read both files" },
      ],
      workspace: {
        files: {
          "a.txt": "alpha",
          "b.txt": "beta",
        },
      },
      messages: [{ role: "user", content: "read files" }],
      toolFixtures: [
        {
          name: "read_file",
          readOnly: true,
          parallelSafe: true,
          handler: async ({ args, workspace }) => workspace.readText(String(args.path)),
        },
      ],
      assertions: [
        { name: "tool result order", expectToolResultOrder: ["call_read_a", "call_read_b"] },
        { name: "assistant final", expectAssistantContains: "read both files" },
      ],
    },
  },
  {
    name: "hook-blocked",
    description: "SessionStart hook block produces blocked assistant response",
    scenario: {
      name: "hook-blocked",
      model: [{ type: "message", content: "unreached" }],
      messages: [{ role: "user", content: "hello" }],
      hookBlocks: { SessionStart: "policy says no" },
      assertions: [{ name: "blocked message", expectAssistantContains: "policy says no" }],
    },
  },
  {
    name: "model-failed",
    description: "model error is surfaced through recovery failure state",
    scenario: {
      name: "model-failed",
      model: [{ type: "error", message: "model boom" }],
      messages: [{ role: "user", content: "hello" }],
      assertions: [{ name: "recovery failed", expectBlockedStatus: "recovery_failed" }],
    },
  },
  {
    name: "scheduled-notification",
    description: "scheduled prompt notification is injected into query preparation",
    scenario: {
      name: "scheduled-notification",
      model: [{ type: "message", content: "handled scheduled prompt" }],
      messages: [{ role: "user", content: "continue" }],
      includeScheduledNotifications: true,
      scheduledNotifications: [
        {
          id: "run_1",
          scheduleId: "schedule_1",
          prompt: "scheduled follow-up",
          recurring: false,
          firedAt: 1,
        },
      ],
      assertions: [{ name: "notification event", expectTraceEvent: "notification" }],
    },
  },
  {
    name: "read-write-side-effects",
    description: "read/write file flow records side effects through production tool stage",
    scenario: {
      name: "read-write-side-effects",
      model: [
        {
          type: "tool_calls",
          toolCalls: [
            { id: "call_read_source", name: "read_file", argumentsJson: '{"path":"source.txt"}' },
            {
              id: "call_write_copy",
              name: "write_file",
              argumentsJson: '{"path":"out/copy.txt","content":"copied"}',
            },
          ],
        },
        { type: "message", content: "copied file" },
      ],
      workspace: {
        files: {
          "source.txt": "source content",
        },
      },
      messages: [{ role: "user", content: "copy source" }],
      toolFixtures: [
        {
          name: "read_file",
          readOnly: true,
          parallelSafe: true,
          handler: async ({ args, workspace }) => workspace.readText(String(args.path)),
        },
        {
          name: "write_file",
          readOnly: false,
          parallelSafe: false,
          mutatesWorkspace: true,
          handler: async ({ args, workspace }) => {
            await workspace.writeText(String(args.path), String(args.content));
            return JSON.stringify({ ok: true, path: args.path });
          },
        },
      ],
      assertions: [
        {
          name: "read write order",
          expectToolResultOrder: ["call_read_source", "call_write_copy"],
        },
        { name: "copied file", expectFile: { path: "out/copy.txt", equals: "copied" } },
      ],
    },
  },
  {
    name: "serial-write-side-effects",
    description: "serial write tool calls remain ordered and non-concurrent",
    scenario: {
      name: "serial-write-side-effects",
      model: [
        {
          type: "tool_calls",
          toolCalls: [
            {
              id: "call_write_a",
              name: "write_file",
              argumentsJson: '{"path":"out/a.txt","content":"alpha"}',
            },
            {
              id: "call_write_b",
              name: "write_file",
              argumentsJson: '{"path":"out/b.txt","content":"beta"}',
            },
          ],
        },
        { type: "message", content: "wrote files" },
      ],
      messages: [{ role: "user", content: "write files" }],
      toolFixtures: [
        {
          name: "write_file",
          readOnly: false,
          parallelSafe: false,
          mutatesWorkspace: true,
          handler: async ({ args, workspace }) => {
            await workspace.writeText(String(args.path), String(args.content));
            return JSON.stringify({ ok: true, path: args.path });
          },
        },
      ],
      assertions: [
        { name: "write order", expectToolResultOrder: ["call_write_a", "call_write_b"] },
        { name: "file a", expectFile: { path: "out/a.txt", equals: "alpha" } },
        { name: "file b", expectFile: { path: "out/b.txt", equals: "beta" } },
      ],
    },
  },
  {
    name: "service-session-resume",
    description: "service-level session resume continues chat through AgentService and QueryEngine",
    run: runHarnessServiceSessionResumeScenario,
  },
];

/** Lists stable harness matrix scenarios without exposing mutable scenario definitions. */
export function listHarnessMatrixScenarios(): Array<Pick<HarnessMatrixScenario, "name" | "description">> {
  return PRODUCTION_HARNESS_SCENARIOS.map(({ name, description }) => ({ name, description }));
}

function unknownScenarioResult(name: string): HarnessMatrixResultItem {
  return {
    name,
    status: "failed",
    failedStep: "matrix selection",
    steps: [
      {
        name: "matrix selection",
        status: "failed",
        message: `unknown harness matrix scenario: ${name}`,
      },
    ],
  };
}

/** Runs all registered harness scenarios, or only the requested stable names. */
export async function runHarnessScenarioMatrix(
  options: HarnessMatrixRunOptions = {},
): Promise<HarnessMatrixResult> {
  const byName = new Map(PRODUCTION_HARNESS_SCENARIOS.map((item) => [item.name, item]));
  const selected =
    options.names === undefined
      ? PRODUCTION_HARNESS_SCENARIOS
      : options.names.map((name) => byName.get(name) ?? unknownScenarioResult(name));
  const results: HarnessMatrixResultItem[] = [];
  for (const item of selected) {
    if ("scenario" in item) {
      const result = await runHarnessAgentScenario(item.scenario);
      results.push({
        name: result.name,
        status: result.status,
        failedStep: result.failedStep,
        steps: result.steps,
      });
    } else if ("run" in item) {
      results.push(await item.run());
    } else {
      results.push(item);
    }
  }
  const passed = results.filter((result) => result.status === "passed").length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}

/** Formats a human-readable summary for local harness matrix runs. */
export function formatHarnessMatrixSummary(matrix: HarnessMatrixResult): string {
  const lines = [
    `Harness matrix: total=${matrix.total} passed=${matrix.passed} failed=${matrix.failed}`,
  ];
  for (const result of matrix.results) {
    if (result.status === "passed") {
      lines.push(`- ${result.name} passed`);
      continue;
    }
    const failedStep = result.failedStep ?? "unknown";
    const failedMessage = result.steps.find((step) => step.status === "failed")?.message;
    lines.push(
      `- ${result.name} failed at ${failedStep}${failedMessage ? `: ${failedMessage}` : ""}`,
    );
  }
  return lines.join("\n");
}
