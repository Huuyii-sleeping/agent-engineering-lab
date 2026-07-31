import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { copyFile, mkdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { SopStorageError } from "./sops.errors.js";
import type { SopStorageHealth } from "./sops.types.js";

export type SopDatabaseOptions = {
  sopDataRoot?: string;
  sopDatabasePath?: string;
};

const latestMigrationVersion = 6;

function readPragmaValue(row: unknown, key: string): string {
  if (!row || typeof row !== "object") return "";
  return String((row as Record<string, unknown>)[key] ?? "");
}

/** SQLite 连接、WAL、迁移、完整性检查和备份恢复边界。 */
@Injectable()
export class SopDatabase implements OnModuleDestroy {
  readonly databasePath: string;
  readonly backupRoot: string;
  private connection: Database.Database;

  constructor(options: SopDatabaseOptions = {}) {
    const dataRoot = options.sopDataRoot ?? join(process.cwd(), ".data", "sops");
    this.databasePath = options.sopDatabasePath ?? join(dataRoot, "workflows.sqlite");
    this.backupRoot = join(dataRoot, "backups");
    this.connection = this.open();
  }

  /** 返回已完成迁移且通过完整性检查的连接。 */
  get database(): Database.Database {
    return this.connection;
  }

  /** 返回 SQLite 健康信息。 */
  health(): SopStorageHealth {
    const journalRows = this.connection.pragma("journal_mode", { simple: false }) as Array<Record<string, unknown>>;
    const journalMode = readPragmaValue(journalRows[0], "journal_mode");
    const migration = this.connection.prepare("select coalesce(max(version), 0) as version from schema_migrations").get() as { version: number };
    return {
      ok: true,
      journalMode,
      databasePath: this.databasePath,
      migrationVersion: migration.version,
    };
  }

  /** 使用 SQLite 在线备份创建一致快照。 */
  async backup(label = "manual"): Promise<string> {
    if (this.databasePath === ":memory:") throw new SopStorageError("内存数据库不支持备份。 ");
    await mkdir(this.backupRoot, { recursive: true });
    const safeLabel = label.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40) || "manual";
    const fileName = `${Date.now()}-${safeLabel}.sqlite`;
    const destination = join(this.backupRoot, fileName);
    await this.connection.backup(destination);
    return fileName;
  }

  /** 只允许从受控备份目录恢复，并使用临时文件原子替换数据库。 */
  async restore(fileName: string): Promise<void> {
    if (this.databasePath === ":memory:") throw new SopStorageError("内存数据库不支持恢复。 ");
    if (!fileName || basename(fileName) !== fileName) throw new SopStorageError("备份文件名无效。 ");
    const source = join(this.backupRoot, fileName);
    const temporary = `${this.databasePath}.restore-tmp`;
    await copyFile(source, temporary).catch((error: unknown) => {
      throw new SopStorageError("无法读取指定的 SOP 备份文件。", { fileName, cause: String(error) });
    });
    this.connection.close();
    try {
      await rm(`${this.databasePath}-wal`, { force: true });
      await rm(`${this.databasePath}-shm`, { force: true });
      await rename(temporary, this.databasePath);
      this.connection = this.open();
    } catch (error) {
      await rm(temporary, { force: true });
      throw new SopStorageError("SOP 数据库恢复失败。", { fileName, cause: String(error) });
    }
  }

  onModuleDestroy(): void {
    if (this.connection.open) this.connection.close();
  }

  private open(): Database.Database {
    try {
      if (this.databasePath !== ":memory:") mkdirSync(dirname(this.databasePath), { recursive: true });
      const database = new Database(this.databasePath);
      database.pragma("foreign_keys = ON");
      database.pragma("busy_timeout = 5000");
      database.pragma("synchronous = NORMAL");
      database.pragma("journal_mode = WAL");
      this.assertIntegrity(database);
      this.migrate(database);
      return database;
    } catch (error) {
      if (error instanceof SopStorageError) throw error;
      throw new SopStorageError("无法打开 SOP SQLite 数据库；请检查文件权限或从备份恢复。", {
        databasePath: this.databasePath,
        cause: String(error),
      });
    }
  }

  private assertIntegrity(database: Database.Database): void {
    const result = database.pragma("integrity_check") as Array<Record<string, unknown>>;
    const message = String(result[0]?.integrity_check ?? "unknown");
    if (message !== "ok") {
      database.close();
      throw new SopStorageError(`SOP SQLite 完整性检查失败：${message}。请从最近备份恢复。`, {
        databasePath: this.databasePath,
      });
    }
  }

  private migrate(database: Database.Database): void {
    database.exec(`
      create table if not exists schema_migrations (
        version integer primary key,
        applied_at integer not null
      );
    `);
    const current = database.prepare("select coalesce(max(version), 0) as version from schema_migrations").get() as { version: number };
    if (current.version < 1) {
      database.transaction(() => {
        database.exec(`
          create table sop_drafts (
            id text primary key,
            revision integer not null,
            schema_version integer not null,
            name text not null,
            summary text not null,
            content_json text not null,
            created_at integer not null,
            updated_at integer not null
          );
          create index sop_drafts_updated_at on sop_drafts(updated_at desc);

          create table sop_versions (
            id text primary key,
            workflow_id text not null,
            version integer not null,
            schema_version integer not null,
            content_hash text not null,
            created_by text not null,
            release_notes text not null,
            content_json text not null,
            created_at integer not null,
            unique(workflow_id, version)
          );
          create index sop_versions_workflow on sop_versions(workflow_id, version desc);

          create table sop_templates (
            id text not null,
            version integer not null,
            name text not null,
            summary text not null,
            source_workflow_id text not null,
            source_version_id text not null,
            parameter_schema_json text not null,
            content_json text not null,
            created_at integer not null,
            updated_at integer not null,
            primary key(id, version)
          );
          create index sop_templates_updated_at on sop_templates(updated_at desc);
        `);
        database.prepare("insert into schema_migrations(version, applied_at) values (?, ?)").run(1, Date.now());
      })();
    }
    if (current.version < 2) {
      database.transaction(() => {
        database.exec(`
          create table workflow_runs (
            id text primary key,
            workflow_id text not null,
            version_id text,
            content_hash text,
            mode text not null,
            status text not null,
            input_json text not null,
            output_json text,
            error_json text,
            created_at integer not null,
            started_at integer,
            finished_at integer
          );
          create index workflow_runs_workflow_created on workflow_runs(workflow_id, created_at desc);
          create index workflow_runs_status_created on workflow_runs(status, created_at desc);

          create table workflow_node_runs (
            run_id text not null,
            node_id text not null,
            status text not null,
            attempt integer not null,
            input_json text,
            output_json text,
            error_json text,
            started_at integer,
            finished_at integer,
            duration_ms integer,
            primary key(run_id, node_id),
            foreign key(run_id) references workflow_runs(id) on delete cascade
          );
          create index workflow_node_runs_status on workflow_node_runs(run_id, status);

          create table workflow_events (
            run_id text not null,
            event_id integer not null,
            type text not null,
            event_json text not null,
            created_at integer not null,
            primary key(run_id, event_id),
            foreign key(run_id) references workflow_runs(id) on delete cascade
          );
          create index workflow_events_created on workflow_events(run_id, created_at);
        `);
        database.prepare("insert into schema_migrations(version, applied_at) values (?, ?)").run(2, Date.now());
      })();
    }
    if (current.version < 3) {
      database.transaction(() => {
        database.exec(`
          create table agent_versions (
            id text primary key,
            agent_profile_id text not null,
            version integer not null,
            content_hash text not null,
            name text not null,
            description text not null,
            snapshot_json text not null,
            created_by text not null,
            release_notes text not null,
            created_at integer not null,
            unique(agent_profile_id, version)
          );
          create index agent_versions_profile on agent_versions(agent_profile_id, version desc);
          create index agent_versions_created on agent_versions(created_at desc);

          create trigger agent_versions_immutable_update
          before update on agent_versions
          begin
            select raise(abort, 'agent_versions is immutable');
          end;

          create trigger agent_versions_immutable_delete
          before delete on agent_versions
          begin
            select raise(abort, 'agent_versions is immutable');
          end;
        `);
        database.prepare("insert into schema_migrations(version, applied_at) values (?, ?)").run(3, Date.now());
      })();
    }
    if (current.version < 4) {
      database.transaction(() => {
        database.prepare("insert into schema_migrations(version, applied_at) values (?, ?)").run(4, Date.now());
      })();
    }
    if (current.version < 5) {
      database.transaction(() => {
        database.exec(`
          alter table workflow_runs add column node_instances_json text;
          alter table workflow_runs add column child_runs_json text;
          alter table workflow_runs add column waiting_json text;
        `);
        database.prepare("insert into schema_migrations(version, applied_at) values (?, ?)").run(5, Date.now());
      })();
    }
    if (current.version < 6) {
      database.transaction(() => {
        database.exec("drop table if exists approval_requests;");
        database.prepare("insert into schema_migrations(version, applied_at) values (?, ?)").run(6, Date.now());
      })();
    }
    const after = database.prepare("select coalesce(max(version), 0) as version from schema_migrations").get() as { version: number };
    if (after.version !== latestMigrationVersion) throw new SopStorageError(`不支持的 SOP 数据库迁移版本：${after.version}。`);
  }
}
