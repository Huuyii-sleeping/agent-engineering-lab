import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SopDatabase } from "../../../src/sops/sop-database.js";
import { SopRevisionConflictError, SopValidationError } from "../../../src/sops/sops.errors.js";
import { SopsService } from "../../../src/sops/sops.service.js";
import { SqliteSopsRepository } from "../../../src/sops/sqlite-sops.repository.js";
import { createTestDraft } from "./test-fixtures.js";

const roots: string[] = [];

async function setup() {
  const dataRoot = await mkdtemp(join(tmpdir(), "orbit-sops-service-"));
  roots.push(dataRoot);
  const database = new SopDatabase({ sopDataRoot: dataRoot });
  const repository = new SqliteSopsRepository(database);
  return { database, service: new SopsService(repository, database) };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true })));
});

describe("SopsService", () => {
  it("自动保存使用 expectedRevision 并返回最新冲突草稿", async () => {
    const { database, service } = await setup();
    try {
      const created = service.createDraft(createTestDraft());
      const saved = service.saveDraft(created.id, { expectedRevision: 0, draft: { ...created, name: "自动保存" } });
      expect(saved.revision).toBe(1);
      expect(() => service.saveDraft(created.id, { expectedRevision: 0, draft: created })).toThrow(SopRevisionConflictError);
    } finally {
      database.onModuleDestroy();
    }
  });

  it("发布执行静态预检、生成 hash 并追加不可变版本", async () => {
    const { database, service } = await setup();
    try {
      const created = service.createDraft(createTestDraft());
      const version = await service.publish(created.id, { expectedRevision: 0, createdBy: "tester", releaseNotes: "v1" });
      expect(version.version).toBe(1);
      expect(version.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(service.listVersions(created.id)).toHaveLength(1);
      service.saveDraft(created.id, { expectedRevision: 0, draft: { ...created, name: "草稿已变化" } });
      expect(service.getVersion(created.id, version.id).metadata).toMatchObject({ name: "测试工作流", sourceRevision: 0 });

      const invalid = service.createDraft({ ...createTestDraft("invalid"), edges: [] });
      await expect(service.publish(invalid.id, { expectedRevision: 0 })).rejects.toBeInstanceOf(SopValidationError);
    } finally {
      database.onModuleDestroy();
    }
  });

  it("比较版本并从历史版本创建独立新草稿", async () => {
    const { database, service } = await setup();
    try {
      const created = service.createDraft(createTestDraft());
      const v1 = await service.publish(created.id, { expectedRevision: 0 });
      const saved = service.saveDraft(created.id, { expectedRevision: 0, draft: { ...created, name: "第二版" } });
      const v2 = await service.publish(created.id, { expectedRevision: saved.revision });
      expect(service.diffVersions(created.id, v1.id, v2.id).fields.nameChanged).toBe(true);
      const restored = service.createDraftFromVersion(created.id, v1.id);
      expect(restored.id).not.toBe(created.id);
      expect(restored.metadata).toMatchObject({ sourceWorkflowId: created.id, sourceVersionId: v1.id });
    } finally {
      database.onModuleDestroy();
    }
  });

  it("预检 v1 导入并从发布版本创建版本化模板", async () => {
    const { database, service } = await setup();
    try {
      const preview = service.previewImport({
        id: "legacy",
        name: "旧流程",
        summary: "v1",
        updatedAt: Date.now(),
        nodes: [
          { id: "start", type: "start", label: "开始", position: { x: 0, y: 0 } },
          { id: "end", type: "end", label: "结束", position: { x: 0, y: 160 } },
        ],
        edges: [{ id: "edge", source: "start", target: "end" }],
      });
      expect(preview.migrated).toBe(true);
      expect(preview.draft.schemaVersion).toBe(2);

      const created = service.createDraft(createTestDraft());
      const version = await service.publish(created.id, { expectedRevision: 0 });
      const templateV1 = service.saveTemplate({ name: "评审模板", sourceVersionId: version.id, parameterSchema: { type: "object" } });
      const templateV2 = service.saveTemplate({ id: templateV1.id, name: "评审模板 2", sourceVersionId: version.id });
      expect(templateV2.version).toBe(2);
      const fromTemplate = service.createDraftFromTemplate(templateV1.id, 1, { owner: "Orbit" });
      expect(fromTemplate.metadata).toMatchObject({ template: { id: templateV1.id, version: 1, parameters: { owner: "Orbit" } } });
    } finally {
      database.onModuleDestroy();
    }
  });

  it("导入导出时无损保留未知节点并阻止其发布", async () => {
    const { database, service } = await setup();
    try {
      const draft = createTestDraft("unknown-node-workflow");
      const unknownNode = {
        kind: "unknown" as const,
        id: "custom-node",
        type: "vendor.custom",
        version: 7,
        label: "供应商节点",
        position: { x: 240, y: 80 },
        ports: { inputs: [], outputs: [] },
        original: { plugin: "vendor", config: { prompt: "保持原样", enabled: true } },
      };
      const preview = service.previewImport({ ...draft, nodes: [...draft.nodes, unknownNode] });
      expect(preview.publishable).toBe(false);
      expect(preview.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "node.unsupported", location: { kind: "node", nodeId: unknownNode.id } }),
      ]));

      const imported = service.importDraft(preview.draft);
      expect(service.exportDraft(imported.id).nodes).toContainEqual(unknownNode);
      await expect(service.publish(imported.id, { expectedRevision: 0 })).rejects.toBeInstanceOf(SopValidationError);
    } finally {
      database.onModuleDestroy();
    }
  });
});
