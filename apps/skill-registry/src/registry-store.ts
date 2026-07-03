import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, normalize } from "node:path";
import { packageDirectory, packageStoragePath, sha256Hex } from "./package-utils.js";
import { validateSkillPackage } from "./package-validator.js";
import type {
  CreatePublisherInput,
  PublishSkillInput,
  RegistryAuditEvent,
  RegistryIndex,
  RegistrySkillVersion,
  SkillManifest,
  SkillPackageInput,
  SkillPublisher,
  SkillRegistrySource,
  SkillValidationResult,
} from "./types.js";

type RegistryStoreOptions = {
  dbPath: string;
  packageRoot: string;
  seedRegistryUrl?: string;
};

type DatabaseSyncConstructor = typeof import("node:sqlite").DatabaseSync;
type DatabaseSyncInstance = InstanceType<DatabaseSyncConstructor>;
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: DatabaseSyncConstructor };

type SkillVersionRow = {
  skill_id: string;
  version: string;
  name: string;
  description: string;
  summary: string;
  category: string;
  provider: string;
  runtime: string;
  permissions_json: string;
  tags_json: string;
  entry: string;
  maturity: string;
  updated_at: string;
  publisher_id: string;
  publisher_name: string;
  publisher_verified: number;
  source: string;
  package_sha256: string;
  manifest_json: string;
  deprecated: number;
  rating: number | null;
  download_count: number;
};

type PublisherRow = {
  id: string;
  name: string;
  verified: number;
};

type AuditEventRow = {
  id: number;
  action: string;
  actor: string;
  subject: string;
  metadata_json: string;
  created_at: number;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function cleanString(value: unknown, fallback: string, limit = 200): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : fallback;
}

function cleanStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))]
    : [];
}

function cleanSource(value: unknown): SkillRegistrySource {
  return value === "official" || value === "verified" || value === "community" || value === "private" ? value : "community";
}

function cleanPublisher(value: unknown): SkillPublisher {
  const record = asObject(value);
  const id = cleanString(record.id, "unknown", 80);
  return {
    id,
    name: cleanString(record.name, id, 120),
    verified: record.verified === true,
  };
}

function publisherFromRow(row: PublisherRow): SkillPublisher {
  return { id: row.id, name: row.name, verified: row.verified === 1 };
}

function auditEventFromRow(row: AuditEventRow): RegistryAuditEvent {
  return {
    id: row.id,
    action: row.action,
    actor: row.actor,
    subject: row.subject,
    metadata: asObject(JSON.parse(row.metadata_json) as unknown),
    createdAt: row.created_at,
  };
}

function cleanRating(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(5, Math.max(0, value)) : null;
}

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function resolvePackageUrl(packageUrl: string, registryUrl: string): string {
  if (packageUrl.startsWith("http://") || packageUrl.startsWith("https://") || packageUrl.startsWith("/")) {
    return packageUrl;
  }
  if (registryUrl.startsWith("http://") || registryUrl.startsWith("https://")) {
    return new URL(packageUrl, registryUrl).toString();
  }
  return normalize(join(dirname(registryUrl), packageUrl));
}

function metadataFromPackage(skillPackage: SkillPackageInput): SkillManifest | null {
  const metadataFile = skillPackage.files.find((file) => file.path === "skill.json");
  if (!metadataFile) {
    return null;
  }
  const record = asObject(JSON.parse(metadataFile.content) as unknown);
  const id = cleanString(record.id, "", 80);
  const version = cleanString(record.version, "", 40);
  if (!id || !version) {
    return null;
  }
  return {
    id,
    name: cleanString(record.name, id, 120),
    description: cleanString(record.description, "", 1000),
    summary: cleanString(record.summary, "暂无简介", 240),
    category: cleanString(record.category, "未分类", 80),
    provider: cleanString(record.provider, "Registry", 120),
    version,
    runtime: cleanString(record.runtime, "Skill runtime", 120),
    permissions: cleanStringList(record.permissions),
    updatedAt: cleanString(record.updatedAt, "", 40),
    maturity: record.maturity === "beta" ? "beta" : "stable",
    tags: cleanStringList(record.tags),
    entry: cleanString(record.entry, "SKILL.md", 120),
  };
}

function registryItemFromRow(row: SkillVersionRow, baseUrl: string): RegistrySkillVersion {
  const manifest = JSON.parse(row.manifest_json) as SkillManifest;
  return {
    id: row.skill_id,
    version: row.version,
    packageUrl: `${baseUrl}/skills/${encodeURIComponent(row.skill_id)}/download?version=${encodeURIComponent(row.version)}`,
    packageSha256: row.package_sha256,
    source: row.source as SkillRegistrySource,
    publisher: {
      id: row.publisher_id,
      name: row.publisher_name,
      verified: row.publisher_verified === 1,
    },
    downloads: row.download_count,
    rating: row.rating,
    deprecated: row.deprecated === 1,
    metadata: {
      name: row.name,
      description: row.description,
      summary: row.summary,
      category: row.category,
      provider: row.provider,
      runtime: row.runtime,
      permissions: JSON.parse(row.permissions_json) as string[],
      updatedAt: manifest.updatedAt,
      maturity: row.maturity === "beta" ? "beta" : "stable",
      tags: JSON.parse(row.tags_json) as string[],
      entry: row.entry,
    },
  };
}

/** SQLite-backed registry store for Skill Marketplace metadata and packages. */
export class RegistryStore {
  private readonly db: DatabaseSyncInstance;
  private readonly packageRoot: string;

  constructor(private readonly options: RegistryStoreOptions) {
    mkdirSync(dirname(options.dbPath), { recursive: true });
    mkdirSync(options.packageRoot, { recursive: true });
    this.db = new DatabaseSync(options.dbPath);
    this.packageRoot = options.packageRoot;
    this.initializeSchema();
    if (options.seedRegistryUrl) {
      this.seedFromRegistry(options.seedRegistryUrl);
    }
  }

  close(): void {
    this.db.close();
  }

  health(): { ok: true; skills: number; versions: number } {
    const skills = this.db.prepare("SELECT COUNT(*) AS count FROM skills").get() as { count: number };
    const versions = this.db.prepare("SELECT COUNT(*) AS count FROM skill_versions").get() as { count: number };
    return { ok: true, skills: skills.count, versions: versions.count };
  }

  listSkills(baseUrl: string): RegistryIndex {
    const rows = this.db.prepare(this.skillVersionSelectSql()).all() as SkillVersionRow[];
    return { skills: rows.map((row) => registryItemFromRow(row, baseUrl)) };
  }

  listPublishers(): SkillPublisher[] {
    const rows = this.db.prepare("SELECT id, name, verified FROM publishers ORDER BY id ASC").all() as PublisherRow[];
    return rows.map(publisherFromRow);
  }

  createPublisher(input: CreatePublisherInput): { ok: true; publisher: SkillPublisher } | { ok: false; errors: string[] } {
    const publisher = cleanPublisher(input);
    const errors: string[] = [];
    if (!publisher.id || publisher.id === "unknown") {
      errors.push("publisher id is required");
    }
    if (!publisher.name || publisher.name === "unknown") {
      errors.push("publisher name is required");
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(publisher.id)) {
      errors.push("publisher id must be kebab-case");
    }
    if (errors.length > 0) {
      return { ok: false, errors };
    }
    this.db
      .prepare("INSERT OR REPLACE INTO publishers(id, name, verified) VALUES (?, ?, ?)")
      .run(publisher.id, publisher.name, publisher.verified ? 1 : 0);
    return { ok: true, publisher };
  }

  recordAuditEvent(action: string, actor: string, subject: string, metadata: Record<string, unknown> = {}): RegistryAuditEvent {
    const createdAt = Date.now();
    const result = this.db
      .prepare("INSERT INTO audit_events(action, actor, subject, metadata_json, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(action, actor, subject, JSON.stringify(metadata), createdAt);
    return {
      id: Number(result.lastInsertRowid),
      action,
      actor,
      subject,
      metadata,
      createdAt,
    };
  }

  listAuditEvents(limit = 100): RegistryAuditEvent[] {
    const boundedLimit = Math.min(500, Math.max(1, Math.floor(limit)));
    const rows = this.db
      .prepare("SELECT id, action, actor, subject, metadata_json, created_at FROM audit_events ORDER BY id DESC LIMIT ?")
      .all(boundedLimit) as AuditEventRow[];
    return rows.map(auditEventFromRow);
  }

  getSkill(skillId: string, baseUrl: string): RegistrySkillVersion | null {
    const row = this.db.prepare(`${this.skillVersionSelectSql()} WHERE sv.skill_id = ? ORDER BY sv.version DESC LIMIT 1`).get(skillId) as
      | SkillVersionRow
      | undefined;
    return row ? registryItemFromRow(row, baseUrl) : null;
  }

  listVersions(skillId: string, baseUrl: string): RegistrySkillVersion[] {
    const rows = this.db
      .prepare(`${this.skillVersionSelectSql()} WHERE sv.skill_id = ? ORDER BY sv.version DESC`)
      .all(skillId) as SkillVersionRow[];
    return rows.map((row) => registryItemFromRow(row, baseUrl));
  }

  downloadPackage(skillId: string, version?: string): string | null {
    const row = version
      ? (this.db.prepare("SELECT package_path FROM skill_versions WHERE skill_id = ? AND version = ?").get(skillId, version) as
          | { package_path: string }
          | undefined)
      : (this.db
          .prepare("SELECT package_path FROM skill_versions WHERE skill_id = ? ORDER BY version DESC LIMIT 1")
          .get(skillId) as { package_path: string } | undefined);
    if (!row) {
      return null;
    }
    const now = Date.now();
    this.db
      .prepare("UPDATE skill_versions SET download_count = download_count + 1, updated_at = ? WHERE package_path = ?")
      .run(now, row.package_path);
    this.db.prepare("INSERT INTO download_events(skill_id, version, created_at) VALUES (?, ?, ?)").run(skillId, version ?? "", now);
    return readFileSync(row.package_path, "utf8");
  }

  publishPackage(input: PublishSkillInput, baseUrl: string): SkillValidationResult | { ok: true; skill: RegistrySkillVersion } {
    const validated = validateSkillPackage(input.package);
    if (!validated.ok) {
      return validated;
    }
    const packageRaw = JSON.stringify({
      ...(validated.skillPackageVersion ? { skillPackageVersion: validated.skillPackageVersion } : {}),
      files: validated.files,
    });
    const source = cleanSource(input.source ?? "private");
    const publisher = cleanPublisher(input.publisher ?? { id: "local-user", name: "Local User", verified: false });
    this.upsertPackage({
      manifest: validated.manifest,
      packageRaw,
      source,
      publisher,
      packageSha256: sha256Hex(packageRaw),
      deprecated: input.deprecated === true,
      rating: cleanRating(input.rating),
      downloads: 0,
    });
    const skill = this.getSkill(validated.manifest.id, baseUrl);
    if (!skill) {
      return { ok: false, errors: ["published skill was not found after storing"] };
    }
    return { ok: true, skill };
  }

  seedFromRegistry(registryUrl: string): void {
    if (!existsSync(registryUrl)) {
      return;
    }
    const registry = asObject(readJsonFile(registryUrl));
    const skills = Array.isArray(registry.skills) ? registry.skills : [];
    for (const rawEntry of skills) {
      const entry = asObject(rawEntry);
      const skillId = cleanString(entry.id, "", 80);
      const version = cleanString(entry.version, "", 40);
      const packageUrl = cleanString(entry.packageUrl, "", 1000);
      if (!skillId || !version || !packageUrl) {
        continue;
      }
      const packagePath = resolvePackageUrl(packageUrl, registryUrl);
      if (!existsSync(packagePath)) {
        continue;
      }
      const packageRaw = readFileSync(packagePath, "utf8");
      const skillPackage = JSON.parse(packageRaw) as SkillPackageInput;
      const packageManifest = metadataFromPackage(skillPackage);
      if (!packageManifest) {
        continue;
      }
      const metadata = asObject(entry.metadata);
      const manifest: SkillManifest = {
        ...packageManifest,
        name: cleanString(metadata.name, packageManifest.name),
        description: cleanString(metadata.description, packageManifest.description),
        summary: cleanString(metadata.summary, packageManifest.summary),
        category: cleanString(metadata.category, packageManifest.category),
        provider: cleanString(metadata.provider, packageManifest.provider),
        runtime: cleanString(metadata.runtime, packageManifest.runtime),
        permissions: cleanStringList(metadata.permissions).length ? cleanStringList(metadata.permissions) : packageManifest.permissions,
        updatedAt: cleanString(metadata.updatedAt, packageManifest.updatedAt),
        maturity: metadata.maturity === "beta" ? "beta" : packageManifest.maturity,
        tags: cleanStringList(metadata.tags).length ? cleanStringList(metadata.tags) : packageManifest.tags,
        entry: cleanString(metadata.entry, packageManifest.entry),
      };
      this.upsertPackage({
        manifest,
        packageRaw,
        source: cleanSource(entry.source),
        publisher: cleanPublisher(entry.publisher),
        packageSha256: cleanString(entry.packageSha256, sha256Hex(packageRaw), 128),
        deprecated: entry.deprecated === true,
        rating: cleanRating(entry.rating),
        downloads: typeof entry.downloads === "number" && Number.isFinite(entry.downloads) ? Math.max(0, Math.floor(entry.downloads)) : 0,
      });
    }
  }

  private upsertPackage(input: {
    manifest: SkillManifest;
    packageRaw: string;
    source: SkillRegistrySource;
    publisher: SkillPublisher;
    packageSha256: string;
    deprecated: boolean;
    rating: number | null;
    downloads: number;
  }): void {
    const packagePath = packageStoragePath(this.packageRoot, input.manifest.id, input.manifest.version);
    mkdirSync(packageDirectory(this.packageRoot, input.manifest.id, input.manifest.version), { recursive: true });
    writeFileSync(packagePath, input.packageRaw, "utf8");
    this.db.prepare("INSERT OR REPLACE INTO publishers(id, name, verified) VALUES (?, ?, ?)").run(
      input.publisher.id,
      input.publisher.name,
      input.publisher.verified ? 1 : 0,
    );
    this.db
      .prepare(
        [
          "INSERT OR REPLACE INTO skills(",
          "id, name, description, summary, category, provider, runtime, permissions_json, tags_json, entry, maturity, created_at, updated_at",
          ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM skills WHERE id = ?), ?), ?)",
        ].join(""),
      )
      .run(
        input.manifest.id,
        input.manifest.name,
        input.manifest.description,
        input.manifest.summary,
        input.manifest.category,
        input.manifest.provider,
        input.manifest.runtime,
        JSON.stringify(input.manifest.permissions),
        JSON.stringify(input.manifest.tags),
        input.manifest.entry,
        input.manifest.maturity,
        input.manifest.id,
        Date.now(),
        Date.now(),
      );
    this.db
      .prepare(
        [
          "INSERT OR REPLACE INTO skill_versions(",
          "skill_id, version, publisher_id, source, package_sha256, deprecated, rating, download_count, package_path, manifest_json, created_at, updated_at",
          ") VALUES (?, ?, ?, ?, ?, ?, ?, MAX(COALESCE((SELECT download_count FROM skill_versions WHERE skill_id = ? AND version = ?), 0), ?), ?, ?, COALESCE((SELECT created_at FROM skill_versions WHERE skill_id = ? AND version = ?), ?), ?)",
        ].join(""),
      )
      .run(
        input.manifest.id,
        input.manifest.version,
        input.publisher.id,
        input.source,
        input.packageSha256,
        input.deprecated ? 1 : 0,
        input.rating,
        input.manifest.id,
        input.manifest.version,
        input.downloads,
        packagePath,
        JSON.stringify(input.manifest),
        input.manifest.id,
        input.manifest.version,
        Date.now(),
        Date.now(),
      );
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS publishers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        summary TEXT NOT NULL,
        category TEXT NOT NULL,
        provider TEXT NOT NULL,
        runtime TEXT NOT NULL,
        permissions_json TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        entry TEXT NOT NULL,
        maturity TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS skill_versions (
        skill_id TEXT NOT NULL,
        version TEXT NOT NULL,
        publisher_id TEXT NOT NULL,
        source TEXT NOT NULL,
        package_sha256 TEXT NOT NULL,
        deprecated INTEGER NOT NULL DEFAULT 0,
        rating REAL,
        download_count INTEGER NOT NULL DEFAULT 0,
        package_path TEXT NOT NULL,
        manifest_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(skill_id, version),
        FOREIGN KEY(skill_id) REFERENCES skills(id),
        FOREIGN KEY(publisher_id) REFERENCES publishers(id)
      );
      CREATE TABLE IF NOT EXISTS download_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_id TEXT NOT NULL,
        version TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        actor TEXT NOT NULL,
        subject TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  private skillVersionSelectSql(): string {
    return [
      "SELECT s.id AS skill_id, sv.version, s.name, s.description, s.summary, s.category, s.provider, s.runtime,",
      "s.permissions_json, s.tags_json, s.entry, s.maturity, s.updated_at,",
      "p.id AS publisher_id, p.name AS publisher_name, p.verified AS publisher_verified,",
      "sv.source, sv.package_sha256, sv.manifest_json, sv.deprecated, sv.rating, sv.download_count",
      "FROM skill_versions sv",
      "JOIN skills s ON s.id = sv.skill_id",
      "JOIN publishers p ON p.id = sv.publisher_id",
    ].join(" ");
  }
}
