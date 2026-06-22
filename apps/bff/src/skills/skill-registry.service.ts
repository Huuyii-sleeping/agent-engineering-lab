import { Inject, Injectable } from "@nestjs/common";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { LocalStoreService } from "../local-store.service.js";

export type SkillRegistryOptions = {
  skillsRoot?: string;
};

/** Skill maturity state exposed by local skill manifests. */
export type SkillMaturity = "stable" | "beta";

/** Normalized local skill package loaded from SKILL.md plus Hub metadata. */
export type SkillManifest = {
  id: string;
  name: string;
  description: string;
  summary: string;
  category: string;
  provider: string;
  version: string;
  runtime: string;
  permissions: string[];
  updatedAt: string;
  maturity: SkillMaturity;
  tags: string[];
  entry: string;
};

/** Skill registry item returned to the Web console. */
export type SkillRegistryItem = SkillManifest & {
  installed: boolean;
};

type SkillStoreState = {
  installedSkillIds: string[];
};

const skillStoreKey = "skills";
const defaultInstalledSkillIds = ["code-workspace", "memory-context"];

function defaultSkillsRoot(): string {
  const cwdRoot = join(process.cwd(), "skills");
  return existsSync(cwdRoot) ? cwdRoot : join(process.cwd(), "..", "..", "skills");
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function cleanText(value: unknown, fallback: string, limit = 120): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : fallback;
}

function cleanStringList(value: unknown, limit = 16, itemLimit = 80): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, itemLimit))
        .filter(Boolean),
    ),
  ].slice(0, limit);
}

function normalizeMaturity(value: unknown): SkillMaturity {
  return value === "beta" ? "beta" : "stable";
}

function parseSkillDefinition(raw: string, fallbackId: string): { id: string; description: string } {
  const normalized = raw.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { id: fallbackId, description: "" };
  }
  const frontmatterEnd = normalized.indexOf("\n---", 4);
  if (frontmatterEnd === -1) {
    return { id: fallbackId, description: "" };
  }
  const frontmatter = normalized.slice(4, frontmatterEnd);
  const fields = new Map<string, string>();
  for (const line of frontmatter.split("\n")) {
    const delimiterIndex = line.indexOf(":");
    if (delimiterIndex === -1) {
      continue;
    }
    const key = line.slice(0, delimiterIndex).trim();
    const value = line.slice(delimiterIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (key) {
      fields.set(key, value);
    }
  }
  return {
    id: cleanText(fields.get("name"), fallbackId, 80),
    description: cleanText(fields.get("description"), "", 1200),
  };
}

function normalizeSkillManifest(value: unknown, definition: { id: string; description: string }): SkillManifest {
  const record = asObject(value);
  const id = cleanText(record.id, definition.id, 80);
  const description = definition.description;
  return {
    id,
    name: cleanText(record.name, id, 80),
    description,
    summary: cleanText(record.summary, description || "暂无简介", 220),
    category: cleanText(record.category, "未分类", 40),
    provider: cleanText(record.provider, "Local", 80),
    version: cleanText(record.version, "0.0.0", 40),
    runtime: cleanText(record.runtime, "Local runtime", 80),
    permissions: cleanStringList(record.permissions, 16, 40),
    updatedAt: cleanText(record.updatedAt, "", 32),
    maturity: normalizeMaturity(record.maturity),
    tags: cleanStringList(record.tags, 16, 40),
    entry: cleanText(record.entry, "SKILL.md", 120),
  };
}

function normalizeInstalledIds(value: unknown, knownIds: Set<string>): string[] {
  const record = asObject(value);
  const rawIds = Array.isArray(record.installedSkillIds) ? record.installedSkillIds : defaultInstalledSkillIds;
  return [...new Set(rawIds.filter((item): item is string => typeof item === "string" && knownIds.has(item)))];
}

/** Reads local skill manifests and persists the user's installed skill ids. */
@Injectable()
export class SkillRegistryService {
  private readonly skillsRoot: string;

  constructor(
    @Inject(LocalStoreService) private readonly store: LocalStoreService,
    options: SkillRegistryOptions = {},
  ) {
    this.skillsRoot = options.skillsRoot ?? defaultSkillsRoot();
  }

  /** Lists all local skills with their installed state. */
  async listSkills(): Promise<SkillRegistryItem[]> {
    const manifests = await this.readManifests();
    const installedIds = await this.readInstalledIds(manifests);
    return manifests.map((manifest) => ({ ...manifest, installed: installedIds.has(manifest.id) }));
  }

  /** Marks one known skill as installed and returns its updated registry item. */
  async installSkill(skillId: string): Promise<SkillRegistryItem | null> {
    const manifests = await this.readManifests();
    const target = manifests.find((manifest) => manifest.id === skillId);
    if (!target) {
      return null;
    }
    const installedIds = await this.readInstalledIds(manifests);
    installedIds.add(skillId);
    await this.writeInstalledIds(manifests, installedIds);
    return { ...target, installed: true };
  }

  /** Marks one known skill as uninstalled and returns its updated registry item. */
  async uninstallSkill(skillId: string): Promise<SkillRegistryItem | null> {
    const manifests = await this.readManifests();
    const target = manifests.find((manifest) => manifest.id === skillId);
    if (!target) {
      return null;
    }
    const installedIds = await this.readInstalledIds(manifests);
    installedIds.delete(skillId);
    await this.writeInstalledIds(manifests, installedIds);
    return { ...target, installed: false };
  }

  private async readManifests(): Promise<SkillManifest[]> {
    let entries;
    try {
      entries = await readdir(this.skillsRoot, { withFileTypes: true });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
    const manifests = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const [skillDefinition, hubMetadata] = await Promise.all([
            readFile(join(this.skillsRoot, entry.name, "SKILL.md"), "utf8"),
            readFile(join(this.skillsRoot, entry.name, "skill.json"), "utf8"),
          ]);
          return normalizeSkillManifest(
            JSON.parse(hubMetadata) as unknown,
            parseSkillDefinition(skillDefinition, entry.name),
          );
        }),
    );
    return manifests.sort((left, right) => left.id.localeCompare(right.id));
  }

  private async readInstalledIds(manifests: SkillManifest[]): Promise<Set<string>> {
    const knownIds = new Set(manifests.map((manifest) => manifest.id));
    const stored = await this.store.readSection<SkillStoreState>(skillStoreKey, {
      installedSkillIds: defaultInstalledSkillIds,
    });
    return new Set(normalizeInstalledIds(stored, knownIds));
  }

  private async writeInstalledIds(manifests: SkillManifest[], installedIds: Set<string>): Promise<void> {
    const orderedInstalledIds = manifests.map((manifest) => manifest.id).filter((id) => installedIds.has(id));
    await this.store.writeSection<SkillStoreState>(skillStoreKey, { installedSkillIds: orderedInstalledIds });
  }
}
