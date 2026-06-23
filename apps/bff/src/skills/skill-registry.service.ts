import { Injectable } from "@nestjs/common";
import { LocalStoreService } from "../local-store.service.js";
import type {
  RemoteRegistrySettings,
  RemoteRegistryState,
  RemoteSkillIndexItem,
  RemoteSkillRegistry,
  SkillManifest,
  SkillPackageInput,
  SkillPublisher,
  SkillRegistrySource,
  SkillRegistryItem,
  SkillSourceType,
  SkillStatus,
} from "./skill-types.js";
import { SkillInstallerService } from "./skill-installer.service.js";
import { SkillStoreService, type StoredSkillPackage, type SkillStoreOptions } from "./skill-store.service.js";

export type SkillRegistryOptions = SkillStoreOptions;

const remoteRegistryStoreKey = "skillRemoteRegistry";
const localPublisher: SkillPublisher = {
  id: "local-workspace",
  name: "Local Workspace",
  verified: true,
};

function compareVersion(left: string, right: string): number {
  const leftParts = left.split(".").map((part) => Number(part) || 0);
  const rightParts = right.split(".").map((part) => Number(part) || 0);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function remoteManifest(entry: RemoteSkillIndexItem): SkillManifest {
  return {
    id: entry.id,
    name: entry.metadata.name ?? entry.id,
    description: entry.metadata.description ?? "",
    summary: entry.metadata.summary ?? entry.metadata.description ?? "远端 Skill 包",
    category: entry.metadata.category ?? "远端",
    provider: entry.metadata.provider ?? "Remote Registry",
    version: entry.version,
    runtime: entry.metadata.runtime ?? "Skill runtime",
    permissions: entry.metadata.permissions ?? [],
    updatedAt: entry.metadata.updatedAt ?? "",
    maturity: entry.metadata.maturity ?? "stable",
    tags: entry.metadata.tags ?? [],
    entry: entry.metadata.entry ?? "SKILL.md",
  };
}

function registryItemFromPackage(
  skillPackage: StoredSkillPackage,
  installedIds: Set<string>,
  status: SkillStatus,
  validationErrors: string[] = [],
): SkillRegistryItem {
  return {
    ...skillPackage.manifest,
    sourceType: skillPackage.sourceType,
    registrySource: "local",
    publisher: localPublisher,
    downloads: 0,
    rating: null,
    packageSha256: "",
    deprecated: false,
    status: installedIds.has(skillPackage.manifest.id) ? "installed" : status,
    installed: installedIds.has(skillPackage.manifest.id),
    validationErrors,
  };
}

function registryItemFromRemote(entry: RemoteSkillIndexItem, status: SkillStatus): SkillRegistryItem {
  return {
    ...remoteManifest(entry),
    sourceType: "remote",
    registrySource: entry.source,
    publisher: entry.publisher,
    downloads: entry.downloads,
    rating: entry.rating,
    packageSha256: entry.packageSha256,
    deprecated: entry.deprecated,
    status,
    installed: false,
    validationErrors: [],
  };
}

function applyRemoteRegistryMetadata(local: SkillRegistryItem, entry: RemoteSkillIndexItem): void {
  local.registrySource = entry.source;
  local.publisher = entry.publisher;
  local.downloads = entry.downloads;
  local.rating = entry.rating;
  local.packageSha256 = entry.packageSha256;
  local.deprecated = entry.deprecated;
}

function remoteRegistrySettings(state: RemoteRegistryState): RemoteRegistrySettings {
  return {
    url: state.url,
    lastSyncedAt: state.lastSyncedAt,
    lastSyncError: state.lastSyncError,
    skillCount: state.cachedRegistry.skills.length || state.skillCount,
  };
}

function normalizeRemoteRegistryState(value: unknown, fallbackUrl: string): RemoteRegistryState {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const cached = record.cachedRegistry && typeof record.cachedRegistry === "object" && !Array.isArray(record.cachedRegistry)
    ? (record.cachedRegistry as Partial<RemoteSkillRegistry>)
    : {};
  const skills = Array.isArray(cached.skills)
    ? cached.skills
        .filter((item): item is RemoteSkillIndexItem => Boolean(item))
        .map((item) => ({
          ...item,
          packageSha256: item.packageSha256 ?? "",
          source: normalizeRegistrySource(item.source),
          publisher: normalizePublisher(item.publisher),
          downloads: normalizeDownloads(item.downloads),
          rating: normalizeRating(item.rating),
          deprecated: item.deprecated === true,
        }))
    : [];
  return {
    url: typeof record.url === "string" && record.url.trim() ? record.url.trim() : fallbackUrl,
    lastSyncedAt: typeof record.lastSyncedAt === "number" && Number.isFinite(record.lastSyncedAt) ? record.lastSyncedAt : null,
    lastSyncError: typeof record.lastSyncError === "string" ? record.lastSyncError : "",
    skillCount: typeof record.skillCount === "number" && Number.isFinite(record.skillCount) ? record.skillCount : skills.length,
    cachedRegistry: { skills },
  };
}

function normalizeRegistrySource(value: unknown): SkillRegistrySource {
  return value === "official" || value === "verified" || value === "community" || value === "private" || value === "local"
    ? value
    : "community";
}

function normalizePublisher(value: unknown): SkillPublisher {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : "unknown";
  return {
    id,
    name: typeof record.name === "string" && record.name.trim() ? record.name.trim() : id,
    verified: record.verified === true,
  };
}

function normalizeDownloads(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function normalizeRating(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(5, Math.max(0, value)) : null;
}

/** Aggregates builtin, remote, custom, and lifecycle state for Skill Hub. */
@Injectable()
export class SkillRegistryService {
  constructor(
    private readonly localStore: LocalStoreService,
    private readonly skillStore: SkillStoreService,
    private readonly installer: SkillInstallerService,
  ) {}

  /** Reads the current remote registry settings without exposing cached payloads. */
  async getRemoteRegistrySettings(): Promise<RemoteRegistrySettings> {
    return remoteRegistrySettings(await this.readRemoteRegistryState());
  }

  /** Saves a remote registry URL and resets the cached index until the next sync. */
  async updateRemoteRegistryUrl(url: string): Promise<RemoteRegistrySettings> {
    const trimmed = url.trim();
    const nextState: RemoteRegistryState = {
      url: trimmed || this.skillStore.getDefaultRemoteRegistryUrl(),
      lastSyncedAt: null,
      lastSyncError: "",
      skillCount: 0,
      cachedRegistry: { skills: [] },
    };
    await this.writeRemoteRegistryState(nextState);
    return remoteRegistrySettings(nextState);
  }

  /** Fetches the configured remote registry and stores the latest index cache. */
  async syncRemoteRegistry(): Promise<RemoteRegistrySettings> {
    const state = await this.readRemoteRegistryState();
    try {
      const registry = await this.skillStore.readRemoteRegistry(state.url);
      const nextState: RemoteRegistryState = {
        url: state.url,
        lastSyncedAt: Date.now(),
        lastSyncError: "",
        skillCount: registry.skills.length,
        cachedRegistry: registry,
      };
      await this.writeRemoteRegistryState(nextState);
      return remoteRegistrySettings(nextState);
    } catch (error) {
      const nextState: RemoteRegistryState = {
        ...state,
        lastSyncError: error instanceof Error ? error.message : String(error),
      };
      await this.writeRemoteRegistryState(nextState);
      throw error;
    }
  }

  /** Lists all known skills with source and lifecycle state. */
  async listSkills(): Promise<SkillRegistryItem[]> {
    const remoteRegistryState = await this.readRemoteRegistryState();
    const [builtin, downloaded, custom, remoteRegistry, state] = await Promise.all([
      this.skillStore.listBuiltinPackages(),
      this.skillStore.listDownloadedPackages(),
      this.skillStore.listCustomPackages(),
      this.resolveRemoteRegistry(remoteRegistryState),
      this.installer.readState(),
    ]);
    const installedIds = new Set(state.installedSkillIds);
    const localItems = [...builtin, ...downloaded, ...custom].map((skillPackage) =>
      registryItemFromPackage(
        skillPackage,
        installedIds,
        state.downloadedSkillIds.includes(skillPackage.manifest.id) || skillPackage.sourceType !== "remote"
          ? "downloaded"
          : "available",
      ),
    );
    const localById = new Map(localItems.map((item) => [item.id, item]));
    const remoteItems = remoteRegistry.skills
      .filter((entry) => !localById.has(entry.id))
      .map((entry) => registryItemFromRemote(entry, "available"));

    for (const entry of remoteRegistry.skills) {
      const local = localById.get(entry.id);
      if (!local || local.sourceType !== "remote") {
        continue;
      }
      applyRemoteRegistryMetadata(local, entry);
      if (compareVersion(entry.version, local.version) > 0 && local.status === "installed") {
        local.status = "updateAvailable";
      }
    }

    return [...localItems, ...remoteItems].sort((left, right) => {
      const sourceOrder: Record<SkillSourceType, number> = { builtin: 0, remote: 1, custom: 2 };
      return sourceOrder[left.sourceType] - sourceOrder[right.sourceType] || left.id.localeCompare(right.id);
    });
  }

  /** Downloads a remote skill package and returns its registry item. */
  async downloadSkill(skillId: string): Promise<SkillRegistryItem | null> {
    const remoteRegistryState = await this.readRemoteRegistryState();
    const registry = await this.resolveRemoteRegistry(remoteRegistryState);
    const result = await this.installer.downloadSkill(skillId, registry, remoteRegistryState.url);
    if (!result.ok) {
      return null;
    }
    return this.findSkill(skillId);
  }

  /** Stores a custom package and returns its registry item. */
  async uploadCustomSkill(input: SkillPackageInput): Promise<SkillRegistryItem | { errors: string[] }> {
    const result = await this.installer.uploadCustomSkill(input);
    if (!result.ok) {
      return { errors: result.errors };
    }
    if ("publishedToRegistry" in result) {
      await this.syncRemoteRegistry();
    }
    const skill = await this.findSkill(result.skillPackage.manifest.id);
    return skill ?? { errors: ["uploaded skill was not found after storing"] };
  }

  /** Marks a downloaded, builtin, or custom skill as installed. */
  async installSkill(skillId: string): Promise<SkillRegistryItem | null> {
    const localSkills = (await this.listSkills()).filter((skill) => skill.status !== "available");
    const installed = await this.installer.installSkill(skillId, localSkills);
    return installed ? this.findSkill(skillId) : null;
  }

  /** Marks one skill as uninstalled. */
  async uninstallSkill(skillId: string): Promise<SkillRegistryItem | null> {
    await this.installer.uninstallSkill(skillId);
    return this.findSkill(skillId);
  }

  private async findSkill(skillId: string): Promise<SkillRegistryItem | null> {
    return (await this.listSkills()).find((skill) => skill.id === skillId) ?? null;
  }

  private async readRemoteRegistryState(): Promise<RemoteRegistryState> {
    const fallbackUrl = this.skillStore.getDefaultRemoteRegistryUrl();
    return normalizeRemoteRegistryState(await this.localStore.readSection(remoteRegistryStoreKey, {}), fallbackUrl);
  }

  private async writeRemoteRegistryState(state: RemoteRegistryState): Promise<RemoteRegistryState> {
    return this.localStore.writeSection(remoteRegistryStoreKey, state);
  }

  private async resolveRemoteRegistry(state: RemoteRegistryState): Promise<RemoteSkillRegistry> {
    if (state.cachedRegistry.skills.length > 0 || state.lastSyncedAt !== null) {
      return state.cachedRegistry;
    }
    try {
      return await this.skillStore.readRemoteRegistry(state.url);
    } catch {
      return { skills: [] };
    }
  }
}
