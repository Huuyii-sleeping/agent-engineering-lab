export type SkillMaturity = "stable" | "beta";
export type SkillRegistrySource = "official" | "verified" | "community" | "private" | "local";
export type SkillPackageVersion = "1.0";

export type SkillPublisher = {
  id: string;
  name: string;
  verified: boolean;
};

export type RegistryAuditEvent = {
  id: number;
  action: string;
  actor: string;
  subject: string;
  metadata: Record<string, unknown>;
  createdAt: number;
};

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

export type SkillPackageFile = {
  path: string;
  content: string;
};

export type SkillPackageInput = {
  skillPackageVersion?: SkillPackageVersion;
  files: SkillPackageFile[];
};

export type RegistrySkillVersion = {
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

export type RegistryIndex = {
  skills: RegistrySkillVersion[];
};

export type PublishSkillInput = {
  package: SkillPackageInput;
  source?: SkillRegistrySource;
  publisher?: SkillPublisher;
  rating?: number | null;
  deprecated?: boolean;
};

export type CreatePublisherInput = {
  id?: string;
  name?: string;
  verified?: boolean;
};

export type SkillValidationResult =
  | { ok: true; manifest: SkillManifest; files: SkillPackageFile[]; skillPackageVersion?: SkillPackageVersion }
  | { ok: false; errors: string[] };
