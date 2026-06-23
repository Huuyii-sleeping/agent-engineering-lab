/** Skill maturity state exposed by local and remote skill manifests. */
export type SkillMaturity = "stable" | "beta";

/** Where a skill entered the local Skill Hub from. */
export type SkillSourceType = "builtin" | "remote" | "custom";

/** Lifecycle state for a skill package in the Skill Hub. */
export type SkillStatus = "available" | "downloaded" | "installed" | "updateAvailable" | "invalid";

/** Normalized skill manifest loaded from SKILL.md plus Hub metadata. */
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
  sourceType: SkillSourceType;
  status: SkillStatus;
  installed: boolean;
  validationErrors: string[];
};

/** One file inside a portable skill package. */
export type SkillPackageFile = {
  path: string;
  content: string;
};

/** JSON package format accepted by remote registry downloads and custom uploads. */
export type SkillPackageInput = {
  files: SkillPackageFile[];
};

/** Validated package ready to write into the local skill store. */
export type ValidatedSkillPackage = {
  manifest: SkillManifest;
  files: SkillPackageFile[];
};

export type SkillValidationResult =
  | { ok: true; package: ValidatedSkillPackage }
  | { ok: false; errors: string[] };

/** Remote registry index entry. */
export type RemoteSkillIndexItem = {
  id: string;
  version: string;
  packageUrl: string;
  metadata: Partial<Omit<SkillManifest, "id" | "version" | "entry">> & {
    entry?: string;
  };
};

export type RemoteSkillRegistry = {
  skills: RemoteSkillIndexItem[];
};

export type RemoteRegistrySettings = {
  url: string;
  lastSyncedAt: number | null;
  lastSyncError: string;
  skillCount: number;
};

export type RemoteRegistryState = RemoteRegistrySettings & {
  cachedRegistry: RemoteSkillRegistry;
};

export type SkillStoreState = {
  installedSkillIds: string[];
  downloadedSkillIds: string[];
  customSkillIds: string[];
};
