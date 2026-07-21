import { describe, expect, it } from "vitest";
import { HttpWorkflowExecutor, assertSafeWorkflowHttpUrl } from "../../../../src/workflows/executors/http.js";
import { WorkflowVariableContext } from "../../../../src/workflows/context.js";

describe("HttpWorkflowExecutor", () => {
  it("在发出请求前拒绝本地和 metadata 地址", async () => {
    await expect(assertSafeWorkflowHttpUrl("http://127.0.0.1/private")).rejects.toThrow(/禁止|本地/);
    await expect(assertSafeWorkflowHttpUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow(/禁止|本地/);
  });

  it("限制响应体并返回结构化状态", async () => {
    let requestHeaders: Record<string, string> = {};
    const executor = new HttpWorkflowExecutor({ request: async (input) => { requestHeaders = input.headers; return { status: 200, headers: { "content-type": "application/json" }, body: "{\"ok\":true}" }; } });
    const node = { id: "http", type: "http", nodeVersion: 1, label: "HTTP", disabled: false, config: { method: "GET", url: { kind: "literal", value: "https://93.184.216.34" }, headers: {}, credential: { credentialId: "api", capability: "http:request", key: "token" }, timeoutMs: 1_000 }, ports: { inputs: [], outputs: [] }, executor: executor.identity, execution: { timeoutMs: 1_000, maxAttempts: 1, retryBackoffMs: 0, idempotent: true, onError: "fail" } } as const;
    const result = await executor.execute({ runId: "run", node, inputs: {}, variables: new WorkflowVariableContext({ inputs: {}, secretProvider: { read: async () => "secret" } }), signal: new AbortController().signal, emitLog: () => {}, emitDelta: () => {} });
    expect(result.outputs).toEqual({ body: { ok: true }, status: 200, headers: { "content-type": "application/json" } });
    expect(requestHeaders.authorization).toBe("Bearer secret");
  });
});
