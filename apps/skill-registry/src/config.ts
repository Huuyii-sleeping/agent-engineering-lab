import { join } from "node:path";
import * as process from "node:process";

export const DEFAULT_SKILL_REGISTRY_PORT = 3190;

function readPort(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function defaultDataRoot(): string {
  return join(process.cwd(), "runtime", "skill-registry");
}

export type SkillRegistryConfig = {
  port: number;
  dbPath: string;
  packageRoot: string;
  seedRegistryUrl: string;
};

/** Resolve runtime config for the standalone Skill Registry service. */
export function resolveSkillRegistryConfig(env: NodeJS.ProcessEnv = process.env): SkillRegistryConfig {
  const dataRoot = env.SKILL_REGISTRY_DATA_ROOT?.trim() || defaultDataRoot();
  return {
    port: readPort(env.SKILL_REGISTRY_PORT, DEFAULT_SKILL_REGISTRY_PORT),
    dbPath: env.SKILL_REGISTRY_DB?.trim() || join(dataRoot, "registry.sqlite"),
    packageRoot: env.SKILL_PACKAGE_ROOT?.trim() || join(dataRoot, "packages"),
    seedRegistryUrl:
      env.SKILL_REGISTRY_SEED?.trim() || join(process.cwd(), "registries", "default-skill-registry.json"),
  };
}
