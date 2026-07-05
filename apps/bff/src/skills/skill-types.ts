/** Skill maturity state exposed by local and remote skill manifests. */
export type SkillMaturity = "stable" | "beta";

/** Where a skill entered the local Skill Hub from. */
export type SkillSourceType = "builtin" | "remote" | "custom";

/** Trust channel claimed by a registry entry or assigned by the local hub. */
export type SkillRegistrySource = "official" | "verified" | "community" | "private" | "local";
export type SkillPackageVersion = "1.0";

/** Lifecycle state for a skill package in the Skill Hub. */
export type SkillStatus = "available" | "downloaded" | "installed" | "updateAvailable" | "invalid";

/** Successful Skill lifecycle operations captured by the local audit log. */
export type SkillAuditAction = "download" | "upload" | "install" | "update" | "rollback" | "uninstall";

/** One persisted Skill lifecycle audit event. */
export type SkillAuditEvent = {
  id: string;
  action: SkillAuditAction;
  ok: boolean;
  code: string;
  message: string;
  skillId: string;
  skillName: string;
  version: string;
  status: SkillStatus;
  at: number;
};

/** Versioned install marker persisted by the Skill Hub lifecycle store. */
export type SkillInstallationRecord = {
  skillId: string;
  version: string;
  sourceType: SkillSourceType;
  registrySource: SkillRegistrySource;
  installedAt: number;
};

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
  registrySource: SkillRegistrySource;
  publisher: SkillPublisher;
  downloads: number;
  rating: number | null;
  packageSha256: string;
  deprecated: boolean;
  status: SkillStatus;
  installed: boolean;
  installedVersion: string;
  installedAt: number | null;
  availableVersion: string;
  previousInstalledVersion: string;
  validationErrors: string[];
};

/** Registry publisher identity displayed by Skill Hub. */
export type SkillPublisher = {
  id: string;
  name: string;
  verified: boolean;
};

/** One file inside a portable skill package. */
export type SkillPackageFile = {
  path: string;
  content: string;
};

/** JSON package format accepted by remote registry downloads and custom uploads. */
export type SkillPackageInput = {
  skillPackageVersion?: SkillPackageVersion;
  files: SkillPackageFile[];
};

/** Validated package ready to write into the local skill store. */
export type ValidatedSkillPackage = {
  skillPackageVersion?: SkillPackageVersion;
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
  packageSha256: string;
  source: SkillRegistrySource;
  publisher: SkillPublisher;
  downloads: number;
  rating: number | null;
  deprecated: boolean;
  metadata: Partial<Omit<SkillManifest, "id" | "version" | "entry">> & {
    entry?: string;
  };
};

export type RemoteSkillRegistry = {
  skills: RemoteSkillIndexItem[];
};

export type RemoteRegistrySettings = {
  url: string;
  managedByService: boolean;
  lastSyncedAt: number | null;
  lastSyncError: string;
  skillCount: number;
};

export type RemoteRegistryState = Omit<RemoteRegistrySettings, "managedByService"> & {
  cachedRegistry: RemoteSkillRegistry;
};

export type SkillHubReadinessStatus = "ready" | "degraded" | "blocked";

export type SkillHubReadiness = {
  status: SkillHubReadinessStatus;
  registry: RemoteRegistrySettings;
  store: {
    readable: boolean;
    message: string;
  };
  counts: {
    total: number;
    installed: number;
    updateAvailable: number;
    invalid: number;
    failedAudit: number;
  };
};

export type SkillStoreState = {
  installedSkillIds: string[];
  installedSkills: SkillInstallationRecord[];
  previousInstalledSkills: SkillInstallationRecord[];
  auditEvents: SkillAuditEvent[];
  downloadedSkillIds: string[];
  customSkillIds: string[];
};
