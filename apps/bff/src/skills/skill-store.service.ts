import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve } from "node:path";
import type {
  RemoteSkillIndexItem,
  RemoteSkillRegistry,
  SkillRegistrySource,
  SkillPackageFile,
  SkillPackageInput,
  SkillPublisher,
  SkillSourceType,
  ValidatedSkillPackage,
} from "./skill-types.js";
import { SkillValidatorService } from "./skill-validator.service.js";

export type SkillStoreOptions = {
  skillsRoot?: string;
  skillDataRoot?: string;
  remoteRegistryUrl?: string;
  registryServiceUrl?: string;
};

export type StoredSkillPackage = ValidatedSkillPackage & {
  sourceType: SkillSourceType;
};

function defaultSkillsRoot(): string {
  const cwdRoot = join(process.cwd(), "skills");
  return existsSync(cwdRoot) ? cwdRoot : join(process.cwd(), "..", "..", "skills");
}

function defaultSkillDataRoot(): string {
  return join(process.cwd(), ".data", "skills");
}

function defaultRemoteRegistryUrl(): string {
  const cwdRegistry = join(process.cwd(), "registries", "default-skill-registry.json");
  return existsSync(cwdRegistry)
    ? cwdRegistry
    : join(process.cwd(), "..", "..", "registries", "default-skill-registry.json");
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function cleanString(value: unknown, fallback: string, limit = 120): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : fallback;
}

function cleanNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function cleanRegistrySource(value: unknown): SkillRegistrySource {
  return value === "official" || value === "verified" || value === "community" || value === "private"
    ? value
    : "community";
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

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safePackagePath(root: string, file: SkillPackageFile): string {
  const target = resolve(root, file.path);
  const resolvedRoot = resolve(root);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}/`)) {
    throw new Error(`unsafe package path: ${file.path}`);
  }
  return target;
}

/** Reads and writes skill packages across builtin, downloaded remote, and custom stores. */
@Injectable()
export class SkillStoreService {
  private readonly skillsRoot: string;
  private readonly skillDataRoot: string;
  private readonly remoteRegistryUrl: string;
  private readonly registryServiceUrl?: string;

  constructor(
    private readonly validator: SkillValidatorService,
    options: SkillStoreOptions = {},
  ) {
    this.skillsRoot = options.skillsRoot ?? defaultSkillsRoot();
    this.skillDataRoot = options.skillDataRoot ?? defaultSkillDataRoot();
    this.registryServiceUrl = options.registryServiceUrl?.replace(/\/+$/, "");
    this.remoteRegistryUrl = options.remoteRegistryUrl ?? (this.registryServiceUrl ? `${this.registryServiceUrl}/skills` : defaultRemoteRegistryUrl());
  }

  /** Lists bundled skill packages from the repository skills directory. */
  async listBuiltinPackages(): Promise<StoredSkillPackage[]> {
    return this.readSkillDirectories(this.skillsRoot, "builtin");
  }

  /** Lists previously downloaded remote skill packages. */
  async listDownloadedPackages(): Promise<StoredSkillPackage[]> {
    return this.readVersionedPackages(join(this.skillDataRoot, "remote"), "remote");
  }

  /** Lists uploaded custom skill packages. */
  async listCustomPackages(): Promise<StoredSkillPackage[]> {
    return this.readVersionedPackages(join(this.skillDataRoot, "custom"), "custom");
  }

  /** Reads the configured remote registry index. */
  async readRemoteRegistry(remoteRegistryUrl = this.remoteRegistryUrl): Promise<RemoteSkillRegistry> {
    try {
      const raw = await this.readText(remoteRegistryUrl);
      const parsed = asObject(JSON.parse(raw) as unknown);
      const skills = Array.isArray(parsed.skills) ? parsed.skills : [];
      return {
        skills: skills
          .map((item) => this.normalizeRemoteIndexItem(item))
          .filter((item): item is RemoteSkillIndexItem => Boolean(item)),
      };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return { skills: [] };
      }
      throw error;
    }
  }

  /** Reads a remote package JSON referenced by a registry index entry. */
  async readRemotePackage(entry: RemoteSkillIndexItem, remoteRegistryUrl = this.remoteRegistryUrl): Promise<SkillPackageInput> {
    const packageUrl = this.resolvePackageUrl(entry.packageUrl, remoteRegistryUrl);
    const raw = await this.readText(packageUrl, this.shouldPostPackageDownload(packageUrl) ? "POST" : "GET");
    const actualSha256 = sha256Hex(raw);
    if (entry.packageSha256 && entry.packageSha256 !== actualSha256) {
      throw new Error(`skill package hash mismatch for ${entry.id}: expected ${entry.packageSha256}, got ${actualSha256}`);
    }
    const parsed = asObject(JSON.parse(raw) as unknown);
    return { files: Array.isArray(parsed.files) ? (parsed.files as SkillPackageFile[]) : [] };
  }

  /** Returns the built-in default remote registry URL for local development. */
  getDefaultRemoteRegistryUrl(): string {
    return this.remoteRegistryUrl;
  }

  /** Publishes a custom package to the standalone registry service when configured. */
  async publishPackageToRegistry(input: SkillPackageInput): Promise<RemoteSkillIndexItem | null> {
    if (!this.registryServiceUrl) {
      return null;
    }
    const response = await fetch(`${this.registryServiceUrl}/admin/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        package: input,
        source: "private",
        publisher: { id: "local-user", name: "Local User", verified: false },
      }),
    });
    const raw = await response.text();
    const parsed = raw.trim() ? asObject(JSON.parse(raw) as unknown) : {};
    if (!response.ok || parsed.ok === false) {
      const error = asObject(parsed.error);
      throw new Error(typeof error.message === "string" ? error.message : `failed to publish skill package: ${response.status}`);
    }
    return this.normalizeRemoteIndexItem(parsed.skill);
  }

  /** Writes a validated package to the local downloaded/custom store. */
  async writePackage(sourceType: "remote" | "custom", skillPackage: ValidatedSkillPackage): Promise<void> {
    const packageRoot = join(this.skillDataRoot, sourceType, skillPackage.manifest.id, skillPackage.manifest.version);
    await mkdir(packageRoot, { recursive: true });
    for (const file of skillPackage.files) {
      const target = safePackagePath(packageRoot, file);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content, "utf8");
    }
  }

  private async readSkillDirectories(root: string, sourceType: SkillSourceType): Promise<StoredSkillPackage[]> {
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
    const packages = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => this.readPackageAt(join(root, entry.name), sourceType)),
    );
    return packages.filter((item): item is StoredSkillPackage => Boolean(item));
  }

  private async readVersionedPackages(root: string, sourceType: "remote" | "custom"): Promise<StoredSkillPackage[]> {
    let skillEntries;
    try {
      skillEntries = await readdir(root, { withFileTypes: true });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
    const packages: StoredSkillPackage[] = [];
    for (const skillEntry of skillEntries.filter((entry) => entry.isDirectory())) {
      const skillRoot = join(root, skillEntry.name);
      const versionEntries = await readdir(skillRoot, { withFileTypes: true });
      for (const versionEntry of versionEntries.filter((entry) => entry.isDirectory())) {
        const skillPackage = await this.readPackageAt(join(skillRoot, versionEntry.name), sourceType);
        if (skillPackage) {
          packages.push(skillPackage);
        }
      }
    }
    return packages;
  }

  private async readPackageAt(root: string, sourceType: SkillSourceType): Promise<StoredSkillPackage | null> {
    try {
      const [skillFile, metadataFile] = await Promise.all([
        readFile(join(root, "SKILL.md"), "utf8"),
        readFile(join(root, "skill.json"), "utf8"),
      ]);
      const validated = this.validator.validatePackage(this.validator.packageFromRequiredFiles(skillFile, metadataFile));
      return validated.ok ? { ...validated.package, sourceType } : null;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  private async readText(location: string, method = "GET"): Promise<string> {
    if (isHttpUrl(location)) {
      const response = await fetch(location, { method });
      if (!response.ok) {
        throw new Error(`failed to fetch ${location}: ${response.status}`);
      }
      return response.text();
    }
    return readFile(location, "utf8");
  }

  private resolvePackageUrl(packageUrl: string, remoteRegistryUrl: string): string {
    if (isHttpUrl(packageUrl) || packageUrl.startsWith("/")) {
      return packageUrl;
    }
    if (isHttpUrl(remoteRegistryUrl)) {
      return new URL(packageUrl, remoteRegistryUrl).toString();
    }
    return normalize(join(dirname(remoteRegistryUrl), packageUrl));
  }

  private shouldPostPackageDownload(packageUrl: string): boolean {
    if (!this.registryServiceUrl || !packageUrl.startsWith(this.registryServiceUrl)) {
      return false;
    }
    try {
      return new URL(packageUrl).pathname.endsWith("/download");
    } catch {
      return false;
    }
  }

  private normalizeRemoteIndexItem(value: unknown): RemoteSkillIndexItem | null {
    const record = asObject(value);
    if (typeof record.id !== "string" || typeof record.version !== "string" || typeof record.packageUrl !== "string") {
      return null;
    }
    const rating = cleanNumber(record.rating, Number.NaN);
    return {
      id: record.id.trim(),
      version: record.version.trim(),
      packageUrl: record.packageUrl.trim(),
      packageSha256: cleanString(record.packageSha256, "", 128),
      source: cleanRegistrySource(record.source),
      publisher: cleanPublisher(record.publisher),
      downloads: Math.max(0, Math.floor(cleanNumber(record.downloads, 0))),
      rating: Number.isFinite(rating) ? Math.min(5, Math.max(0, rating)) : null,
      deprecated: record.deprecated === true,
      metadata: asObject(record.metadata),
    };
  }
}
