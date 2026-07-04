import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createBffHttpServer } from "../../src/server.js";

type SeenRequest = {
  method: string;
  pathname: string;
  search: string;
  body: unknown;
};

const servers: Server[] = [];
const tempDirs: string[] = [];

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("server did not bind to a TCP port");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function startMockAgent(): Promise<{ baseUrl: string; seen: SeenRequest[] }> {
  const seen: SeenRequest[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const method = req.method ?? "GET";
    const body = method === "GET" ? {} : await readBody(req);
    seen.push({ method, pathname: url.pathname, search: url.search, body });

    if (method === "GET" && url.pathname === "/health") {
      json(res, 200, { ok: true, status: "ok" });
      return;
    }
    if (method === "GET" && url.pathname === "/sessions") {
      json(res, 200, { ok: true, sessions: [{ id: "s1", busy: false, messageCount: 2 }] });
      return;
    }
    if (method === "POST" && url.pathname === "/sessions") {
      json(res, 201, { ok: true, session: { id: "s2", busy: false, messageCount: 0 } });
      return;
    }
    if (method === "GET" && url.pathname === "/sessions/s1") {
      json(res, 200, {
        ok: true,
        session: {
          id: "s1",
          busy: false,
          messageCount: 2,
          messages: [
            { role: "user", content: "hello" },
            { role: "assistant", content: "world" },
          ],
        },
      });
      return;
    }
    if (method === "POST" && url.pathname === "/chat") {
      json(res, 200, { ok: true, session: { id: "s1" }, assistant: "reply" });
      return;
    }
    if (method === "POST" && url.pathname === "/skills/resolve") {
      json(res, 200, { ok: true, skills: [{ name: "remote-review", sourceType: "remote" }] });
      return;
    }
    if (method === "POST" && url.pathname === "/chat/stream") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.write("event: message.start\n");
      res.write("data: {\"session_id\":\"s1\"}\n\n");
      res.write("event: message.delta\n");
      res.write("data: {\"delta\":\"re\"}\n\n");
      res.write("event: message.delta\n");
      res.write("data: {\"delta\":\"ply\"}\n\n");
      res.write("event: message.done\n");
      res.write("data: {\"ok\":true,\"assistant\":\"reply\",\"session\":{\"id\":\"s1\"}}\n\n");
      res.end();
      return;
    }
    if (method === "GET" && url.pathname === "/audit/events") {
      json(res, 200, { ok: true, events: [{ id: "aud1" }], query: url.searchParams.get("limit") });
      return;
    }
    if (method === "GET" && url.pathname === "/security/findings") {
      json(res, 200, { ok: true, findings: [{ id: "sf1" }] });
      return;
    }
    if (method === "GET" && url.pathname === "/events") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.write("event: bridge.ready\n");
      res.write("data: {\"ok\":true}\n\n");
      res.end();
      return;
    }

    json(res, 404, { ok: false, error: { code: "NOT_FOUND", message: url.pathname } });
  });
  return { baseUrl: await listen(server), seen };
}

async function startMockSkillRegistry(): Promise<{ registryUrl: string }> {
  const remoteHttpPackage = {
    files: [
      {
        path: "SKILL.md",
        content:
          "---\nname: remote-http\ndescription: Use when testing an HTTP backed remote registry skill.\n---\n\n# Remote HTTP\n",
      },
      {
        path: "skill.json",
        content: JSON.stringify({
          id: "remote-http",
          name: "HTTP 远端 Skill",
          summary: "来自 HTTP registry 的 skill。",
          category: "远端",
          provider: "HTTP Registry",
          version: "1.0.0",
          runtime: "Skill runtime",
          permissions: ["网络读取"],
          updatedAt: "2026-06-23",
          maturity: "stable",
          tags: ["remote", "http"],
          entry: "SKILL.md",
        }),
      },
    ],
  };
  const remoteHttpPackageRaw = JSON.stringify(remoteHttpPackage);
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/registry.json") {
      json(res, 200, {
        skills: [
          {
            id: "remote-http",
            version: "1.0.0",
            packageUrl: "./remote-http.package.json",
            packageSha256: sha256Hex(remoteHttpPackageRaw),
            source: "verified",
            publisher: { id: "http-registry", name: "HTTP Registry", verified: true },
            downloads: 2400,
            rating: 4.6,
            deprecated: false,
            metadata: {
              name: "HTTP 远端 Skill",
              summary: "来自 HTTP registry 的 skill。",
              category: "远端",
              provider: "HTTP Registry",
              runtime: "Skill runtime",
              permissions: ["网络读取"],
              updatedAt: "2026-06-23",
              maturity: "stable",
              tags: ["remote", "http"],
            },
          },
        ],
      });
      return;
    }
    if (url.pathname === "/remote-http.package.json") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(remoteHttpPackageRaw);
      return;
    }
    json(res, 404, { ok: false, error: { code: "NOT_FOUND", message: url.pathname } });
  });
  return { registryUrl: `${await listen(server)}/registry.json` };
}

async function startMockSkillRegistryService(adminToken?: string): Promise<{ baseUrl: string; downloads: string[]; adminAuthorizations: string[] }> {
  const downloads: string[] = [];
  const adminAuthorizations: string[] = [];
  const published = new Map<string, { raw: string; skill: Record<string, unknown> }>();
  const servicePackage = {
    files: [
      {
        path: "SKILL.md",
        content:
          "---\nname: registry-service-skill\ndescription: Use when testing the standalone registry service provider.\n---\n\n# Registry Service Skill\n",
      },
      {
        path: "skill.json",
        content: JSON.stringify({
          id: "registry-service-skill",
          name: "Registry Service Skill",
          summary: "来自独立 registry service。",
          category: "远端服务",
          provider: "Skill Registry Service",
          version: "1.0.0",
          runtime: "Skill runtime",
          permissions: ["服务读取"],
          updatedAt: "2026-06-23",
          maturity: "stable",
          tags: ["registry-service"],
          entry: "SKILL.md",
        }),
      },
    ],
  };
  const packageRaw = JSON.stringify(servicePackage);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const baseUrl = `http://${req.headers.host}`;
    if (req.method === "GET" && url.pathname === "/skills") {
      json(res, 200, {
        skills: [
          {
            id: "registry-service-skill",
            version: "1.0.0",
            packageUrl: `${baseUrl}/skills/registry-service-skill/download?version=1.0.0`,
            packageSha256: sha256Hex(packageRaw),
            source: "official",
            publisher: { id: "registry-service", name: "Registry Service", verified: true },
            downloads: downloads.length,
            rating: 4.9,
            deprecated: false,
            metadata: {
              name: "Registry Service Skill",
              summary: "来自独立 registry service。",
              category: "远端服务",
              provider: "Skill Registry Service",
              runtime: "Skill runtime",
              permissions: ["服务读取"],
              updatedAt: "2026-06-23",
              maturity: "stable",
              tags: ["registry-service"],
            },
          },
          ...[...published.values()].map((item) => item.skill),
        ],
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/admin/publish") {
      adminAuthorizations.push(String(req.headers.authorization ?? ""));
      if (adminToken && req.headers.authorization !== `Bearer ${adminToken}`) {
        json(res, req.headers.authorization ? 403 : 401, {
          ok: false,
          error: { code: req.headers.authorization ? "ADMIN_AUTH_FORBIDDEN" : "ADMIN_AUTH_REQUIRED" },
        });
        return;
      }
      const body = asObject(await readBody(req));
      const skillPackage = asObject(body.package);
      const files = Array.isArray(skillPackage.files) ? skillPackage.files : [];
      const metadataFile = files.find((file) => asObject(file).path === "skill.json");
      if (!metadataFile) {
        json(res, 400, { ok: false, error: { code: "SKILL_PACKAGE_INVALID", message: "skill package is invalid" } });
        return;
      }
      const metadata = JSON.parse(String(asObject(metadataFile).content)) as Record<string, unknown>;
      const skillId = String(metadata.id);
      const version = String(metadata.version);
      const raw = JSON.stringify({ files });
      const skill = {
        id: skillId,
        version,
        packageUrl: `${baseUrl}/skills/${skillId}/download?version=${version}`,
        packageSha256: sha256Hex(raw),
        source: "private",
        publisher: { id: "local-user", name: "Local User", verified: false },
        downloads: 0,
        rating: null,
        deprecated: false,
        metadata: {
          name: metadata.name,
          summary: metadata.summary,
          category: metadata.category,
          provider: metadata.provider,
          runtime: metadata.runtime,
          permissions: metadata.permissions,
          updatedAt: metadata.updatedAt,
          maturity: metadata.maturity,
          tags: metadata.tags,
        },
      };
      published.set(skillId, { raw, skill });
      json(res, 201, { ok: true, skill });
      return;
    }
    if (req.method === "POST" && url.pathname === "/skills/registry-service-skill/download") {
      downloads.push(url.searchParams.get("version") ?? "");
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(packageRaw);
      return;
    }
    const publishedDownloadMatch = /^\/skills\/([^/]+)\/download$/.exec(url.pathname);
    if (req.method === "POST" && publishedDownloadMatch) {
      const item = published.get(decodeURIComponent(publishedDownloadMatch[1] ?? ""));
      if (!item) {
        json(res, 404, { ok: false, error: { code: "NOT_FOUND", message: url.pathname } });
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(item.raw);
      return;
    }
    json(res, 404, { ok: false, error: { code: "NOT_FOUND", message: url.pathname } });
  });
  return { baseUrl: await listen(server), downloads, adminAuthorizations };
}

async function startBff(
  agentBaseUrl: string,
  options: {
    skillsRoot?: string;
    skillDataRoot?: string;
    remoteRegistryUrl?: string;
    registryServiceUrl?: string;
    registryAdminToken?: string;
  } = {},
): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "agent-bff-test-"));
  tempDirs.push(tempDir);
  const remoteRegistryUrl = options.remoteRegistryUrl ?? (options.registryServiceUrl ? undefined : join(tempDir, "empty-registry.json"));
  if (remoteRegistryUrl && !options.remoteRegistryUrl) {
    await writeFile(remoteRegistryUrl, JSON.stringify({ skills: [] }), "utf8");
  }
  return listen(
    await createBffHttpServer({
      agentBaseUrl,
      filePath: join(tempDir, "state.json"),
      skillsRoot: options.skillsRoot,
      skillDataRoot: options.skillDataRoot ?? join(tempDir, "skills-data"),
      remoteRegistryUrl,
      registryServiceUrl: options.registryServiceUrl,
      registryAdminToken: options.registryAdminToken,
    }),
  );
}

async function writeSkillManifest(
  skillsRoot: string,
  skillId: string,
  manifest: Record<string, unknown>,
): Promise<void> {
  const skillRoot = join(skillsRoot, skillId);
  await mkdir(skillRoot, { recursive: true });
  await writeFile(
    join(skillRoot, "SKILL.md"),
    [
      "---",
      `name: ${skillId}`,
      `description: Use ${skillId} during local BFF registry tests.`,
      "---",
      "",
      `# ${skillId}`,
      "",
      "Use this test skill to verify local registry loading.",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(join(skillRoot, "skill.json"), JSON.stringify({ id: skillId, ...manifest }, null, 2), "utf8");
}

async function requestJson(input: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(input, init);
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe("bff server", () => {
  it("forwards health, session, message, audit, and security APIs to the agent service", async () => {
    const agent = await startMockAgent();
    const bffBaseUrl = await startBff(agent.baseUrl);

    await expect(requestJson(`${bffBaseUrl}/api/health`)).resolves.toMatchObject({
      status: 200,
      body: { ok: true, bff: { status: "ok" }, agent: { ok: true, status: "ok" } },
    });
    await expect(requestJson(`${bffBaseUrl}/api/sessions`)).resolves.toMatchObject({
      status: 200,
      body: { ok: true, sessions: [{ id: "s1" }] },
    });
    await expect(requestJson(`${bffBaseUrl}/api/sessions`, { method: "POST" })).resolves.toMatchObject({
      status: 201,
      body: { ok: true, session: { id: "s2" } },
    });
    await expect(requestJson(`${bffBaseUrl}/api/sessions/s1`)).resolves.toMatchObject({
      status: 200,
      body: { ok: true, session: { id: "s1" } },
    });
    await expect(requestJson(`${bffBaseUrl}/api/sessions/s1/transcript`)).resolves.toMatchObject({
      status: 200,
      body: {
        ok: true,
        session_id: "s1",
        messages: expect.arrayContaining([{ role: "user", content: "hello" }]),
      },
    });
    await expect(
      requestJson(`${bffBaseUrl}/api/sessions/s1/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "continue", include_scheduled_notifications: true }),
      }),
    ).resolves.toMatchObject({
      status: 200,
      body: { ok: true, assistant: "reply" },
    });
    await expect(
      requestJson(`${bffBaseUrl}/api/agent-skills/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: {
            id: "agent-alpha",
            name: "Alpha Agent",
            skills: [{ skillId: "remote-review", version: "1.2.0", sourceType: "remote", registrySource: "official" }],
          },
        }),
      }),
    ).resolves.toMatchObject({
      status: 200,
      body: { ok: true, skills: [{ name: "remote-review", sourceType: "remote" }] },
    });
    await expect(requestJson(`${bffBaseUrl}/api/audit/events?limit=5`)).resolves.toMatchObject({
      status: 200,
      body: { ok: true, events: [{ id: "aud1" }], query: "5" },
    });
    await expect(requestJson(`${bffBaseUrl}/api/security/findings`)).resolves.toMatchObject({
      status: 200,
      body: { ok: true, findings: [{ id: "sf1" }] },
    });

    expect(agent.seen.map((item) => `${item.method} ${item.pathname}${item.search}`)).toEqual([
      "GET /health",
      "GET /sessions",
      "POST /sessions",
      "GET /sessions/s1",
      "GET /sessions/s1",
      "POST /chat",
      "POST /skills/resolve",
      "GET /audit/events?limit=5",
      "GET /security/findings",
    ]);
    expect(agent.seen.find((item) => item.pathname === "/chat")?.body).toEqual({
      session_id: "s1",
      message: "continue",
      include_scheduled_notifications: true,
    });
    expect(agent.seen.find((item) => item.pathname === "/skills/resolve")?.body).toEqual({
      agent: {
        id: "agent-alpha",
        name: "Alpha Agent",
        skills: [{ skillId: "remote-review", version: "1.2.0", sourceType: "remote", registrySource: "official" }],
      },
    });
  });

  it("normalizes unavailable upstream errors and handles CORS preflight", async () => {
    const bffBaseUrl = await startBff("http://127.0.0.1:9");

    const preflight = await fetch(`${bffBaseUrl}/api/sessions`, { method: "OPTIONS" });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");

    await expect(requestJson(`${bffBaseUrl}/api/sessions`)).resolves.toMatchObject({
      status: 502,
      body: {
        ok: false,
        error: { code: "AGENT_UPSTREAM_UNAVAILABLE" },
      },
    });
  });

  it("serves and persists local profile and settings business APIs", async () => {
    const agent = await startMockAgent();
    const bffBaseUrl = await startBff(agent.baseUrl);

    await expect(requestJson(`${bffBaseUrl}/api/profile`)).resolves.toMatchObject({
      status: 200,
      body: { ok: true, profile: { displayName: "本地用户", description: "AI Studio operator" } },
    });
    await expect(
      requestJson(`${bffBaseUrl}/api/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: " 花忆 ", description: " 控制台使用者 " }),
      }),
    ).resolves.toMatchObject({
      status: 200,
      body: { ok: true, profile: { displayName: "花忆", description: "控制台使用者" } },
    });
    await expect(requestJson(`${bffBaseUrl}/api/profile`)).resolves.toMatchObject({
      status: 200,
      body: { ok: true, profile: { displayName: "花忆", description: "控制台使用者" } },
    });

    await expect(requestJson(`${bffBaseUrl}/api/settings`)).resolves.toMatchObject({
      status: 200,
      body: {
        ok: true,
        settings: { theme: "dark", language: "zh-CN", shortcutHints: true, markdownRendering: true },
      },
    });
    await expect(
      requestJson(`${bffBaseUrl}/api/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: "light", shortcutHints: false }),
      }),
    ).resolves.toMatchObject({
      status: 200,
      body: {
        ok: true,
        settings: { theme: "light", language: "zh-CN", shortcutHints: false, markdownRendering: true },
      },
    });
  });

  it("serves and persists local agent profile CRUD APIs", async () => {
    const agent = await startMockAgent();
    const bffBaseUrl = await startBff(agent.baseUrl);

    await expect(requestJson(`${bffBaseUrl}/api/agents`)).resolves.toMatchObject({
      status: 200,
      body: { ok: true, agents: [] },
    });

    const created = await requestJson(`${bffBaseUrl}/api/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        avatarId: "code",
        name: "  文档分析 Agent  ",
        description: "  处理长文档  ",
        scenario: "  文档整理和摘要  ",
        skillIds: ["code-workspace", "code-workspace", "memory-context"],
        actions: [" 摘要文档 ", " 输出待办 "],
        systemPrompt: " 保持结论可验证 ",
      }),
    });
    const createdAgent = created.body.agent as Record<string, unknown>;
    expect(created).toMatchObject({
      status: 201,
      body: {
        ok: true,
        agent: {
          avatarId: "code",
          name: "文档分析 Agent",
          description: "处理长文档",
          scenario: "文档整理和摘要",
          skillIds: ["code-workspace", "memory-context"],
          skills: [
            { skillId: "code-workspace", version: "1.2.0", sourceType: "builtin", registrySource: "local" },
            { skillId: "memory-context", version: "0.8.0", sourceType: "builtin", registrySource: "local" },
          ],
          actions: ["摘要文档", "输出待办"],
          systemPrompt: "保持结论可验证",
        },
      },
    });
    expect(typeof createdAgent.id).toBe("string");

    await expect(requestJson(`${bffBaseUrl}/api/agents`)).resolves.toMatchObject({
      status: 200,
      body: { ok: true, agents: [{ id: createdAgent.id, avatarId: "code", name: "文档分析 Agent" }] },
    });

    await expect(
      requestJson(`${bffBaseUrl}/api/agents/${createdAgent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avatarId: "compass",
          name: "交付 Agent",
          skillIds: ["legacy-stale"],
          skills: [
            { skillId: "memory-context", version: "0.8.0", sourceType: "builtin", registrySource: "local" },
            { skillId: "memory-context", version: "0.8.0", sourceType: "builtin", registrySource: "local" },
          ],
          actions: ["验证构建"],
        }),
      }),
    ).resolves.toMatchObject({
      status: 200,
      body: {
        ok: true,
        agent: {
          id: createdAgent.id,
          avatarId: "compass",
          name: "交付 Agent",
          skillIds: ["memory-context"],
          skills: [{ skillId: "memory-context", version: "0.8.0", sourceType: "builtin", registrySource: "local" }],
          actions: ["验证构建"],
        },
      },
    });

    await expect(
      requestJson(`${bffBaseUrl}/api/agents/${createdAgent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createdAgent,
          skills: [{ skillId: "memory-context", version: "0.7.0", sourceType: "builtin", registrySource: "local" }],
        }),
      }),
    ).resolves.toMatchObject({
      status: 400,
      body: { ok: false, error: { code: "AGENT_SKILL_BINDING_INVALID" } },
    });

    await expect(
      requestJson(`${bffBaseUrl}/api/agents/${createdAgent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createdAgent,
          skills: [{ skillId: "not-installed", version: "1.0.0", sourceType: "builtin", registrySource: "local" }],
        }),
      }),
    ).resolves.toMatchObject({
      status: 400,
      body: {
        ok: false,
        error: {
          code: "AGENT_SKILL_BINDING_INVALID",
          details: [{ skillId: "not-installed", code: "SKILL_NOT_INSTALLED" }],
        },
      },
    });

    await expect(
      requestJson(`${bffBaseUrl}/api/agents/${createdAgent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createdAgent,
          skills: [{ skillId: "memory-context", version: "0.8.0", sourceType: "remote", registrySource: "local" }],
        }),
      }),
    ).resolves.toMatchObject({
      status: 400,
      body: {
        ok: false,
        error: {
          code: "AGENT_SKILL_BINDING_INVALID",
          details: [{ skillId: "memory-context", code: "SOURCE_MISMATCH" }],
        },
      },
    });

    await expect(
      requestJson(`${bffBaseUrl}/api/agents/${createdAgent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createdAgent,
          skills: [{ skillId: "memory-context", version: "0.8.0", sourceType: "builtin", registrySource: "official" }],
        }),
      }),
    ).resolves.toMatchObject({
      status: 400,
      body: {
        ok: false,
        error: {
          code: "AGENT_SKILL_BINDING_INVALID",
          details: [{ skillId: "memory-context", code: "REGISTRY_SOURCE_MISMATCH" }],
        },
      },
    });

    await expect(requestJson(`${bffBaseUrl}/api/agents/${createdAgent.id}`, { method: "DELETE" })).resolves.toMatchObject({
      status: 200,
      body: { ok: true },
    });
    await expect(requestJson(`${bffBaseUrl}/api/agents/${createdAgent.id}`, { method: "DELETE" })).resolves.toMatchObject({
      status: 404,
      body: { ok: false, error: { code: "AGENT_NOT_FOUND" } },
    });
  });

  it("serves local skill registry APIs and persists install state", async () => {
    const agent = await startMockAgent();
    const skillsRoot = await mkdtemp(join(tmpdir(), "agent-bff-skills-"));
    tempDirs.push(skillsRoot);
    await writeSkillManifest(skillsRoot, "code-workspace", {
      name: "代码工作区",
      summary: "读取仓库、修改文件、运行验证命令。",
      category: "执行",
      provider: "Workspace",
      version: "1.2.0",
      runtime: "Local workspace",
      permissions: ["文件读写", "命令执行"],
      updatedAt: "2026-06-18",
      maturity: "stable",
      tags: ["code", "test"],
      entry: "README.md",
    });
    await writeSkillManifest(skillsRoot, "quality-gate", {
      name: "质量闸门",
      summary: "执行测试、构建、回归与发布前检查。",
      category: "验证",
      provider: "Release",
      version: "0.9.0",
      runtime: "Validation runner",
      permissions: ["命令执行", "日志读取"],
      updatedAt: "2026-06-17",
      maturity: "stable",
      tags: ["build", "release"],
      entry: "README.md",
    });
    const bffBaseUrl = await startBff(agent.baseUrl, { skillsRoot });

    const initialSkills = await requestJson(`${bffBaseUrl}/api/skills`);
    expect(initialSkills).toMatchObject({
      status: 200,
      body: {
        ok: true,
        skills: expect.arrayContaining([
          expect.objectContaining({ id: "code-workspace", name: "代码工作区", installed: true }),
          expect.objectContaining({ id: "quality-gate", name: "质量闸门", installed: false, sourceType: "builtin", status: "downloaded" }),
        ]),
      },
    });
    await expect(requestJson(`${bffBaseUrl}/api/skills/quality-gate/install`, { method: "POST" })).resolves.toMatchObject({
      status: 200,
      body: { ok: true, skill: { id: "quality-gate", installed: true } },
    });
    await expect(requestJson(`${bffBaseUrl}/api/skills`)).resolves.toMatchObject({
      status: 200,
      body: {
        ok: true,
        skills: expect.arrayContaining([
          expect.objectContaining({ id: "code-workspace", installed: true }),
          expect.objectContaining({ id: "quality-gate", installed: true }),
        ]),
      },
    });
    await expect(requestJson(`${bffBaseUrl}/api/skills/code-workspace/uninstall`, { method: "POST" })).resolves.toMatchObject({
      status: 200,
      body: { ok: true, skill: { id: "code-workspace", installed: false } },
    });
    await expect(requestJson(`${bffBaseUrl}/api/skills/missing/install`, { method: "POST" })).resolves.toMatchObject({
      status: 404,
      body: { ok: false, error: { code: "SKILL_NOT_FOUND" } },
    });
  });

  it("downloads remote skills and uploads validated custom packages", async () => {
    const agent = await startMockAgent();
    const tempDir = await mkdtemp(join(tmpdir(), "agent-bff-skillhub-"));
    tempDirs.push(tempDir);
    const skillsRoot = join(tempDir, "builtin");
    const packagePath = join(tempDir, "remote.package.json");
    const registryPath = join(tempDir, "registry.json");
    await mkdir(skillsRoot, { recursive: true });
    const remotePackageRaw = JSON.stringify({
      files: [
        {
          path: "SKILL.md",
          content:
            "---\nname: remote-test\ndescription: Use when testing a remote skill package.\n---\n\n# Remote Test\n",
        },
        {
          path: "skill.json",
          content: JSON.stringify({
            id: "remote-test",
            name: "远端测试",
            summary: "远端测试 skill。",
            category: "远端",
            provider: "Registry",
            version: "1.0.0",
            runtime: "Skill runtime",
            permissions: ["测试"],
            updatedAt: "2026-06-22",
            maturity: "stable",
            tags: ["remote"],
            entry: "SKILL.md",
          }),
        },
      ],
    });
    await writeFile(packagePath, remotePackageRaw, "utf8");
    await writeFile(
      registryPath,
      JSON.stringify({
        skills: [
          {
            id: "remote-test",
            version: "1.0.0",
            packageUrl: packagePath,
            packageSha256: sha256Hex(remotePackageRaw),
            source: "official",
            publisher: { id: "registry", name: "Registry", verified: true },
            downloads: 1200,
            rating: 4.7,
            metadata: { name: "远端测试", summary: "远端测试 skill。", category: "远端" },
          },
        ],
      }),
      "utf8",
    );
    const bffBaseUrl = await startBff(agent.baseUrl, { skillsRoot, remoteRegistryUrl: registryPath });

    await expect(requestJson(`${bffBaseUrl}/api/skills`)).resolves.toMatchObject({
      status: 200,
      body: {
        ok: true,
        skills: [
          {
            id: "remote-test",
            sourceType: "remote",
            registrySource: "official",
            publisher: { id: "registry", name: "Registry", verified: true },
            downloads: 1200,
            rating: 4.7,
            packageSha256: sha256Hex(remotePackageRaw),
            status: "available",
          },
        ],
      },
    });
    await expect(requestJson(`${bffBaseUrl}/api/skills/remote-test/download`, { method: "POST" })).resolves.toMatchObject({
      status: 200,
      body: {
        ok: true,
        skill: {
          id: "remote-test",
          sourceType: "remote",
          registrySource: "official",
          downloads: 1200,
          status: "downloaded",
        },
      },
    });
    await expect(requestJson(`${bffBaseUrl}/api/skills/remote-test/install`, { method: "POST" })).resolves.toMatchObject({
      status: 200,
      body: { ok: true, skill: { id: "remote-test", installed: true, status: "installed" } },
    });

    const customPackage = {
      files: [
        {
          path: "SKILL.md",
          content:
            "---\nname: custom-review\ndescription: Use when testing a custom uploaded skill package.\n---\n\n# Custom Review\n",
        },
        {
          path: "skill.json",
          content: JSON.stringify({
            id: "custom-review",
            name: "自定义评审",
            summary: "上传的自定义 skill。",
            category: "自定义",
            provider: "User",
            version: "0.1.0",
            runtime: "Skill runtime",
            permissions: ["本地存储"],
            updatedAt: "2026-06-22",
            maturity: "beta",
            tags: ["custom"],
            entry: "SKILL.md",
          }),
        },
      ],
    };
    await expect(
      requestJson(`${bffBaseUrl}/api/skills/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customPackage),
      }),
    ).resolves.toMatchObject({
      status: 201,
      body: { ok: true, skill: { id: "custom-review", sourceType: "custom", status: "downloaded" } },
    });
    const packageV1 = {
      skillPackageVersion: "1.0",
      files: [
        {
          path: "SKILL.md",
          content:
            "---\nname: package-v1-custom\ndescription: Use when testing package v1 custom uploads.\n---\n\n# Package v1 Custom\n",
        },
        {
          path: "skill.json",
          content: JSON.stringify({
            id: "package-v1-custom",
            name: "Package v1 Custom",
            summary: "通过 BFF 上传 package v1。",
            category: "自定义",
            provider: "User",
            version: "1.0.0",
            runtime: "Skill runtime",
            permissions: ["本地存储"],
            updatedAt: "2026-06-28",
            maturity: "stable",
            tags: ["package-v1"],
            entry: "SKILL.md",
          }),
        },
        { path: "README.md", content: "# Package v1 Custom\n" },
        { path: "permissions.json", content: JSON.stringify({ permissions: ["本地存储"] }) },
        { path: "examples/basic.md", content: "Upload this package through SkillHub.\n" },
      ],
    };
    await expect(
      requestJson(`${bffBaseUrl}/api/skills/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(packageV1),
      }),
    ).resolves.toMatchObject({
      status: 201,
      body: { ok: true, skill: { id: "package-v1-custom", sourceType: "custom", status: "downloaded" } },
    });
    await expect(
      requestJson(`${bffBaseUrl}/api/skills/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: [{ path: "../bad", content: "" }] }),
      }),
    ).resolves.toMatchObject({
      status: 400,
      body: { ok: false, error: { code: "SKILL_PACKAGE_INVALID" } },
    });
    await expect(
      requestJson(`${bffBaseUrl}/api/skills/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skillPackageVersion: "1.0",
          files: [
            { path: "SKILL.md", content: "---\nname: duplicate-custom\ndescription: Use when testing duplicate paths.\n---\n" },
            { path: "SKILL.md", content: "duplicate" },
            { path: "skill.json", content: JSON.stringify({ id: "duplicate-custom", name: "Duplicate", version: "1.0.0" }) },
          ],
        }),
      }),
    ).resolves.toMatchObject({
      status: 400,
      body: {
        ok: false,
        error: { code: "SKILL_PACKAGE_INVALID", errors: expect.arrayContaining(["duplicate file path: SKILL.md"]) },
      },
    });
    await expect(
      requestJson(`${bffBaseUrl}/api/skills/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skillPackageVersion: "2.0",
          files: [],
        }),
      }),
    ).resolves.toMatchObject({
      status: 400,
      body: {
        ok: false,
        error: { code: "SKILL_PACKAGE_INVALID", errors: expect.arrayContaining(["skillPackageVersion must be 1.0 when provided"]) },
      },
    });
    await expect(
      requestJson(`${bffBaseUrl}/api/skills/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skillPackageVersion: "1.0",
          files: [
            {
              path: "SKILL.md",
              content:
                "---\nname: missing-permission\ndescription: Use when testing permission declaration coverage.\n---\n",
            },
            {
              path: "skill.json",
              content: JSON.stringify({ id: "missing-permission", name: "Missing Permission", version: "1.0.0", permissions: ["文件读写"] }),
            },
            { path: "permissions.json", content: JSON.stringify({ permissions: ["网络访问"] }) },
          ],
        }),
      }),
    ).resolves.toMatchObject({
      status: 400,
      body: {
        ok: false,
        error: { code: "SKILL_PACKAGE_INVALID", errors: expect.arrayContaining(["permissions.json must include skill.json permission: 文件读写"]) },
      },
    });
    await expect(
      requestJson(`${bffBaseUrl}/api/skills/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [
            {
              path: "SKILL.md",
              content: "---\nname: incomplete-custom\ndescription: Use when testing incomplete custom metadata rejection.\n---\n",
            },
            { path: "skill.json", content: JSON.stringify({ id: "incomplete-custom" }) },
          ],
        }),
      }),
    ).resolves.toMatchObject({
      status: 400,
      body: {
        ok: false,
        error: { code: "SKILL_PACKAGE_INVALID", errors: expect.arrayContaining(["skill.json name is required", "skill.json version is required"]) },
      },
    });
  });

  it("rejects remote skill packages when packageSha256 does not match", async () => {
    const agent = await startMockAgent();
    const tempDir = await mkdtemp(join(tmpdir(), "agent-bff-skillhub-hash-"));
    tempDirs.push(tempDir);
    const skillsRoot = join(tempDir, "builtin");
    const packagePath = join(tempDir, "remote.package.json");
    const registryPath = join(tempDir, "registry.json");
    await mkdir(skillsRoot, { recursive: true });
    await writeFile(
      packagePath,
      JSON.stringify({
        files: [
          {
            path: "SKILL.md",
            content: "---\nname: remote-tampered\ndescription: Use when testing hash validation.\n---\n\n# Remote Tampered\n",
          },
          {
            path: "skill.json",
            content: JSON.stringify({
              id: "remote-tampered",
              name: "被篡改测试",
              summary: "hash 校验测试。",
              category: "远端",
              provider: "Registry",
              version: "1.0.0",
              runtime: "Skill runtime",
              permissions: ["测试"],
              updatedAt: "2026-06-23",
              maturity: "stable",
              tags: ["remote"],
              entry: "SKILL.md",
            }),
          },
        ],
      }),
      "utf8",
    );
    await writeFile(
      registryPath,
      JSON.stringify({
        skills: [
          {
            id: "remote-tampered",
            version: "1.0.0",
            packageUrl: packagePath,
            packageSha256: "0".repeat(64),
            source: "community",
            publisher: { id: "registry", name: "Registry", verified: false },
            metadata: { name: "被篡改测试", summary: "hash 校验测试。", category: "远端" },
          },
        ],
      }),
      "utf8",
    );
    const bffBaseUrl = await startBff(agent.baseUrl, { skillsRoot, remoteRegistryUrl: registryPath });

    await expect(requestJson(`${bffBaseUrl}/api/skills/remote-tampered/download`, { method: "POST" })).resolves.toMatchObject({
      status: 400,
      body: {
        ok: false,
        error: {
          code: "SKILL_DOWNLOAD_FAILED",
          message: expect.stringContaining("hash mismatch"),
        },
      },
    });
  });

  it("tracks installed versions, updates to newer remote versions, and rolls back", async () => {
    const agent = await startMockAgent();
    const tempDir = await mkdtemp(join(tmpdir(), "agent-bff-skillhub-update-"));
    tempDirs.push(tempDir);
    const skillsRoot = join(tempDir, "builtin");
    const registryPath = join(tempDir, "registry.json");
    await mkdir(skillsRoot, { recursive: true });

    function packageRaw(version: string): string {
      return JSON.stringify({
        files: [
          {
            path: "SKILL.md",
            content:
              "---\nname: remote-updatable\ndescription: Use when testing remote skill updates.\n---\n\n# Remote Updatable\n",
          },
          {
            path: "skill.json",
            content: JSON.stringify({
              id: "remote-updatable",
              name: "远端可升级",
              summary: `远端版本 ${version}。`,
              category: "远端",
              provider: "Registry",
              version,
              runtime: "Skill runtime",
              permissions: ["测试"],
              updatedAt: "2026-06-29",
              maturity: "stable",
              tags: ["remote", "update"],
              entry: "SKILL.md",
            }),
          },
        ],
      });
    }

    const packageV1Raw = packageRaw("1.0.0");
    const packageV11Raw = packageRaw("1.1.0");
    const packageV1Path = join(tempDir, "remote-updatable-1.0.0.package.json");
    const packageV11Path = join(tempDir, "remote-updatable-1.1.0.package.json");
    await writeFile(packageV1Path, packageV1Raw, "utf8");
    await writeFile(packageV11Path, packageV11Raw, "utf8");

    function registryEntry(version: string, packagePath: string, raw: string) {
      return {
        id: "remote-updatable",
        version,
        packageUrl: packagePath,
        packageSha256: sha256Hex(raw),
        source: "official",
        publisher: { id: "registry", name: "Registry", verified: true },
        downloads: 10,
        rating: 4.8,
        metadata: { name: "远端可升级", summary: `远端版本 ${version}。`, category: "远端" },
      };
    }

    await writeFile(
      registryPath,
      JSON.stringify({ skills: [registryEntry("1.0.0", packageV1Path, packageV1Raw)] }),
      "utf8",
    );
    const bffBaseUrl = await startBff(agent.baseUrl, { skillsRoot, remoteRegistryUrl: registryPath });

    await expect(requestJson(`${bffBaseUrl}/api/skills/remote-updatable/download`, { method: "POST" })).resolves.toMatchObject({
      status: 200,
      body: { ok: true, skill: { id: "remote-updatable", status: "downloaded", version: "1.0.0" } },
    });
    await expect(requestJson(`${bffBaseUrl}/api/skills/remote-updatable/install`, { method: "POST" })).resolves.toMatchObject({
      status: 200,
      body: {
        ok: true,
        skill: { id: "remote-updatable", status: "installed", installed: true, installedVersion: "1.0.0" },
      },
    });

    await writeFile(
      registryPath,
      JSON.stringify({
        skills: [
          registryEntry("1.0.0", packageV1Path, packageV1Raw),
          registryEntry("1.1.0", packageV11Path, packageV11Raw),
        ],
      }),
      "utf8",
    );
    await expect(requestJson(`${bffBaseUrl}/api/skills`)).resolves.toMatchObject({
      status: 200,
      body: {
        ok: true,
        skills: [
          expect.objectContaining({
            id: "remote-updatable",
            status: "updateAvailable",
            installed: true,
            installedVersion: "1.0.0",
            availableVersion: "1.1.0",
          }),
        ],
      },
    });

    await expect(requestJson(`${bffBaseUrl}/api/skills/remote-updatable/update`, { method: "POST" })).resolves.toMatchObject({
      status: 200,
      body: {
        ok: true,
        skill: {
          id: "remote-updatable",
          status: "installed",
          installed: true,
          installedVersion: "1.1.0",
          previousInstalledVersion: "1.0.0",
        },
      },
    });
    await expect(requestJson(`${bffBaseUrl}/api/skills/remote-updatable/rollback`, { method: "POST" })).resolves.toMatchObject({
      status: 200,
      body: {
        ok: true,
        skill: {
          id: "remote-updatable",
          status: "updateAvailable",
          installed: true,
          installedVersion: "1.0.0",
          previousInstalledVersion: "1.1.0",
        },
      },
    });
    await expect(requestJson(`${bffBaseUrl}/api/skills/audit`)).resolves.toMatchObject({
      status: 200,
      body: {
        ok: true,
        events: expect.arrayContaining([
          expect.objectContaining({ action: "download", skillId: "remote-updatable", version: "1.0.0" }),
          expect.objectContaining({ action: "install", skillId: "remote-updatable", version: "1.0.0" }),
          expect.objectContaining({ action: "update", skillId: "remote-updatable", version: "1.1.0" }),
          expect.objectContaining({ action: "rollback", skillId: "remote-updatable", version: "1.0.0" }),
        ]),
      },
    });
  });

  it("configures and syncs an HTTP remote skill registry", async () => {
    const agent = await startMockAgent();
    const remote = await startMockSkillRegistry();
    const tempDir = await mkdtemp(join(tmpdir(), "agent-bff-remote-sync-"));
    tempDirs.push(tempDir);
    const bffBaseUrl = await startBff(agent.baseUrl, { skillsRoot: join(tempDir, "empty-builtin") });

    await expect(requestJson(`${bffBaseUrl}/api/skills/registry`)).resolves.toMatchObject({
      status: 200,
      body: { ok: true, registry: { lastSyncedAt: null } },
    });
    await expect(
      requestJson(`${bffBaseUrl}/api/skills/registry`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: remote.registryUrl }),
      }),
    ).resolves.toMatchObject({
      status: 200,
      body: { ok: true, registry: { url: remote.registryUrl, skillCount: 0 } },
    });
    await expect(requestJson(`${bffBaseUrl}/api/skills/registry/sync`, { method: "POST" })).resolves.toMatchObject({
      status: 200,
      body: { ok: true, registry: { url: remote.registryUrl, lastSyncError: "", skillCount: 1 } },
    });
    await expect(requestJson(`${bffBaseUrl}/api/skills`)).resolves.toMatchObject({
      status: 200,
      body: {
        ok: true,
        skills: [expect.objectContaining({ id: "remote-http", sourceType: "remote", status: "available" })],
      },
    });
    await expect(requestJson(`${bffBaseUrl}/api/skills/remote-http/download`, { method: "POST" })).resolves.toMatchObject({
      status: 200,
      body: { ok: true, skill: { id: "remote-http", sourceType: "remote", status: "downloaded" } },
    });
  });

  it("uses the standalone registry service provider when configured", async () => {
    const agent = await startMockAgent();
    const registryService = await startMockSkillRegistryService();
    const tempDir = await mkdtemp(join(tmpdir(), "agent-bff-registry-service-"));
    tempDirs.push(tempDir);
    const bffBaseUrl = await startBff(agent.baseUrl, {
      skillsRoot: join(tempDir, "empty-builtin"),
      registryServiceUrl: registryService.baseUrl,
    });

    await expect(requestJson(`${bffBaseUrl}/api/skills/registry`)).resolves.toMatchObject({
      status: 200,
      body: { ok: true, registry: { url: `${registryService.baseUrl}/skills`, managedByService: true } },
    });
    await expect(
      requestJson(`${bffBaseUrl}/api/skills/registry`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://external.example.com/skills.json" }),
      }),
    ).resolves.toMatchObject({
      status: 200,
      body: { ok: true, registry: { url: `${registryService.baseUrl}/skills`, managedByService: true } },
    });
    await expect(requestJson(`${bffBaseUrl}/api/skills`)).resolves.toMatchObject({
      status: 200,
      body: {
        ok: true,
        skills: [
          expect.objectContaining({
            id: "registry-service-skill",
            sourceType: "remote",
            registrySource: "official",
            publisher: { id: "registry-service", name: "Registry Service", verified: true },
            status: "available",
          }),
        ],
      },
    });
    await expect(
      requestJson(`${bffBaseUrl}/api/skills/registry-service-skill/download`, { method: "POST" }),
    ).resolves.toMatchObject({
      status: 200,
      body: {
        ok: true,
        skill: { id: "registry-service-skill", sourceType: "remote", status: "downloaded" },
      },
    });
    expect(registryService.downloads).toEqual(["1.0.0"]);
  });

  it("publishes custom uploads to the standalone registry service when configured", async () => {
    const agent = await startMockAgent();
    const registryAdminToken = "bff-registry-admin-token";
    const registryService = await startMockSkillRegistryService(registryAdminToken);
    const tempDir = await mkdtemp(join(tmpdir(), "agent-bff-registry-publish-"));
    tempDirs.push(tempDir);
    const bffBaseUrl = await startBff(agent.baseUrl, {
      skillsRoot: join(tempDir, "empty-builtin"),
      registryServiceUrl: registryService.baseUrl,
      registryAdminToken,
    });
    const skillPackage = {
      files: [
        {
          path: "SKILL.md",
          content:
            "---\nname: published-bff-skill\ndescription: Use when testing BFF publishing to the registry service.\n---\n\n# Published BFF Skill\n",
        },
        {
          path: "skill.json",
          content: JSON.stringify({
            id: "published-bff-skill",
            name: "BFF 发布 Skill",
            summary: "通过 BFF 上传并发布到 registry service。",
            category: "发布",
            provider: "BFF",
            version: "0.1.0",
            runtime: "Skill runtime",
            permissions: ["服务读取"],
            updatedAt: "2026-06-23",
            maturity: "beta",
            tags: ["publish"],
            entry: "SKILL.md",
          }),
        },
      ],
    };

    await expect(
      requestJson(`${bffBaseUrl}/api/skills/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(skillPackage),
      }),
    ).resolves.toMatchObject({
      status: 201,
      body: {
        ok: true,
        skill: {
          id: "published-bff-skill",
          sourceType: "remote",
          registrySource: "private",
          publisher: { id: "local-user", name: "Local User", verified: false },
          status: "available",
        },
      },
    });
    await expect(requestJson(`${bffBaseUrl}/api/skills`)).resolves.toMatchObject({
      status: 200,
      body: {
        ok: true,
        skills: expect.arrayContaining([
          expect.objectContaining({ id: "published-bff-skill", sourceType: "remote", status: "available" }),
        ]),
      },
    });
    expect(registryService.adminAuthorizations).toEqual([`Bearer ${registryAdminToken}`]);
  });

  it("proxies agent service SSE events", async () => {
    const agent = await startMockAgent();
    const bffBaseUrl = await startBff(agent.baseUrl);

    const response = await fetch(`${bffBaseUrl}/api/events/stream?since_id=7`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(text).toContain("event: bridge.ready");
    expect(agent.seen.at(-1)).toMatchObject({
      method: "GET",
      pathname: "/events",
      search: "?since_id=7",
    });
  });

  it("streams chat message responses as SSE events", async () => {
    const agent = await startMockAgent();
    const bffBaseUrl = await startBff(agent.baseUrl);

    const response = await fetch(`${bffBaseUrl}/api/sessions/s1/messages/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "continue" }),
    });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(text).toContain("event: message.start");
    expect(text).toContain("event: message.delta");
    expect(text).toContain("event: message.done");
    expect(text).toContain("\"delta\":\"re\"");
    expect(text).toContain("\"delta\":\"ply\"");
    expect(agent.seen.at(-1)).toMatchObject({
      method: "POST",
      pathname: "/chat/stream",
      body: {
        session_id: "s1",
        message: "continue",
        include_scheduled_notifications: false,
      },
    });
  });
});
