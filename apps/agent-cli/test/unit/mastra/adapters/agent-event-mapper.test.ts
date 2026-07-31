import { describe, expect, it } from "vitest";
import { MastraAgentEventMapper } from "../../../../src/mastra/adapters/agent-event-mapper.js";

describe("mastra/adapters/agent-event-mapper", () => {
  it("通过唯一映射器按顺序归一化 Agent chunk，并维护 Tool 摘要", () => {
    const mapper = new MastraAgentEventMapper({ secrets: ["request-secret"] });

    expect(mapper.map({ type: "text-delta", payload: { text: "hello request-secret" } })).toEqual([
      { type: "text.delta", delta: "hello [REDACTED]" },
    ]);
    expect(mapper.map({
      type: "tool-call-delta",
      payload: { toolCallId: "call-1", toolName: "read_file", argsTextDelta: "{\"path\":" },
    })).toEqual([{
      type: "tool.input.delta",
      callId: "call-1",
      toolId: "read_file",
      delta: "{\"path\":" ,
    }]);
    expect(mapper.map({
      type: "tool-call",
      payload: { toolCallId: "call-1", toolName: "read_file", args: { token: "request-secret" } },
    })).toEqual([{
      type: "tool.call",
      callId: "call-1",
      toolId: "read_file",
      input: { token: "[REDACTED]" },
    }]);
    expect(mapper.map({
      type: "tool-result",
      payload: { toolCallId: "call-1", toolName: "read_file", result: { ok: true } },
    })).toEqual([{
      type: "tool.result",
      result: {
        callId: "call-1",
        toolId: "read_file",
        status: "succeeded",
        output: { ok: true },
      },
    }]);
    expect(mapper.toolExecutions()).toEqual([{
      callId: "call-1",
      toolId: "read_file",
      status: "succeeded",
      output: { ok: true },
    }]);
  });

  it("忽略不属于产品协议的 Mastra chunk", () => {
    const mapper = new MastraAgentEventMapper();

    expect(mapper.map({ type: "finish", payload: {} })).toEqual([]);
  });
});
