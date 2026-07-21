import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBffHttpServer } from "../../src/server.js";
import { createTestDraft } from "../unit/sops/test-fixtures.js";

const servers: Server[] = [];
const roots: string[] = [];

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not bind");
  return `http://127.0.0.1:${address.port}`;
}

async function startBff(): Promise<string> {
  const dataRoot = await mkdtemp(join(tmpdir(), "orbit-sops-api-"));
  roots.push(dataRoot);
  const registryPath = join(dataRoot, "registry.json");
  await writeFile(registryPath, JSON.stringify({ skills: [] }), "utf8");
  await mkdir(join(dataRoot, "skills"), { recursive: true });
  const agent = createServer((_req, res) => {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  });
  const agentBaseUrl = await listen(agent);
  return listen(await createBffHttpServer({
    agentBaseUrl,
    filePath: join(dataRoot, "business.json"),
    skillDataRoot: join(dataRoot, "skill-data"),
    skillsRoot: join(dataRoot, "skills"),
    remoteRegistryUrl: registryPath,
    registryServiceUrl: "",
    sopDataRoot: join(dataRoot, "sops"),
  }));
}

async function request(baseUrl: string, path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, init);
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("SOP API smoke", () => {
  it("完成草稿、并发、发布、diff、模板和备份生命周期", async () => {
    const baseUrl = await startBff();
    const draft = createTestDraft("api-workflow");

    const created = await request(baseUrl, "/api/sops", json("POST", { draft }));
    expect(created.status).toBe(201);

    const legacyPreview = await request(baseUrl, "/api/sops/import/preview", json("POST", {
      draft: {
        id: "legacy-api-workflow",
        name: "旧版 API 流程",
        summary: "v1 import",
        updatedAt: Date.now(),
        nodes: [
          { id: "legacy-start", type: "start", label: "开始", position: { x: 0, y: 0 } },
          { id: "legacy-end", type: "end", label: "结束", position: { x: 0, y: 160 } },
        ],
        edges: [{ id: "legacy-edge", source: "legacy-start", target: "legacy-end" }],
      },
    }));
    expect(legacyPreview.status).toBe(200);
    expect(legacyPreview.body.data).toMatchObject({ migrated: true, draft: { schemaVersion: 2 } });

    const imported = await request(baseUrl, "/api/sops/import", json("POST", {
      draft: (legacyPreview.body.data as { draft: unknown }).draft,
    }));
    expect(imported.status).toBe(201);
    const importedId = (imported.body.data as { id: string }).id;
    const exported = await request(baseUrl, `/api/sops/${importedId}/export`);
    expect(exported.status).toBe(200);
    expect(exported.body.data).toMatchObject({ id: importedId, schemaVersion: 2 });

    const saved = await request(baseUrl, `/api/sops/${draft.id}/autosave`, json("POST", {
      expectedRevision: 0,
      draft: { ...draft, name: "自动保存版本" },
    }));
    expect(saved.status).toBe(200);
    expect((saved.body.data as { revision: number }).revision).toBe(1);

    const conflict = await request(baseUrl, `/api/sops/${draft.id}`, json("PUT", { expectedRevision: 0, draft }));
    expect(conflict.status).toBe(409);
    expect((conflict.body.error as { code: string }).code).toBe("SOP_REVISION_CONFLICT");

    const publish1 = await request(baseUrl, `/api/sops/${draft.id}/publish`, json("POST", { expectedRevision: 1, releaseNotes: "v1" }));
    expect(publish1.status).toBe(201);
    const version1 = publish1.body.data as { id: string };

    const saved2 = await request(baseUrl, `/api/sops/${draft.id}`, json("PUT", {
      expectedRevision: 1,
      draft: { ...(saved.body.data as object), name: "第二版" },
    }));
    expect(saved2.status).toBe(200);
    const publish2 = await request(baseUrl, `/api/sops/${draft.id}/publish`, json("POST", { expectedRevision: 2, releaseNotes: "v2" }));
    const version2 = publish2.body.data as { id: string };

    const diff = await request(baseUrl, `/api/sops/${draft.id}/versions/${version1.id}/diff?to=${encodeURIComponent(version2.id)}`);
    expect(diff.status).toBe(200);
    expect((diff.body.data as { fields: { nameChanged: boolean } }).fields.nameChanged).toBe(true);

    const restored = await request(baseUrl, `/api/sops/${draft.id}/versions/${version1.id}/drafts`, { method: "POST" });
    expect(restored.status).toBe(201);
    expect((restored.body.data as { id: string }).id).not.toBe(draft.id);

    const template = await request(baseUrl, "/api/sop-templates", json("POST", {
      name: "API 模板",
      sourceVersionId: version1.id,
      parameterSchema: { type: "object" },
    }));
    expect(template.status).toBe(201);
    const templateData = template.body.data as { id: string };
    const fromTemplate = await request(baseUrl, `/api/sop-templates/${templateData.id}/drafts`, json("POST", { parameters: { owner: "Orbit" } }));
    expect(fromTemplate.status).toBe(201);

    const backup = await request(baseUrl, "/api/sops/storage/backup", json("POST", { label: "smoke" }));
    expect(backup.status).toBe(201);
    expect((backup.body.data as { fileName: string }).fileName).toMatch(/smoke\.sqlite$/);
  });
});
