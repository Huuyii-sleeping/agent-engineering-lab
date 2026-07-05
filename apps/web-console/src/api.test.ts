import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAgentProfile,
  createSession,
  createAgentEventStream,
  deleteAgentProfile,
  downloadSkill,
  fetchAgents,
  fetchHealth,
  fetchProfile,
  fetchSkillHubReadiness,
  fetchSkillAuditEvents,
  fetchSkillRegistrySettings,
  fetchSkills,
  fetchSession,
  fetchSessions,
  installSkill,
  rollbackSkill,
  resolveAgentSkills,
  sendSessionMessage,
  sendSessionMessageStream,
  syncSkillRegistry,
  uninstallSkill,
  updateSkill,
  uploadSkillPackage,
  updateAgentProfile,
  updateProfile,
} from "./api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("web-console api client", () => {
  it("opens the BFF SSE endpoint and parses known agent events", () => {
    const listeners = new Map<string, (event: MessageEvent<string>) => void>();
    class FakeEventSource {
      onopen: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor(readonly url: string) {}

      addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
        listeners.set(type, listener);
      }

      close = vi.fn();
    }

    const onOpen = vi.fn();
    const onError = vi.fn();
    const onEvent = vi.fn();
    const stream = createAgentEventStream({
      eventSourceCtor: FakeEventSource,
      onOpen,
      onError,
      onEvent,
    });
    const source = stream as FakeEventSource;

    expect(source.url).toBe("/api/events/stream?since_id=-1");
    source.onopen?.(new Event("open"));
    source.onerror?.(new Event("error"));
    listeners.get("chat.completed")?.(
      new MessageEvent("chat.completed", {
        data: JSON.stringify({ id: 3, payload: { session_id: "s1" } }),
        lastEventId: "3",
      }),
    );
    stream.close();

    expect(onOpen).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledWith({
      type: "chat.completed",
      id: "3",
      data: { id: 3, payload: { session_id: "s1" } },
    });
    expect(source.close).toHaveBeenCalledOnce();
  });

  it("calls BFF health, session, and message endpoints", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input), "http://localhost");
      const method = init?.method ?? "GET";

      if (method === "GET" && url.pathname === "/api/health") {
        return jsonResponse({ ok: true, bff: { status: "ok" }, agent: { ok: true } });
      }
      if (method === "GET" && url.pathname === "/api/sessions") {
        return jsonResponse({ ok: true, sessions: [{ id: "s1", busy: false, messageCount: 1 }] });
      }
      if (method === "POST" && url.pathname === "/api/sessions") {
        return jsonResponse({ ok: true, session: { id: "s2", busy: false, messageCount: 0 } }, 201);
      }
      if (method === "GET" && url.pathname === "/api/sessions/s1") {
        return jsonResponse({
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
      }
      if (method === "POST" && url.pathname === "/api/sessions/s1/messages") {
        return jsonResponse({
          ok: true,
          assistant: "reply",
          session: { id: "s1", busy: false, messageCount: 3 },
        });
      }

      return jsonResponse({ ok: false, error: { code: "NOT_FOUND", message: url.pathname } }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const runtimeAgent = {
      id: "a1",
      name: "研发 Agent",
      skills: [{ skillId: "code-workspace", version: "1.2.0", sourceType: "builtin" as const, registrySource: "local" as const }],
    };

    await expect(fetchHealth()).resolves.toMatchObject({ ok: true, connected: true });
    await expect(fetchSessions()).resolves.toMatchObject([{ id: "s1", messageCount: 1 }]);
    await expect(createSession(runtimeAgent)).resolves.toMatchObject({ id: "s2" });
    await expect(fetchSession("s1")).resolves.toMatchObject({
      id: "s1",
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "world" },
      ],
    });
    await expect(sendSessionMessage("s1", "continue", runtimeAgent)).resolves.toMatchObject({
      ok: true,
      assistant: "reply",
    });

    expect(fetchMock).toHaveBeenLastCalledWith("/api/sessions/s1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "continue", agent: runtimeAgent }),
    });
  });

  it("normalizes BFF errors into thrown Error objects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        jsonResponse(
          { ok: false, error: { code: "AGENT_UPSTREAM_UNAVAILABLE", message: "agent down" } },
          502,
        ),
      ),
    );

    await expect(fetchSessions()).rejects.toThrow("agent down");
  });

  it("calls BFF profile business endpoints", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input), "http://localhost");
      const method = init?.method ?? "GET";

      if (method === "GET" && url.pathname === "/api/profile") {
        return jsonResponse({ ok: true, profile: { displayName: " 花忆 ", description: " 控制台用户 " } });
      }
      if (method === "PUT" && url.pathname === "/api/profile") {
        return jsonResponse({ ok: true, profile: { displayName: "控制台用户", description: "BFF 已接入" } });
      }

      return jsonResponse({ ok: false, error: { code: "NOT_FOUND", message: url.pathname } }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchProfile()).resolves.toEqual({ displayName: "花忆", description: "控制台用户" });
    await expect(updateProfile({ displayName: "控制台用户", description: "BFF 已接入" })).resolves.toEqual({
      displayName: "控制台用户",
      description: "BFF 已接入",
    });
    expect(fetchMock).toHaveBeenLastCalledWith("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "控制台用户", description: "BFF 已接入" }),
    });
  });

  it("calls BFF agent profile CRUD endpoints", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input), "http://localhost");
      const method = init?.method ?? "GET";

      if (method === "GET" && url.pathname === "/api/agents") {
        return jsonResponse({
          ok: true,
          agents: [
            {
              id: "a1",
              avatarId: "code",
              name: "  研发 Agent  ",
              description: "  本地研发  ",
              scenario: "  代码和验证  ",
              skillIds: ["code-workspace", "code-workspace", "quality-gate"],
              skills: [
                { skillId: "code-workspace", version: "1.2.0", sourceType: "builtin", registrySource: "local" },
                { skillId: "code-workspace", version: "1.3.0", sourceType: "remote", registrySource: "verified" },
                { skillId: "quality-gate", version: "0.9.0", sourceType: "builtin", registrySource: "local" },
              ],
              actions: [" 修改代码 ", " 运行测试 "],
              systemPrompt: " 严格验证 ",
              createdAt: 1,
              updatedAt: 2,
            },
          ],
        });
      }
      if (method === "POST" && url.pathname === "/api/agents") {
        return jsonResponse({ ok: true, agent: { id: "a2", ...(JSON.parse(String(init?.body)) as Record<string, unknown>) } }, 201);
      }
      if (method === "PUT" && url.pathname === "/api/agents/a1") {
        return jsonResponse({ ok: true, agent: { id: "a1", ...(JSON.parse(String(init?.body)) as Record<string, unknown>) } });
      }
      if (method === "DELETE" && url.pathname === "/api/agents/a1") {
        return jsonResponse({ ok: true });
      }

      return jsonResponse({ ok: false, error: { code: "NOT_FOUND", message: url.pathname } }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAgents()).resolves.toMatchObject([
      {
        id: "a1",
        avatarId: "code",
        name: "研发 Agent",
        description: "本地研发",
        scenario: "代码和验证",
        skillIds: ["code-workspace", "quality-gate"],
        skills: [
          { skillId: "code-workspace", version: "1.3.0", sourceType: "remote", registrySource: "verified" },
          { skillId: "quality-gate", version: "0.9.0", sourceType: "builtin", registrySource: "local" },
        ],
        actions: ["修改代码", "运行测试"],
        systemPrompt: "严格验证",
      },
    ]);
    await expect(createAgentProfile({ name: " 新 Agent ", actions: [" 分析 "] })).resolves.toMatchObject({
      id: "a2",
      avatarId: "brain",
      name: "新 Agent",
      actions: ["分析"],
    });
    await expect(
      updateAgentProfile("a1", {
        name: "交付 Agent",
        avatarId: "compass",
        description: "交付验证",
        scenario: "上线前检查",
        skillIds: ["quality-gate"],
        skills: [{ skillId: "quality-gate", version: "1.2.0", sourceType: "builtin", registrySource: "local" }],
        actions: ["构建"],
        systemPrompt: "输出风险",
      }),
    ).resolves.toMatchObject({ id: "a1", avatarId: "compass", name: "交付 Agent" });
    await expect(deleteAgentProfile("a1")).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenLastCalledWith("/api/agents/a1", { method: "DELETE" });
  });

  it("checks agent runtime skill bindings through the BFF preflight API", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input), "http://localhost");
      const method = init?.method ?? "GET";

      if (method === "POST" && url.pathname === "/api/agent-skills/resolve") {
        const body = JSON.parse(String(init?.body)) as { agent?: unknown };
        return jsonResponse({
          ok: true,
          agent: body.agent,
          skills: [{ name: "remote-review", sourceType: "remote", path: "/skills/remote-review/SKILL.md", contentLength: 120 }],
        });
      }

      return jsonResponse({ ok: false, error: { code: "NOT_FOUND", message: url.pathname } }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const runtimeAgent = {
      id: "a1",
      name: "研发 Agent",
      skills: [{ skillId: "remote-review", version: "1.2.0", sourceType: "remote" as const, registrySource: "official" as const }],
    };

    await expect(resolveAgentSkills(runtimeAgent)).resolves.toMatchObject({
      ok: true,
      agent: { id: "a1" },
      skills: [{ name: "remote-review", sourceType: "remote", contentLength: 120 }],
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/agent-skills/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: runtimeAgent }),
    });
  });

  it("normalizes failed agent runtime skill preflight details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        jsonResponse(
          {
            ok: false,
            error: {
              code: "AGENT_SKILL_LOAD_FAILED",
              message: "agent skill binding could not be loaded",
              details: [
                {
                  skillId: "missing-skill",
                  version: "1.0.0",
                  sourceType: "remote",
                  code: "SKILL_PACKAGE_NOT_FOUND",
                  message: "skill package not found",
                },
              ],
            },
          },
          400,
        ),
      ),
    );

    await expect(
      resolveAgentSkills({
        id: "a1",
        name: "研发 Agent",
        skills: [{ skillId: "missing-skill", version: "1.0.0", sourceType: "remote", registrySource: "official" }],
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "AGENT_SKILL_LOAD_FAILED",
      issues: [{ skillId: "missing-skill", code: "SKILL_PACKAGE_NOT_FOUND" }],
    });
  });

  it("calls BFF skill registry APIs", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input), "http://localhost");
      const method = init?.method ?? "GET";

      if (method === "GET" && url.pathname === "/api/skills") {
        return jsonResponse({
          ok: true,
          skills: [
            {
              id: "code-workspace",
              name: "  代码工作区  ",
              summary: "  读取仓库  ",
              category: "执行",
              provider: "Workspace",
              version: "1.2.0",
              runtime: "Local workspace",
              permissions: [" 文件读写 ", "命令执行"],
              updatedAt: "2026-06-18",
              maturity: "stable",
              tags: [" code ", "test"],
              entry: "SKILL.md",
              sourceType: "builtin",
              registrySource: "official",
              publisher: { id: "workspace", name: "Workspace", verified: true },
              downloads: 12345,
              rating: 4.9,
              packageSha256: "abc123",
              deprecated: false,
              status: "installed",
              validationErrors: [],
              installed: true,
              installedVersion: "1.2.0",
              installedAt: 1782691200000,
              availableVersion: "1.2.0",
              previousInstalledVersion: "",
            },
          ],
        });
      }
      if (method === "GET" && url.pathname === "/api/skills/audit") {
        return jsonResponse({
          ok: true,
          events: [
            {
              id: "audit-1",
              action: "update",
              ok: false,
              code: "SKILL_UPDATE_NOT_AVAILABLE",
              message: "skill has no installable update",
              skillId: "quality-gate",
              skillName: "质量闸门",
              version: "1.0.0",
              status: "installed",
              at: 1782691300000,
            },
          ],
        });
      }
      if (method === "GET" && url.pathname === "/api/skills/registry") {
        return jsonResponse({
          ok: true,
          registry: {
            url: "  https://registry.example.com/index.json  ",
            managedByService: false,
            lastSyncedAt: 1782147600000,
            lastSyncError: "",
            skillCount: 4,
          },
        });
      }
      if (method === "GET" && url.pathname === "/api/skills/readiness") {
        return jsonResponse({
          ok: true,
          readiness: {
            status: "degraded",
            registry: {
              url: "https://registry.example.com/index.json",
              managedByService: false,
              lastSyncedAt: 1782147600000,
              lastSyncError: "remote timeout",
              skillCount: 4,
            },
            store: { readable: true, message: "" },
            counts: { total: 4, installed: 2, updateAvailable: 1, invalid: 1, failedAudit: 3 },
          },
        });
      }
      if (method === "POST" && url.pathname === "/api/skills/registry/sync") {
        return jsonResponse({
          ok: true,
          registry: {
            url: "https://registry.example.com/next.json",
            managedByService: false,
            lastSyncedAt: 1782147900000,
            lastSyncError: "",
            skillCount: 6,
          },
        });
      }
      if (method === "POST" && url.pathname === "/api/skills/quality-gate/install") {
        return jsonResponse({ ok: true, skill: { id: "quality-gate", name: "质量闸门", status: "installed", installed: true } });
      }
      if (method === "POST" && url.pathname === "/api/skills/quality-gate/update") {
        return jsonResponse({
          ok: true,
          skill: {
            id: "quality-gate",
            name: "质量闸门",
            status: "installed",
            installed: true,
            installedVersion: "1.0.0",
            previousInstalledVersion: "0.9.0",
          },
        });
      }
      if (method === "POST" && url.pathname === "/api/skills/quality-gate/rollback") {
        return jsonResponse({
          ok: true,
          skill: {
            id: "quality-gate",
            name: "质量闸门",
            status: "updateAvailable",
            installed: true,
            installedVersion: "0.9.0",
            previousInstalledVersion: "1.0.0",
          },
        });
      }
      if (method === "POST" && url.pathname === "/api/skills/quality-gate/uninstall") {
        return jsonResponse({ ok: true, skill: { id: "quality-gate", name: "质量闸门", status: "downloaded", installed: false } });
      }
      if (method === "POST" && url.pathname === "/api/skills/remote-prd-review/download") {
        return jsonResponse({ ok: true, skill: { id: "remote-prd-review", name: "远端 PRD 评审", sourceType: "remote", status: "downloaded" } });
      }
      if (method === "POST" && url.pathname === "/api/skills/upload") {
        return jsonResponse({ ok: true, skill: { id: "custom-review", name: "自定义评审", sourceType: "custom", status: "downloaded" } }, 201);
      }

      return jsonResponse({ ok: false, error: { code: "NOT_FOUND", message: url.pathname } }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSkills()).resolves.toMatchObject([
      {
        id: "code-workspace",
        name: "代码工作区",
        summary: "读取仓库",
        permissions: ["文件读写", "命令执行"],
        tags: ["code", "test"],
        sourceType: "builtin",
        registrySource: "official",
        publisher: { id: "workspace", name: "Workspace", verified: true },
        downloads: 12345,
        rating: 4.9,
        packageSha256: "abc123",
        deprecated: false,
        status: "installed",
        installed: true,
        installedVersion: "1.2.0",
        availableVersion: "1.2.0",
      },
    ]);
    await expect(fetchSkillAuditEvents()).resolves.toMatchObject([
      {
        id: "audit-1",
        action: "update",
        ok: false,
        code: "SKILL_UPDATE_NOT_AVAILABLE",
        message: "skill has no installable update",
        skillId: "quality-gate",
        version: "1.0.0",
        status: "installed",
      },
    ]);
    await expect(fetchSkillRegistrySettings()).resolves.toEqual({
      url: "https://registry.example.com/index.json",
      managedByService: false,
      lastSyncedAt: 1782147600000,
      lastSyncError: "",
      skillCount: 4,
    });
    await expect(syncSkillRegistry()).resolves.toMatchObject({
      lastSyncedAt: 1782147900000,
      skillCount: 6,
    });
    await expect(fetchSkillHubReadiness()).resolves.toMatchObject({
      status: "degraded",
      registry: { lastSyncError: "remote timeout" },
      store: { readable: true },
      counts: { installed: 2, updateAvailable: 1, invalid: 1, failedAudit: 3 },
    });
    await expect(downloadSkill("remote-prd-review")).resolves.toMatchObject({
      id: "remote-prd-review",
      sourceType: "remote",
      status: "downloaded",
    });
    await expect(installSkill("quality-gate")).resolves.toMatchObject({ id: "quality-gate", installed: true });
    await expect(updateSkill("quality-gate")).resolves.toMatchObject({ id: "quality-gate", installedVersion: "1.0.0" });
    await expect(rollbackSkill("quality-gate")).resolves.toMatchObject({ id: "quality-gate", installedVersion: "0.9.0" });
    await expect(uninstallSkill("quality-gate")).resolves.toMatchObject({ id: "quality-gate", installed: false });
    await expect(uploadSkillPackage({ files: [] })).resolves.toMatchObject({
      id: "custom-review",
      sourceType: "custom",
      status: "downloaded",
    });
    expect(fetchMock).toHaveBeenLastCalledWith("/api/skills/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: [] }),
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/skills/registry/sync", { method: "POST" });
  });


  it("parses message-level SSE events from streamed sends", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(
        [
          "event: message.start\n",
          "data: {\"session_id\":\"s1\"}\n\n",
          "event: message.delta\n",
          "data: {\"delta\":\"hel\"}\n\n",
          "event: message.delta\n",
          "data: {\"delta\":\"lo\"}\n\n",
          "event: message.done\n",
          "data: {\"ok\":true,\"assistant\":\"hello\",\"session\":{\"id\":\"s1\",\"messageCount\":2}}\n\n",
        ].join(""),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const events: string[] = [];
    const runtimeAgent = {
      id: "a1",
      name: "研发 Agent",
      skills: [{ skillId: "code-workspace", version: "1.2.0", sourceType: "builtin" as const, registrySource: "local" as const }],
    };

    await sendSessionMessageStream("s1", "continue", (event) => {
      if (event.type === "message.delta") {
        events.push(event.data.delta ?? "");
      }
      if (event.type === "message.done") {
        events.push(event.data.assistant ?? "");
      }
    }, runtimeAgent);

    expect(events).toEqual(["hel", "lo", "hello"]);
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/s1/messages/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ message: "continue", agent: runtimeAgent }),
    });
  });
});
