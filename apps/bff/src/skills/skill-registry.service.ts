import { Injectable } from "@nestjs/common";
import { LocalStoreService } from "../local-store.service.js";
import type {
  RemoteRegistrySettings,
  RemoteRegistryState,
  RemoteSkillIndexItem,
  RemoteSkillRegistry,
  SkillInstallationRecord,
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
  installedById: Map<string, SkillInstallationRecord>,
  previousById: Map<string, SkillInstallationRecord>,
  status: SkillStatus,
  validationErrors: string[] = [],
): SkillRegistryItem {
  const installedRecord = installedById.get(skillPackage.manifest.id);
  const previousRecord = previousById.get(skillPackage.manifest.id);
  const installed = Boolean(installedRecord && (!installedRecord.version || installedRecord.version === skillPackage.manifest.version));
  return {
    ...skillPackage.manifest,
    sourceType: skillPackage.sourceType,
    registrySource: "local",
    publisher: localPublisher,
    downloads: 0,
    rating: null,
    packageSha256: "",
    deprecated: false,
    status: installed ? "installed" : status,
    installed,
    installedVersion: installedRecord?.version || (installed ? skillPackage.manifest.version : ""),
    installedAt: installedRecord?.installedAt || null,
    availableVersion: skillPackage.manifest.version,
    previousInstalledVersion: previousRecord?.version ?? "",
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
    installedVersion: "",
    installedAt: null,
    availableVersion: entry.version,
    previousInstalledVersion: "",
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
  local.availableVersion = entry.version;
}

function latestPackage(packages: StoredSkillPackage[]): StoredSkillPackage {
  return [...packages].sort((left, right) => compareVersion(right.manifest.version, left.manifest.version))[0] as StoredSkillPackage;
}

function visibleLocalPackages(packages: StoredSkillPackage[], installedById: Map<string, SkillInstallationRecord>): StoredSkillPackage[] {
  const grouped = new Map<string, StoredSkillPackage[]>();
  for (const skillPackage of packages) {
    grouped.set(skillPackage.manifest.id, [...(grouped.get(skillPackage.manifest.id) ?? []), skillPackage]);
  }
  return [...grouped.entries()].map(([skillId, versions]) => {
    const installed = installedById.get(skillId);
    if (installed?.version) {
      return versions.find((item) => item.manifest.version === installed.version) ?? latestPackage(versions);
    }
    return latestPackage(versions);
  });
}

function remoteRegistrySettings(state: RemoteRegistryState, managedByService: boolean): RemoteRegistrySettings {
  return {
    url: state.url,
    managedByService,
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
    return remoteRegistrySettings(await this.readRemoteRegistryState(), this.skillStore.isRegistryServiceManaged());
  }

  /** Saves a remote registry URL and resets the cached index until the next sync. */
  async updateRemoteRegistryUrl(url: string): Promise<RemoteRegistrySettings> {
    if (this.skillStore.isRegistryServiceManaged()) {
      return this.getRemoteRegistrySettings();
    }
    const trimmed = url.trim();
    const nextState: RemoteRegistryState = {
      url: trimmed || this.skillStore.getDefaultRemoteRegistryUrl(),
      lastSyncedAt: null,
      lastSyncError: "",
      skillCount: 0,
      cachedRegistry: { skills: [] },
    };
    await this.writeRemoteRegistryState(nextState);
    return remoteRegistrySettings(nextState, false);
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
      return remoteRegistrySettings(nextState, this.skillStore.isRegistryServiceManaged());
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
    const installedById = new Map(state.installedSkills.map((record) => [record.skillId, record]));
    const previousById = new Map(state.previousInstalledSkills.map((record) => [record.skillId, record]));
    const localPackages = visibleLocalPackages([...builtin, ...downloaded, ...custom], installedById);
    const localItems = localPackages.map((skillPackage) =>
      registryItemFromPackage(
        skillPackage,
        installedById,
        previousById,
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
  async downloadSkill(skillId: string, version?: string): Promise<SkillRegistryItem | null> {
    const remoteRegistryState = await this.readRemoteRegistryState();
    const registry = await this.resolveRemoteRegistry(remoteRegistryState);
    const result = await this.installer.downloadSkill(skillId, registry, remoteRegistryState.url, version);
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
  async installSkill(skillId: string, version?: string): Promise<SkillRegistryItem | null> {
    const localSkills = await this.listLocalSkillItems();
    const installed = await this.installer.installSkill(skillId, localSkills, version);
    return installed ? this.findSkill(skillId) : null;
  }

  /** Downloads and installs the newest remote version newer than the current installed version. */
  async updateSkill(skillId: string): Promise<SkillRegistryItem | null> {
    const state = await this.installer.readState();
    const current = state.installedSkills.find((record) => record.skillId === skillId);
    if (!current) {
      return null;
    }
    const remoteRegistryState = await this.readRemoteRegistryState();
    const registry = await this.resolveRemoteRegistry(remoteRegistryState);
    const target = registry.skills
      .filter((entry) => entry.id === skillId && (!current.version || compareVersion(entry.version, current.version) > 0))
      .sort((left, right) => compareVersion(right.version, left.version))[0];
    if (!target) {
      return null;
    }
    const downloaded = await this.installer.downloadSkill(skillId, { skills: [target] }, remoteRegistryState.url, target.version);
    if (!downloaded.ok) {
      return null;
    }
    return this.installSkill(skillId, target.version);
  }

  /** Restores the previous installed version when it still exists locally. */
  async rollbackSkill(skillId: string): Promise<SkillRegistryItem | null> {
    const rolledBack = await this.installer.rollbackSkill(skillId, await this.listLocalSkillItems());
    return rolledBack ? this.findSkill(skillId) : null;
  }

  /** Marks one skill as uninstalled. */
  async uninstallSkill(skillId: string): Promise<SkillRegistryItem | null> {
    await this.installer.uninstallSkill(skillId);
    return this.findSkill(skillId);
  }

  private async findSkill(skillId: string): Promise<SkillRegistryItem | null> {
    return (await this.listSkills()).find((skill) => skill.id === skillId) ?? null;
  }

  private async listLocalSkillItems(): Promise<SkillRegistryItem[]> {
    const [builtin, downloaded, custom, state] = await Promise.all([
      this.skillStore.listBuiltinPackages(),
      this.skillStore.listDownloadedPackages(),
      this.skillStore.listCustomPackages(),
      this.installer.readState(),
    ]);
    const installedById = new Map(state.installedSkills.map((record) => [record.skillId, record]));
    const previousById = new Map(state.previousInstalledSkills.map((record) => [record.skillId, record]));
    return [...builtin, ...downloaded, ...custom].map((skillPackage) =>
      registryItemFromPackage(
        skillPackage,
        installedById,
        previousById,
        state.downloadedSkillIds.includes(skillPackage.manifest.id) || skillPackage.sourceType !== "remote" ? "downloaded" : "available",
      ),
    );
  }

  private async readRemoteRegistryState(): Promise<RemoteRegistryState> {
    const fallbackUrl = this.skillStore.getDefaultRemoteRegistryUrl();
    const state = normalizeRemoteRegistryState(await this.localStore.readSection(remoteRegistryStoreKey, {}), fallbackUrl);
    if (!this.skillStore.isRegistryServiceManaged() || state.url === fallbackUrl) {
      return state;
    }
    return {
      url: fallbackUrl,
      lastSyncedAt: null,
      lastSyncError: "",
      skillCount: 0,
      cachedRegistry: { skills: [] },
    };
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
