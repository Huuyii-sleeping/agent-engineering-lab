import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SopDatabase } from "../../../src/sops/sop-database.js";
import { SopRevisionConflictError } from "../../../src/sops/sops.errors.js";
import { SqliteSopsRepository } from "../../../src/sops/sqlite-sops.repository.js";
import { createTestDraft } from "./test-fixtures.js";

const roots: string[] = [];

async function setup() {
  const dataRoot = await mkdtemp(join(tmpdir(), "orbit-sops-repository-"));
  roots.push(dataRoot);
  const database = new SopDatabase({ sopDataRoot: dataRoot });
  return { database, repository: new SqliteSopsRepository(database) };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true })));
});

describe("SqliteSopsRepository", () => {
  it("使用 revision 条件更新并拒绝过期写入", async () => {
    const { database, repository } = await setup();
    try {
      const created = repository.createDraft(createTestDraft());
      const saved = repository.updateDraft(created.id, 0, { ...created, name: "revision 1" });
      expect(saved.revision).toBe(1);
      expect(() => repository.updateDraft(created.id, 0, created)).toThrow(SopRevisionConflictError);
    } finally {
      database.onModuleDestroy();
    }
  });

  it("发布追加不可变版本并保持历史快照不受草稿修改影响", async () => {
    const { database, repository } = await setup();
    try {
      const draft = repository.createDraft(createTestDraft());
      const version = repository.publishVersion({
        schemaVersion: draft.schemaVersion,
        workflowId: draft.id,
        contentHash: "hash-1",
        createdAt: Date.now(),
        createdBy: "tester",
        nodes: draft.nodes,
        edges: draft.edges,
        metadata: { name: draft.name },
      });
      repository.updateDraft(draft.id, 0, { ...draft, name: "新草稿名称" });
      expect(repository.getVersion(draft.id, version.id)?.metadata).toMatchObject({ name: "测试工作流" });
      expect(repository.listVersions(draft.id)).toHaveLength(1);
    } finally {
      database.onModuleDestroy();
    }
  });

  it("发布事务失败时不留下半成品版本", async () => {
    const { database, repository } = await setup();
    try {
      const draft = repository.createDraft(createTestDraft("atomic-publish"));
      const cyclic: Record<string, unknown> = {};
      cyclic.self = cyclic;
      expect(() => repository.publishVersion({
        schemaVersion: draft.schemaVersion,
        workflowId: draft.id,
        contentHash: "hash-atomic",
        createdAt: Date.now(),
        createdBy: "tester",
        nodes: draft.nodes,
        edges: draft.edges,
        metadata: cyclic,
      })).toThrow(/circular|cyclic/i);
      expect(repository.listVersions(draft.id)).toEqual([]);
    } finally {
      database.onModuleDestroy();
    }
  });

  it("模板更新创建新版本而不是覆盖旧版本", async () => {
    const { database, repository } = await setup();
    try {
      const draft = createTestDraft();
      const base = {
        id: "template-1",
        version: 0,
        name: "模板",
        summary: "v1",
        sourceWorkflowId: draft.id,
        sourceVersionId: "version-1",
        parameterSchema: {},
        draft,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      expect(repository.createTemplate(base).version).toBe(1);
      expect(repository.createTemplate({ ...base, summary: "v2" }).version).toBe(2);
      expect(repository.getTemplate(base.id, 1)?.summary).toBe("v1");
      expect(repository.getTemplate(base.id)?.summary).toBe("v2");
    } finally {
      database.onModuleDestroy();
    }
  });
});
