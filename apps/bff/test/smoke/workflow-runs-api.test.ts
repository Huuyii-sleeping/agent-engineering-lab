import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { builtinNodeRegistry, type WorkflowStageECapabilityRegistry } from "@orbit/workflow-core";
import { createBffHttpServer } from "../../src/server.js";
import { createTestDraft } from "../unit/sops/test-fixtures.js";

const servers: Server[] = [];
const roots: string[] = [];
const seen: Array<{ method: string; path: string; body: Record<string, unknown>; lastEventId?: string }> = [];
const ENABLED_STAGE_E_CAPABILITIES = {
  parallelMerge: true,
  iteration: true,
  boundedLoop: true,
  nestedWorkflow: true,
  agentNode: true,
  humanApproval: true,
  restartResume: true,
} satisfies WorkflowStageECapabilityRegistry;

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not bind");
  return `http://127.0.0.1:${address.port}`;
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) as Record<string, unknown> : {};
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(value));
}

function runFrom(body: Record<string, unknown>, id: string) {
  const workflow = body.workflow as { id?: string; workflowId?: string; contentHash?: string; nodes?: Array<{ id: string }> };
  return {
    id,
    workflowId: String(workflow.workflowId ?? workflow.id),
    versionId: workflow.workflowId ? String((workflow as { id: string }).id) : undefined,
    contentHash: workflow.contentHash,
    mode: body.mode,
    status: "queued" as string,
    createdAt: 10,
    inputs: body.inputs ?? {},
    nodeRuns: Object.fromEntries((workflow.nodes ?? []).map((node) => [node.id, { nodeId: node.id, status: "pending", attempt: 0 }])),
  };
}

async function startMockAgent(): Promise<string> {
  let sequence = 0;
  const runs = new Map<string, ReturnType<typeof runFrom>>();
  return listen(createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const body = req.method === "GET" ? {} : await readBody(req);
    seen.push({ method: req.method ?? "GET", path: `${url.pathname}${url.search}`, body, lastEventId: typeof req.headers["last-event-id"] === "string" ? req.headers["last-event-id"] : undefined });
    if (req.method === "POST" && url.pathname === "/workflow-runs") {
      const run = runFrom(body, `run-${++sequence}`);
      const hasApproval = ((body.workflow as { nodes?: Array<{ type?: string }> }).nodes ?? [])
        .some((node) => node.type === "human-approval");
      if (hasApproval) {
        run.status = "waiting";
        Object.assign(run, {
          waiting: {
            nodeId: "approval",
            reason: "Human approval pending",
            waiting: {
              kind: "approval",
              interruptId: `interrupt-${run.id}`,
              approvalRequestId: `interrupt-${run.id}`,
              deadline: Date.now() + 10_000,
              displayFields: [{ id: "summary", label: "摘要", value: "已脱敏" }],
              decisionSchema: { type: "object" },
            },
          },
        });
      }
      runs.set(run.id, run);
      json(res, 201, { ok: true, run });
      return;
    }
    const cancel = url.pathname.match(/^\/workflow-runs\/([^/]+)\/cancel$/);
    if (req.method === "POST" && cancel) {
      json(res, 202, { ok: true, run: runs.get(cancel[1]) });
      return;
    }
    const resume = url.pathname.match(/^\/workflow-runs\/([^/]+)\/resume$/);
    if (req.method === "POST" && resume) {
      const run = runs.get(resume[1])!;
      run.status = "succeeded";
      Object.assign(run, { waiting: undefined, output: { decision: body.resume_data } });
      json(res, 200, { ok: true, run });
      return;
    }
    const events = url.pathname.match(/^\/workflow-runs\/([^/]+)\/events$/);
    if (req.method === "GET" && events) {
      const run = runs.get(events[1])!;
      const cursor = Number(req.headers["last-event-id"] ?? url.searchParams.get("since_id") ?? 0);
      const stream = [
        { id: 1, runId: run.id, at: 20, type: "run.status", status: "running" },
        { id: 2, runId: run.id, at: 30, type: "node.status", nodeId: "start", status: "succeeded", attempt: 1 },
        { id: 3, runId: run.id, at: 35, type: "future.node.metric", metric: "latency" },
        { id: 4, runId: run.id, at: 40, type: "run.output", output: { result: "ok" } },
        { id: 5, runId: run.id, at: 50, type: "run.status", status: "succeeded" },
      ];
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/event-stream");
      for (const event of stream.filter((item) => item.id > cursor)) {
        res.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      }
      res.end();
      return;
    }
    const detail = url.pathname.match(/^\/workflow-runs\/([^/]+)$/);
    if (req.method === "GET" && detail) {
      json(res, 200, { ok: true, run: runs.get(detail[1]) });
      return;
    }
    if (url.pathname === "/health") {
      json(res, 200, { ok: true });
      return;
    }
    json(res, 404, { ok: false });
  }));
}

async function startBff(agentBaseUrl: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "orbit-workflow-api-"));
  roots.push(root);
  const registryPath = join(root, "registry.json");
  await writeFile(registryPath, JSON.stringify({ skills: [] }), "utf8");
  await mkdir(join(root, "skills"), { recursive: true });
  return listen(await createBffHttpServer({
    agentBaseUrl,
    filePath: join(root, "business.json"),
    skillDataRoot: join(root, "skill-data"),
    skillsRoot: join(root, "skills"),
    remoteRegistryUrl: registryPath,
    registryServiceUrl: "",
    sopDataRoot: join(root, "sops"),
    workflowStageECapabilities: ENABLED_STAGE_E_CAPABILITIES,
  }));
}

function request(baseUrl: string, path: string, method = "GET", body?: unknown) {
  return fetch(`${baseUrl}${path}`, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}

afterEach(async () => {
  seen.length = 0;
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("workflow-runs API smoke", () => {
  it("区分草稿和发布运行，转发可续传 SSE，并传播取消", async () => {
    const baseUrl = await startBff(await startMockAgent());
    const draft = createTestDraft("workflow-run-api");
    expect((await request(baseUrl, "/api/sops", "POST", { draft })).status).toBe(201);
    const publish = await request(baseUrl, `/api/sops/${draft.id}/publish`, "POST", { expectedRevision: 0, releaseNotes: "run" });
    const version = (await publish.json() as { data: { id: string } }).data;

    const inlineDraft = { ...draft, name: "尚未保存的画布状态" };
    const draftRunResponse = await request(baseUrl, "/api/workflow-runs", "POST", { workflowId: draft.id, mode: "draft", draft: inlineDraft, inputs: {} });
    expect(draftRunResponse.status).toBe(201);
    const draftRun = (await draftRunResponse.json() as { data: { id: string; mode: string } }).data;
    expect(draftRun.mode).toBe("draft");

    const productionResponse = await request(baseUrl, "/api/workflow-runs", "POST", { workflowId: draft.id, versionId: version.id, mode: "production" });
    expect(productionResponse.status).toBe(201);
    const productionRun = (await productionResponse.json() as { data: { id: string; versionId: string; contentHash: string } }).data;
    expect(productionRun).toMatchObject({ versionId: version.id });
    expect(productionRun.contentHash).toBeTruthy();

    const queried = await request(baseUrl, `/api/workflow-runs/${productionRun.id}`);
    expect(queried.status).toBe(200);
    await expect(queried.json()).resolves.toMatchObject({
      ok: true,
      data: { id: productionRun.id, mode: "production", status: "queued" },
    });

    const events = await fetch(`${baseUrl}/api/workflow-runs/${productionRun.id}/events`, { headers: { "Last-Event-ID": "1" } });
    const eventText = await events.text();
    expect(eventText).not.toContain("id: 1\n");
    expect(eventText).not.toContain("event: future.node.metric");
    expect(eventText).toContain("id: 5\n");
    expect(seen.find((item) => item.path.includes(`${productionRun.id}/events`))?.lastEventId).toBe("1");

    const cancelled = await request(baseUrl, `/api/workflow-runs/${draftRun.id}/cancel`, "POST");
    expect(cancelled.status).toBe(202);
    expect(seen.some((item) => item.method === "POST" && item.path === `/workflow-runs/${draftRun.id}/cancel`)).toBe(true);

    const agentStarts = seen.filter((item) => item.path === "/workflow-runs");
    expect(agentStarts[0].body).toMatchObject({ mode: "draft", workflow: { id: draft.id, name: "尚未保存的画布状态" } });
    expect(agentStarts[1].body).toMatchObject({ mode: "production", workflow: { id: version.id, workflowId: draft.id } });

    const invalid = await request(baseUrl, "/api/workflow-runs", "POST", { workflowId: draft.id, mode: "invalid" });
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "WORKFLOW_RUN_INVALID" },
    });
  });

  it("生产运行递归解析并向 Agent 传递固定 Subworkflow 版本闭包", async () => {
    const baseUrl = await startBff(await startMockAgent());
    const childDraft = createTestDraft("workflow-run-child");
    expect((await request(baseUrl, "/api/sops", "POST", { draft: childDraft })).status).toBe(201);
    const childPublish = await request(baseUrl, `/api/sops/${childDraft.id}/publish`, "POST", { expectedRevision: 0 });
    const childVersion = (await childPublish.json() as { data: { id: string; workflowId: string; contentHash: string } }).data;
    const parentDraft = createTestDraft("workflow-run-parent");
    const definition = builtinNodeRegistry.get("subworkflow")!;
    const config = definition.createDefaultConfig();
    config.workflowId = childVersion.workflowId;
    config.versionId = childVersion.id;
    config.contentHash = childVersion.contentHash;
    const subworkflowNode = {
      kind: "builtin" as const,
      id: "subworkflow",
      type: "subworkflow" as const,
      version: definition.version,
      label: "子流程",
      position: { x: 0, y: 80 },
      config,
      ports: definition.createPorts(config),
    };
    parentDraft.nodes = [parentDraft.nodes[0]!, subworkflowNode, parentDraft.nodes[1]!];
    parentDraft.edges = [
      { id: "start-subworkflow", source: { nodeId: "start", portId: "out" }, target: { nodeId: "subworkflow", portId: "in" } },
      { id: "subworkflow-end", source: { nodeId: "subworkflow", portId: "result" }, target: { nodeId: "end", portId: "in" } },
    ];
    expect((await request(baseUrl, "/api/sops", "POST", { draft: parentDraft })).status).toBe(201);
    const parentPublish = await request(baseUrl, `/api/sops/${parentDraft.id}/publish`, "POST", { expectedRevision: 0 });
    const parentVersion = (await parentPublish.json() as { data: { id: string } }).data;

    const response = await request(baseUrl, "/api/workflow-runs", "POST", {
      workflowId: parentDraft.id,
      versionId: parentVersion.id,
      mode: "production",
    });

    expect(response.status).toBe(201);
    const start = seen.findLast((item) => item.method === "POST" && item.path === "/workflow-runs");
    expect(start?.body).toMatchObject({
      workflow: { id: parentVersion.id, workflowId: parentDraft.id },
      required_runtime_capabilities: ["nestedWorkflow"],
      workflow_dependencies: [{
        id: childVersion.id,
        workflowId: childVersion.workflowId,
        contentHash: childVersion.contentHash,
      }],
    });
  });

  it("生产运行只向 Agent 传递服务端解析的固定 AgentVersion，忽略客户端依赖注入", async () => {
    const baseUrl = await startBff(await startMockAgent());
    const profileResponse = await request(baseUrl, "/api/agents", "POST", {
      name: "Workflow Agent",
      description: "用于工作流运行依赖测试",
      systemPrompt: "只执行发布版本中的指令。",
      skillIds: [],
      skills: [],
    });
    expect(profileResponse.status).toBe(201);
    const profile = (await profileResponse.json() as { agent: { id: string } }).agent;
    const publishVersionResponse = await request(baseUrl, `/api/agents/${profile.id}/versions`, "POST", {
      createdBy: "workflow-test",
    });
    expect(publishVersionResponse.status).toBe(201);
    const agentVersion = (await publishVersionResponse.json() as {
      version: {
        id: string;
        agentProfileId: string;
        contentHash: string;
        outputSchema: Record<string, unknown>;
      };
    }).version;

    const source = createTestDraft("workflow-run-agent-version");
    const definition = builtinNodeRegistry.get("agent")!;
    const config = definition.createDefaultConfig();
    config.agentProfileId = agentVersion.agentProfileId;
    config.agentVersionId = agentVersion.id;
    config.outputSchema = agentVersion.outputSchema;
    const agentNode = {
      kind: "builtin" as const,
      id: "agent",
      type: "agent" as const,
      version: definition.version,
      label: "Agent",
      position: { x: 0, y: 80 },
      config,
      ports: definition.createPorts(config),
    };
    source.nodes = [source.nodes[0]!, agentNode, source.nodes[1]!];
    source.edges = [
      { id: "start-agent", source: { nodeId: "start", portId: "out" }, target: { nodeId: "agent", portId: "in" } },
      { id: "agent-end", source: { nodeId: "agent", portId: "result" }, target: { nodeId: "end", portId: "in" } },
    ];
    expect((await request(baseUrl, "/api/sops", "POST", { draft: source })).status).toBe(201);
    const publishWorkflowResponse = await request(baseUrl, `/api/sops/${source.id}/publish`, "POST", { expectedRevision: 0 });
    expect(publishWorkflowResponse.status).toBe(201);
    const workflowVersion = (await publishWorkflowResponse.json() as { data: { id: string } }).data;

    const response = await request(baseUrl, "/api/workflow-runs", "POST", {
      workflowId: source.id,
      versionId: workflowVersion.id,
      mode: "production",
      agent_dependencies: [{
        id: "forged-version",
        agentProfileId: agentVersion.agentProfileId,
        toolPolicy: { allowedToolIds: ["forged-tool"] },
        skillPolicy: { bindings: [{ skillId: "forged-skill" }] },
      }],
    });

    expect(response.status).toBe(201);
    const start = seen.findLast((item) => item.method === "POST" && item.path === "/workflow-runs");
    expect(start?.body.agent_dependencies).toEqual([expect.objectContaining({
      id: agentVersion.id,
      agentProfileId: agentVersion.agentProfileId,
      contentHash: agentVersion.contentHash,
      instructions: ["只执行发布版本中的指令。"],
      toolPolicy: { allowedToolIds: [] },
      skillPolicy: { bindings: [] },
      outputSchema: agentVersion.outputSchema,
    })]);
    expect(start?.body.required_runtime_capabilities).toEqual(["agentNode"]);
  });

  it("草稿运行递归提取 Human Approval policy 并忽略客户端伪造列表", async () => {
    const baseUrl = await startBff(await startMockAgent());
    const source = createTestDraft("workflow-run-approval-policies");
    const approvalDefinition = builtinNodeRegistry.get("human-approval")!;
    const topLevelApprovalConfig = approvalDefinition.createDefaultConfig();
    topLevelApprovalConfig.policyId = "policy-finance-review";
    const nestedApprovalConfig = approvalDefinition.createDefaultConfig();
    nestedApprovalConfig.policyId = "policy-security-review";
    const iterationDefinition = builtinNodeRegistry.get("iteration")!;
    const iterationConfig = iterationDefinition.createDefaultConfig();
    iterationConfig.body.nodes = [{
      kind: "builtin",
      id: "nested-approval",
      type: "human-approval",
      version: approvalDefinition.version,
      label: "嵌套审批",
      position: { x: 0, y: 0 },
      config: nestedApprovalConfig,
      ports: approvalDefinition.createPorts(nestedApprovalConfig),
    }];
    source.nodes.push(
      {
        kind: "builtin",
        id: "top-level-approval",
        type: "human-approval",
        version: approvalDefinition.version,
        label: "顶层审批",
        position: { x: 0, y: 80 },
        config: topLevelApprovalConfig,
        ports: approvalDefinition.createPorts(topLevelApprovalConfig),
      },
      {
        kind: "builtin",
        id: "approval-iteration",
        type: "iteration",
        version: iterationDefinition.version,
        label: "审批迭代",
        position: { x: 0, y: 160 },
        config: iterationConfig,
        ports: iterationDefinition.createPorts(iterationConfig),
      },
    );

    const response = await request(baseUrl, "/api/workflow-runs", "POST", {
      workflowId: source.id,
      mode: "draft",
      draft: source,
      approval_policy_ids: ["forged-policy"],
    });

    expect(response.status).toBe(201);
    const start = seen.findLast((item) => item.method === "POST" && item.path === "/workflow-runs");
    expect(start?.body.approval_policy_ids).toEqual([
      "policy-finance-review",
      "policy-security-review",
    ]);
    expect(start?.body.required_runtime_capabilities).toEqual([
      "iteration",
      "humanApproval",
      "restartResume",
    ]);
  });

  it("只通过具体 run resume Human Approval，且不存在独立 Approval API", async () => {
    const baseUrl = await startBff(await startMockAgent());
    const source = createTestDraft("workflow-run-approval-resume");
    const definition = builtinNodeRegistry.get("human-approval")!;
    const config = definition.createDefaultConfig();
    config.policyId = "policy-local-test";
    const approvalNode = {
      kind: "builtin" as const,
      id: "approval",
      type: "human-approval" as const,
      version: definition.version,
      label: "人工审批",
      position: { x: 0, y: 80 },
      config,
      ports: definition.createPorts(config),
    };
    source.nodes = [source.nodes[0]!, approvalNode, source.nodes[1]!];
    source.edges = [
      { id: "start-approval", source: { nodeId: "start", portId: "out" }, target: { nodeId: "approval", portId: "in" } },
      { id: "approval-end", source: { nodeId: "approval", portId: "approved" }, target: { nodeId: "end", portId: "in" } },
    ];

    const startedResponse = await request(baseUrl, "/api/workflow-runs", "POST", {
      workflowId: source.id,
      mode: "draft",
      draft: source,
    });
    expect(startedResponse.status).toBe(201);
    const started = (await startedResponse.json() as { data: { id: string; status: string; waiting: { waiting: { interruptId: string } } } }).data;
    expect(started.status).toBe("waiting");

    const mismatch = await request(baseUrl, `/api/workflow-runs/${started.id}/resume`, "POST", {
      interruptId: "interrupt-other-run",
      action: "approve",
      data: {},
      idempotencyKey: "decision-mismatch",
    });
    expect(mismatch.status).toBe(409);

    const resumed = await request(baseUrl, `/api/workflow-runs/${started.id}/resume`, "POST", {
      interruptId: started.waiting.waiting.interruptId,
      action: "approve",
      data: { comment: "ok" },
      idempotencyKey: "decision-1",
    });
    expect(resumed.status).toBe(200);
    await expect(resumed.json()).resolves.toMatchObject({ data: { id: started.id, status: "succeeded" } });
    expect(seen.findLast((item) => item.path === `/workflow-runs/${started.id}/resume`)?.body).toEqual({
      step_id: "approval",
      resume_data: {
        interruptId: started.waiting.waiting.interruptId,
        approvalRequestId: started.waiting.waiting.interruptId,
        action: "approve",
        data: { comment: "ok" },
      },
      interrupt: {
        interrupt_id: started.waiting.waiting.interruptId,
        action: "approve",
        idempotency_key: "decision-1",
      },
    });

    expect((await request(baseUrl, "/api/approvals")).status).toBe(404);
    expect((await request(baseUrl, "/api/approvals/approval-1")).status).toBe(404);
    expect((await request(baseUrl, "/api/approvals/approval-1/decision", "POST", {})).status).toBe(404);
  });
});
