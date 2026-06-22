import { Injectable } from "@nestjs/common";
import type {
  RemoteSkillIndexItem,
  SkillManifest,
  SkillPackageInput,
  SkillRegistryItem,
  SkillSourceType,
  SkillStatus,
} from "./skill-types.js";
import { SkillInstallerService } from "./skill-installer.service.js";
import { SkillStoreService, type StoredSkillPackage, type SkillStoreOptions } from "./skill-store.service.js";

export type SkillRegistryOptions = SkillStoreOptions;

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
    status: installedIds.has(skillPackage.manifest.id) ? "installed" : status,
    installed: installedIds.has(skillPackage.manifest.id),
    validationErrors,
  };
}

function registryItemFromRemote(entry: RemoteSkillIndexItem, status: SkillStatus): SkillRegistryItem {
  return {
    ...remoteManifest(entry),
    sourceType: "remote",
    status,
    installed: false,
    validationErrors: [],
  };
}

/** Aggregates builtin, remote, custom, and lifecycle state for Skill Hub. */
@Injectable()
export class SkillRegistryService {
  constructor(
    private readonly skillStore: SkillStoreService,
    private readonly installer: SkillInstallerService,
  ) {}

  /** Lists all known skills with source and lifecycle state. */
  async listSkills(): Promise<SkillRegistryItem[]> {
    const [builtin, downloaded, custom, remoteRegistry, state] = await Promise.all([
      this.skillStore.listBuiltinPackages(),
      this.skillStore.listDownloadedPackages(),
      this.skillStore.listCustomPackages(),
      this.skillStore.readRemoteRegistry(),
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
    const result = await this.installer.downloadSkill(skillId);
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
}
