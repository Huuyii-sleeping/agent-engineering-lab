export type SkillMaturity = "stable" | "beta";
export type SkillRegistrySource = "official" | "verified" | "community" | "private" | "local";

export type SkillPublisher = {
  id: string;
  name: string;
  verified: boolean;
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
