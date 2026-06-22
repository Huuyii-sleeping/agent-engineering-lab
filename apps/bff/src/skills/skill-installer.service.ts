import { Inject, Injectable } from "@nestjs/common";
import { LocalStoreService } from "../local-store.service.js";
import type {
  SkillPackageInput,
  SkillRegistryItem,
  SkillStoreState,
  ValidatedSkillPackage,
} from "./skill-types.js";
import { SkillStoreService } from "./skill-store.service.js";
import { SkillValidatorService } from "./skill-validator.service.js";

const skillStoreKey = "skills";
const defaultInstalledSkillIds = ["code-workspace", "memory-context"];

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeIds(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ]
    : [];
}

export function defaultSkillStoreState(): SkillStoreState {
  return {
    installedSkillIds: defaultInstalledSkillIds,
    downloadedSkillIds: [],
    customSkillIds: [],
  };
}

export function normalizeSkillStoreState(value: unknown): SkillStoreState {
  const record = asObject(value);
  return {
    installedSkillIds: normalizeIds(record.installedSkillIds).length
      ? normalizeIds(record.installedSkillIds)
      : defaultInstalledSkillIds,
    downloadedSkillIds: normalizeIds(record.downloadedSkillIds),
    customSkillIds: normalizeIds(record.customSkillIds),
  };
}

/** Handles lifecycle transitions for downloaded, installed, and custom skill packages. */
@Injectable()
export class SkillInstallerService {
  constructor(
    @Inject(LocalStoreService) private readonly localStore: LocalStoreService,
    private readonly skillStore: SkillStoreService,
    private readonly validator: SkillValidatorService,
  ) {}

  /** Reads persisted Skill Hub lifecycle state. */
  async readState(): Promise<SkillStoreState> {
    return normalizeSkillStoreState(await this.localStore.readSection(skillStoreKey, defaultSkillStoreState()));
  }

  /** Persists Skill Hub lifecycle state. */
  async writeState(state: SkillStoreState): Promise<SkillStoreState> {
    return this.localStore.writeSection(skillStoreKey, {
      installedSkillIds: [...new Set(state.installedSkillIds)],
      downloadedSkillIds: [...new Set(state.downloadedSkillIds)],
      customSkillIds: [...new Set(state.customSkillIds)],
    });
  }

  /** Downloads a remote skill package into the local remote store. */
  async downloadSkill(skillId: string): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
    const registry = await this.skillStore.readRemoteRegistry();
    const entry = registry.skills.find((item) => item.id === skillId);
    if (!entry) {
      return { ok: false, code: "SKILL_NOT_FOUND", message: `skill ${skillId} was not found` };
    }
    const remotePackage = await this.skillStore.readRemotePackage(entry);
    const validated = this.validator.validatePackage(remotePackage);
    if (!validated.ok) {
      return { ok: false, code: "SKILL_PACKAGE_INVALID", message: validated.errors.join("; ") };
    }
    await this.skillStore.writePackage("remote", validated.package);
    const state = await this.readState();
    await this.writeState({
      ...state,
      downloadedSkillIds: [...new Set([...state.downloadedSkillIds, validated.package.manifest.id])],
    });
    return { ok: true };
  }

  /** Stores a validated custom skill package. */
  async uploadCustomSkill(input: SkillPackageInput): Promise<
    | { ok: true; skillPackage: ValidatedSkillPackage }
    | { ok: false; code: string; message: string; errors: string[] }
  > {
    const validated = this.validator.validatePackage(input);
    if (!validated.ok) {
      return { ok: false, code: "SKILL_PACKAGE_INVALID", message: "skill package is invalid", errors: validated.errors };
    }
    await this.skillStore.writePackage("custom", validated.package);
    const state = await this.readState();
    await this.writeState({
      ...state,
      customSkillIds: [...new Set([...state.customSkillIds, validated.package.manifest.id])],
      downloadedSkillIds: [...new Set([...state.downloadedSkillIds, validated.package.manifest.id])],
    });
    return { ok: true, skillPackage: validated.package };
  }

  /** Marks an existing local skill package as installed. */
  async installSkill(skillId: string, localSkills: SkillRegistryItem[]): Promise<boolean> {
    const target = localSkills.find((skill) => skill.id === skillId && skill.status !== "available" && skill.status !== "invalid");
    if (!target) {
      return false;
    }
    const state = await this.readState();
    await this.writeState({
      ...state,
      installedSkillIds: [...new Set([...state.installedSkillIds, skillId])],
    });
    return true;
  }

  /** Removes an installed marker while keeping the package available locally. */
  async uninstallSkill(skillId: string): Promise<void> {
    const state = await this.readState();
    await this.writeState({
      ...state,
      installedSkillIds: state.installedSkillIds.filter((id) => id !== skillId),
    });
  }
}
