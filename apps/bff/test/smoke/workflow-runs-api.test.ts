import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBffHttpServer } from "../../src/server.js";
import { createTestDraft } from "../unit/sops/test-fixtures.js";

const servers: Server[] = [];
const roots: string[] = [];
const seen: Array<{ method: string; path: string; body: Record<string, unknown>; lastEventId?: string }> = [];

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
    status: "queued",
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
      runs.set(run.id, run);
      json(res, 201, { ok: true, run });
      return;
    }
    const cancel = url.pathname.match(/^\/workflow-runs\/([^/]+)\/cancel$/);
    if (req.method === "POST" && cancel) {
      json(res, 202, { ok: true, run: runs.get(cancel[1]) });
      return;
    }
    const events = url.pathname.match(/^\/workflow-runs\/([^/]+)\/events$/);
    if (req.method === "GET" && events) {
      const run = runs.get(events[1])!;
      const cursor = Number(req.headers["last-event-id"] ?? url.searchParams.get("since_id") ?? 0);
      const stream = [
        { id: 1, runId: run.id, at: 20, type: "run.status", status: "running" },
        { id: 2, runId: run.id, at: 30, type: "node.status", nodeId: "start", status: "succeeded", attempt: 1 },
        { id: 3, runId: run.id, at: 40, type: "run.output", output: { result: "ok" } },
        { id: 4, runId: run.id, at: 50, type: "run.status", status: "succeeded" },
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

    const draftRunResponse = await request(baseUrl, "/api/workflow-runs", "POST", { workflowId: draft.id, mode: "draft", inputs: {} });
    expect(draftRunResponse.status).toBe(201);
    const draftRun = (await draftRunResponse.json() as { data: { id: string; mode: string } }).data;
    expect(draftRun.mode).toBe("draft");

    const productionResponse = await request(baseUrl, "/api/workflow-runs", "POST", { workflowId: draft.id, versionId: version.id, mode: "production" });
    expect(productionResponse.status).toBe(201);
    const productionRun = (await productionResponse.json() as { data: { id: string; versionId: string; contentHash: string } }).data;
    expect(productionRun).toMatchObject({ versionId: version.id });
    expect(productionRun.contentHash).toBeTruthy();

    const events = await fetch(`${baseUrl}/api/workflow-runs/${productionRun.id}/events`, { headers: { "Last-Event-ID": "1" } });
    const eventText = await events.text();
    expect(eventText).not.toContain("id: 1\n");
    expect(eventText).toContain("id: 4\n");
    expect(seen.find((item) => item.path.includes(`${productionRun.id}/events`))?.lastEventId).toBe("1");

    const cancelled = await request(baseUrl, `/api/workflow-runs/${draftRun.id}/cancel`, "POST");
    expect(cancelled.status).toBe(202);
    expect(seen.some((item) => item.method === "POST" && item.path === `/workflow-runs/${draftRun.id}/cancel`)).toBe(true);

    const agentStarts = seen.filter((item) => item.path === "/workflow-runs");
    expect(agentStarts[0].body).toMatchObject({ mode: "draft", workflow: { id: draft.id } });
    expect(agentStarts[1].body).toMatchObject({ mode: "production", workflow: { id: version.id, workflowId: draft.id } });
  });
});
