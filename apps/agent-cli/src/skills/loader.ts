import fs from "node:fs";
import path from "node:path";
import * as process from "node:process";

export type SkillMetadata = Record<string, string>;

export type SkillDefinition = {
  name: string;
  description: string;
  path: string;
  root: string;
  metadata: SkillMetadata;
  content: string;
};

export type SkillCatalogItem = {
  name: string;
  description: string;
  path: string;
  root: string;
  loaded: boolean;
};

export type SkillCatalog = {
  available: SkillCatalogItem[];
  loadedNames: string[];
  missingNames: string[];
  includeAll: boolean;
};

export type SkillLoaderOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  roots?: string[];
};

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function uniquePaths(values: string[]): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const value of values) {
    const resolved = path.resolve(value);
    if (seen.has(resolved)) {
      continue;
    }
    seen.add(resolved);
    results.push(resolved);
  }
  return results;
}

function parseSkillRootsEnv(raw: string): string[] {
  return raw
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter(Boolean);
}

function collectAncestorSkillRoots(cwd: string): string[] {
  const roots: string[] = [];
  let current = path.resolve(cwd);
  while (true) {
    roots.push(path.join(current, ".codex", "skills"));
    roots.push(path.join(current, "skills"));
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return roots;
}

export function resolveSkillRoots(options: SkillLoaderOptions = {}): string[] {
  const cwd = options.cwd ?? process.cwd();
  if (options.roots && options.roots.length > 0) {
    return uniquePaths(options.roots);
  }
  const env = options.env ?? process.env;
  const envRoots = parseSkillRootsEnv(env.AGENT_SKILL_ROOTS?.trim() ?? "");
  return uniquePaths([...collectAncestorSkillRoots(cwd), ...envRoots]);
}

function listSkillFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSkillFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name === "SKILL.md") {
      files.push(fullPath);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function parseFrontmatter(raw: string): { metadata: SkillMetadata; body: string } {
  if (!raw.startsWith("---\n")) {
    return { metadata: {}, body: raw.trim() };
  }
  const endIndex = raw.indexOf("\n---\n", 4);
  if (endIndex < 0) {
    return { metadata: {}, body: raw.trim() };
  }
  const metadataBlock = raw.slice(4, endIndex).trim();
  const body = raw.slice(endIndex + 5).trim();
  const metadata: SkillMetadata = {};
  for (const line of metadataBlock.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || /^\s/.test(line) || trimmed.startsWith("- ")) {
      continue;
    }
    const separator = trimmed.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const value = stripQuotes(trimmed.slice(separator + 1));
    if (key && value) {
      metadata[key] = value;
    }
  }
  return { metadata, body };
}

function deriveDescription(body: string): string {
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    return line;
  }
  return "";
}

function toSkillDefinition(filePath: string, root: string): SkillDefinition {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = parseFrontmatter(raw);
  const defaultName = path.basename(path.dirname(filePath));
  return {
    name: parsed.metadata.name?.trim() || defaultName,
    description: parsed.metadata.description?.trim() || deriveDescription(parsed.body),
    path: filePath,
    root,
    metadata: parsed.metadata,
    content: parsed.body,
  };
}

export function listSkills(options: SkillLoaderOptions = {}): SkillDefinition[] {
  const skills: SkillDefinition[] = [];
  const seenNames = new Set<string>();
  for (const root of resolveSkillRoots(options)) {
    for (const filePath of listSkillFiles(root)) {
      const skill = toSkillDefinition(filePath, root);
      const normalizedName = skill.name.trim().toLowerCase();
      if (!normalizedName || seenNames.has(normalizedName)) {
        continue;
      }
      seenNames.add(normalizedName);
      skills.push(skill);
    }
  }
  return skills.sort((left, right) => left.name.localeCompare(right.name));
}

export function loadSkill(name: string, options: SkillLoaderOptions = {}): SkillDefinition | null {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return listSkills(options).find((skill) => skill.name.toLowerCase() === normalized) ?? null;
}

export function parseConfiguredSkillNames(env: NodeJS.ProcessEnv = process.env): {
  includeAll: boolean;
  names: string[];
} {
  const raw = env.AGENT_SKILLS?.trim() ?? "";
  if (!raw) {
    return { includeAll: false, names: [] };
  }
  const names = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (names.some((name) => name.toLowerCase() === "all")) {
    return { includeAll: true, names: [] };
  }
  return {
    includeAll: false,
    names: [...new Set(names)],
  };
}

export function getSkillCatalog(options: SkillLoaderOptions = {}): SkillCatalog {
  const availableDefinitions = listSkills(options);
  const configured = parseConfiguredSkillNames(options.env ?? process.env);
  const availableByName = new Map(
    availableDefinitions.map((skill) => [skill.name.toLowerCase(), skill] as const),
  );
  const loadedDefinitions = configured.includeAll
    ? availableDefinitions
    : configured.names
      .map((name) => availableByName.get(name.toLowerCase()) ?? null)
      .filter((skill): skill is SkillDefinition => Boolean(skill));
  const loadedNameSet = new Set(loadedDefinitions.map((skill) => skill.name.toLowerCase()));
  const missingNames = configured.includeAll
    ? []
    : configured.names.filter((name) => !availableByName.has(name.toLowerCase()));
  return {
    available: availableDefinitions.map((skill) => ({
      name: skill.name,
      description: skill.description,
      path: skill.path,
      root: skill.root,
      loaded: loadedNameSet.has(skill.name.toLowerCase()),
    })),
    loadedNames: loadedDefinitions.map((skill) => skill.name),
    missingNames,
    includeAll: configured.includeAll,
  };
}

export function getConfiguredSkills(options: SkillLoaderOptions = {}): {
  selected: SkillDefinition[];
  missingNames: string[];
  includeAll: boolean;
} {
  const availableDefinitions = listSkills(options);
  const configured = parseConfiguredSkillNames(options.env ?? process.env);
  if (configured.includeAll) {
    return {
      selected: availableDefinitions,
      missingNames: [],
      includeAll: true,
    };
  }
  const availableByName = new Map(
    availableDefinitions.map((skill) => [skill.name.toLowerCase(), skill] as const),
  );
  const selected: SkillDefinition[] = [];
  const missingNames: string[] = [];
  for (const name of configured.names) {
    const matched = availableByName.get(name.toLowerCase()) ?? null;
    if (!matched) {
      missingNames.push(name);
      continue;
    }
    selected.push(matched);
  }
  return { selected, missingNames, includeAll: false };
}

export function toPromptSkillBlocks(skills: SkillDefinition[]): string[] {
  return skills.map((skill) => {
    const content = skill.content.trim() || skill.description.trim() || "(empty skill body)";
    return `### ${skill.name}\n${content}`.trim();
  });
}
