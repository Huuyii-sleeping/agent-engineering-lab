import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SopDatabase } from "../../../src/sops/sop-database.js";
import { SqliteSopsRepository } from "../../../src/sops/sqlite-sops.repository.js";
import { createTestDraft } from "./test-fixtures.js";

const roots: string[] = [];

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "orbit-sops-db-"));
  roots.push(value);
  return value;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true })));
});

describe("SopDatabase", () => {
  it("启用 WAL 并创建显式迁移表和阶段 C 基础表", async () => {
    const database = new SopDatabase({ sopDataRoot: await root() });
    try {
      expect(database.health()).toMatchObject({ ok: true, journalMode: "wal", migrationVersion: 1 });
      const tables = database.database.prepare("select name from sqlite_master where type = 'table' order by name").all() as Array<{ name: string }>;
      expect(tables.map((item) => item.name)).toEqual(expect.arrayContaining(["schema_migrations", "sop_drafts", "sop_versions", "sop_templates"]));
    } finally {
      database.onModuleDestroy();
    }
  });

  it("在线备份和恢复保持草稿事务一致性", async () => {
    const database = new SopDatabase({ sopDataRoot: await root() });
    const repository = new SqliteSopsRepository(database);
    try {
      const created = repository.createDraft(createTestDraft());
      const fileName = await database.backup("test");
      repository.updateDraft(created.id, 0, { ...created, name: "已修改" });
      expect(repository.getDraft(created.id)?.name).toBe("已修改");
      await database.restore(fileName);
      expect(repository.getDraft(created.id)?.name).toBe("测试工作流");
      expect(repository.getDraft(created.id)?.revision).toBe(0);
    } finally {
      database.onModuleDestroy();
    }
  });

  it("损坏数据库给出可读的恢复提示", async () => {
    const dataRoot = await root();
    await writeFile(join(dataRoot, "workflows.sqlite"), "not-a-sqlite-database", "utf8");
    expect(() => new SopDatabase({ sopDataRoot: dataRoot })).toThrow(/无法打开 SOP SQLite 数据库|完整性检查失败/);
  });

  it("关闭并重新打开数据库后仍保留草稿", async () => {
    const dataRoot = await root();
    const first = new SopDatabase({ sopDataRoot: dataRoot });
    const created = new SqliteSopsRepository(first).createDraft(createTestDraft("restart-workflow"));
    first.onModuleDestroy();

    const reopened = new SopDatabase({ sopDataRoot: dataRoot });
    try {
      expect(new SqliteSopsRepository(reopened).getDraft(created.id)).toMatchObject({
        id: created.id,
        name: created.name,
        revision: 0,
      });
    } finally {
      reopened.onModuleDestroy();
    }
  });
});
