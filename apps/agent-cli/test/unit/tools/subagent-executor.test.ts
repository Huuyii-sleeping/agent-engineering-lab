import { afterEach, describe, expect, it, vi } from "vitest";

const {
  createCompletion,
  createClient,
  selectModel,
  finalizeUsage,
  runBaseToolByName,
} = vi.hoisted(() => {
  const createCompletion = vi.fn();
  return {
    createCompletion,
    createClient: vi.fn(() => ({
      chat: {
        completions: {
          create: createCompletion,
        },
      },
    })),
    selectModel: vi.fn(),
    finalizeUsage: vi.fn(async () => {}),
    runBaseToolByName: vi.fn(),
  };
});

vi.mock("../../../src/config.js", () => ({
  MODEL: "gpt-5",
  createClient,
}));

vi.mock("../../../src/services/model-policy-service.js", () => ({
  DEFAULT_MODEL_POLICY_SERVICE: {
    selectModel,
    finalizeUsage,
  },
}));

vi.mock("../../../src/tools/base.js", () => ({
  BASE_TOOLS: [
    {
      type: "function",
      function: {
        name: "read_file",
        description: "read",
        parameters: { type: "object", properties: {} },
      },
    },
  ],
  runBaseToolByName,
}));

import { RUNTIME_CONFIG } from "../../../src/runtime-config.js";
import { SubagentExecutor } from "../../../src/tools/subagent-executor.js";

afterEach(() => {
  createCompletion.mockReset();
  createClient.mockClear();
  selectModel.mockReset();
  finalizeUsage.mockClear();
  runBaseToolByName.mockReset();
});

describe("tools/subagent-executor", () => {
  it("completes a run without tool calls and finalizes usage", async () => {
    selectModel.mockResolvedValueOnce({
      model: "gpt-5",
      fallbackModel: "gpt-5-mini",
      budgetAction: "allow",
      budgetReason: null,
    });
    createCompletion.mockResolvedValueOnce({
      choices: [{ message: { content: "done" } }],
      usage: { completion_tokens: 4 },
    });

    const result = await new SubagentExecutor().execute("finish this", "trace-1");

    expect(result).toEqual({ status: "completed", output: "done" });
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5",
        tools: expect.any(Array),
        max_tokens: RUNTIME_CONFIG.subagentMaxTokens,
      }),
    );
    expect(finalizeUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "ops",
        model: "gpt-5",
        completionTokens: 4,
        fallbackUsed: false,
      }),
      "trace-1",
    );
  });

  it("runs tool-calling rounds with base tools before completing", async () => {
    selectModel.mockResolvedValue({
      model: "gpt-5",
      fallbackModel: null,
      budgetAction: "allow",
      budgetReason: null,
    });
    createCompletion
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "",
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "read_file",
                    arguments: "{\"path\":\"README.md\"}",
                  },
                },
              ],
            },
          },
        ],
        usage: { completion_tokens: 2 },
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "final answer" } }],
        usage: { completion_tokens: 3 },
      });
    runBaseToolByName.mockResolvedValueOnce("tool output");

    const result = await new SubagentExecutor().execute("use a tool");

    expect(result).toEqual({ status: "completed", output: "final answer" });
    expect(runBaseToolByName).toHaveBeenCalledWith("read_file", "{\"path\":\"README.md\"}");
    expect(createCompletion).toHaveBeenCalledTimes(2);
    expect(createCompletion.mock.calls[1]?.[0]?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "tool", tool_call_id: "call_1", content: "tool output" }),
      ]),
    );
    expect(finalizeUsage).toHaveBeenCalledTimes(2);
  });

  it("returns budget denial without calling the model", async () => {
    selectModel.mockResolvedValueOnce({
      model: "gpt-5",
      fallbackModel: "gpt-5-mini",
      budgetAction: "deny",
      budgetReason: "daily_budget_exceeded",
    });

    const result = await new SubagentExecutor().execute("blocked");

    expect(result).toEqual({
      status: "failed",
      error: "MODEL_BUDGET_DENIED:daily_budget_exceeded",
    });
    expect(createCompletion).not.toHaveBeenCalled();
    expect(finalizeUsage).not.toHaveBeenCalled();
  });

  it("retries with fallback model on fallbackable errors", async () => {
    selectModel.mockResolvedValueOnce({
      model: "gpt-5",
      fallbackModel: "gpt-5-mini",
      budgetAction: "allow",
      budgetReason: null,
    });
    createCompletion
      .mockRejectedValueOnce(Object.assign(new Error("rate limit"), { status: 429 }))
      .mockResolvedValueOnce({
        choices: [{ message: { content: "fallback ok" } }],
        usage: { completion_tokens: 1 },
      });

    const result = await new SubagentExecutor().execute("retry me");

    expect(result).toEqual({ status: "completed", output: "fallback ok" });
    expect(createCompletion.mock.calls[0]?.[0]?.model).toBe("gpt-5");
    expect(createCompletion.mock.calls[1]?.[0]?.model).toBe("gpt-5-mini");
    expect(finalizeUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5-mini",
        fallbackUsed: true,
      }),
      undefined,
    );
  });
});
