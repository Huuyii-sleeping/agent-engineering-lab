import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WORKFLOW_SCHEMA_VERSION, builtinNodeRegistry, type WorkflowDraft } from "@orbit/workflow-core";
import { handleWorkflowHttpRequest } from "../../../src/workflows/http-handler.js";
import { WorkflowRuntimeService } from "../../../src/workflows/service.js";

const servers: ReturnType<typeof createServer>[] = [];

function draft(): WorkflowDraft {
  const startDefinition = builtinNodeRegistry.get("start")!;
  const templateDefinition = builtinNodeRegistry.get("template")!;
  const endDefinition = builtinNodeRegistry.get("end")!;
  const startConfig = startDefinition.createDefaultConfig();
  const templateConfig = templateDefinition.createDefaultConfig();
  templateConfig.template = "完成";
  const endConfig = endDefinition.createDefaultConfig();
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: "workflow-http",
    name: "Workflow HTTP",
    summary: "",
    revision: 0,
    createdAt: 1,
    updatedAt: 1,
    nodes: [
      { kind: "builtin", id: "start", type: "start", version: 1, label: "start", position: { x: 0, y: 0 }, config: startConfig, ports: startDefinition.createPorts(startConfig) },
      { kind: "builtin", id: "template", type: "template", version: 1, label: "template", position: { x: 0, y: 1 }, config: templateConfig, ports: templateDefinition.createPorts(templateConfig) },
      { kind: "builtin", id: "end", type: "end", version: 1, label: "end", position: { x: 0, y: 2 }, config: endConfig, ports: endDefinition.createPorts(endConfig) },
    ],
    edges: [
      { id: "e1", source: { nodeId: "start", portId: "out" }, target: { nodeId: "template", portId: "in" } },
      { id: "e2", source: { nodeId: "template", portId: "text" }, target: { nodeId: "end", portId: "in" } },
    ],
  };
}

async function listen() {
  const service = new WorkflowRuntimeService({ client: {} as never, modelPolicyService: {} as never, toolService: {} as never });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (!await handleWorkflowHttpRequest(service, req, res, url)) {
      res.statusCode = 404;
      res.end();
    }
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("workflow HTTP handler", () => {
  it("启动、查询并通过 SSE 回放至终态", async () => {
    const baseUrl = await listen();
    const started = await fetch(`${baseUrl}/workflow-runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow: draft(), mode: "draft" }),
    });
    expect(started.status).toBe(201);
    const startedBody = await started.json() as { run: { id: string } };
    const events = await fetch(`${baseUrl}/workflow-runs/${startedBody.run.id}/events?since_id=0`);
    const body = await events.text();
    const ids = [...body.matchAll(/^id: (\d+)$/gm)].map((match) => Number(match[1]));

    expect(events.headers.get("content-type")).toContain("text/event-stream");
    expect(ids).toEqual([...ids].sort((left, right) => left - right));
    expect(new Set(ids).size).toBe(ids.length);
    expect(body).toContain('"status":"succeeded"');

    const replay = await fetch(`${baseUrl}/workflow-runs/${startedBody.run.id}/events`, { headers: { "Last-Event-ID": String(ids.at(-2) ?? 0) } });
    const replayBody = await replay.text();
    expect(replayBody).toContain(`id: ${ids.at(-1)}`);
    expect(replayBody).not.toContain(`id: ${ids[0]}\n`);
  });

  it("返回可读的运行参数错误", async () => {
    const baseUrl = await listen();
    const response = await fetch(`${baseUrl}/workflow-runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow: draft(), mode: "production" }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "WORKFLOW_RUN_INVALID" } });
  });
});
