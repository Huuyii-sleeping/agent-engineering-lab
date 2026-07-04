import fs from "node:fs";
import path from "node:path";
import * as process from "node:process";

export type SkillMetadataValue = string | string[];

export type SkillMetadata = Record<string, SkillMetadataValue>;

export type SkillSourceType = "local" | "project" | "user" | "mcp" | "remote" | "custom";

export type AgentSkillBinding = {
  skillId: string;
  version: string;
  sourceType: "builtin" | "remote" | "custom";
  registrySource: "official" | "verified" | "community" | "private" | "local";
};

export type AgentRuntimeSkillContext = {
  id: string;
  name: string;
  skills: AgentSkillBinding[];
};

export type BoundSkillLoadIssue = {
  skillId: string;
  version: string;
  sourceType: AgentSkillBinding["sourceType"];
  code: "SKILL_PACKAGE_NOT_FOUND" | "SKILL_VERSION_MISMATCH" | "SKILL_PACKAGE_INVALID";
  message: string;
};

export type BoundSkillResolution =
  | { ok: true; skills: SkillDefinition[] }
  | { ok: false; issues: BoundSkillLoadIssue[] };

export type SkillExpansionOptions = {
  sessionId?: string;
};

export type SkillSummary = {
  name: string;
  description: string;
  path: string;
  root: string;
  metadata: SkillMetadata;
  allowedTools: string[];
  model: string | null;
  pathPatterns: string[];
  sourceType: SkillSourceType;
  containsShellCommands: boolean;
  canRunShell: boolean;
  contentLength: number;
  conditional: boolean;
};

export type LoadedSkillDefinition = SkillSummary & {
  baseDir: string;
  content: string;
};

export type SkillDefinition = LoadedSkillDefinition;

export type SkillCatalogItem = {
  name: string;
  description: string;
  path: string;
  root: string;
  loaded: boolean;
  allowedTools: string[];
  model: string | null;
  pathPatterns: string[];
  sourceType: SkillSourceType;
  containsShellCommands: boolean;
  canRunShell: boolean;
  contentLength: number;
  conditional: boolean;
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
  skillHubRoots?: string[];
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

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function normalizeMetadataKey(key: string): string {
  return key.trim().toLowerCase();
}

function metadataValueToList(value: SkillMetadataValue | undefined): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => metadataValueToList(item));
  }
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => stripQuotes(item))
    .filter(Boolean);
}

function metadataValueToString(value: SkillMetadataValue | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }
  return value?.trim() || null;
}

function getMetadataValue(metadata: SkillMetadata, key: string): SkillMetadataValue | undefined {
  return metadata[normalizeMetadataKey(key)];
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

function parseSkillHubRootsEnv(raw: string): string[] {
  return parseSkillRootsEnv(raw);
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

/** Resolves local SkillHub package roots from explicit options or AGENT_SKILLHUB_ROOTS. */
export function resolveSkillHubRoots(options: SkillLoaderOptions = {}): string[] {
  if (options.skillHubRoots && options.skillHubRoots.length > 0) {
    return uniquePaths(options.skillHubRoots);
  }
  const env = options.env ?? process.env;
  const agentRoots = parseSkillHubRootsEnv(env.AGENT_SKILLHUB_ROOTS?.trim() ?? "");
  if (agentRoots.length > 0) {
    return uniquePaths(agentRoots);
  }
  return uniquePaths(parseSkillHubRootsEnv(env.SKILLHUB_DATA_ROOT?.trim() ?? ""));
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
  const normalized = raw.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { metadata: {}, body: normalized.trim() };
  }
  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex < 0) {
    return { metadata: {}, body: normalized.trim() };
  }
  const metadataBlock = normalized.slice(4, endIndex).trim();
  const body = normalized.slice(endIndex + 5).trim();
  const metadata: SkillMetadata = {};
  let currentListKey: string | null = null;
  for (const line of metadataBlock.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    if (/^\s+/.test(line) && trimmed.startsWith("- ") && currentListKey) {
      const list = Array.isArray(metadata[currentListKey]) ? metadata[currentListKey] : [];
      metadata[currentListKey] = [...list, stripQuotes(trimmed.slice(2))].filter(Boolean);
      continue;
    }
    const separator = trimmed.indexOf(":");
    if (separator <= 0) {
      currentListKey = null;
      continue;
    }
    const key = normalizeMetadataKey(trimmed.slice(0, separator));
    const value = stripQuotes(trimmed.slice(separator + 1));
    if (!key) {
      currentListKey = null;
      continue;
    }
    if (value) {
      metadata[key] = value;
      currentListKey = null;
    } else {
      metadata[key] = [];
      currentListKey = key;
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

function deriveSourceType(metadata: SkillMetadata, root: string, cwd: string): SkillSourceType {
  const explicit = metadataValueToString(getMetadataValue(metadata, "source"))?.toLowerCase();
  if (
    explicit === "local" ||
    explicit === "project" ||
    explicit === "user" ||
    explicit === "mcp" ||
    explicit === "remote" ||
    explicit === "custom"
  ) {
    return explicit;
  }

  const normalizedRoot = path.resolve(root);
  const normalizedCwd = path.resolve(cwd);
  const projectSkillRoots = [
    path.join(normalizedCwd, ".codex", "skills"),
    path.join(normalizedCwd, "skills"),
  ].map((value) => path.resolve(value));
  if (
    projectSkillRoots.some(
      (skillRoot) => normalizedRoot === skillRoot || normalizedRoot.startsWith(`${skillRoot}${path.sep}`),
    )
  ) {
    return "project";
  }

  const home = process.env.USERPROFILE || process.env.HOME || "";
  if (home) {
    const userSkillRoot = path.join(path.resolve(home), ".codex", "skills");
    if (normalizedRoot === userSkillRoot || normalizedRoot.startsWith(`${userSkillRoot}${path.sep}`)) {
      return "user";
    }
  }

  return "local";
}

function containsShellFence(content: string): boolean {
  return /```(?:bash|sh|shell|zsh|fish|powershell|pwsh|ps1)\b/i.test(content);
}

function isShellTool(tool: string): boolean {
  const normalized = tool.trim().toLowerCase();
  return ["bash", "shell", "sh", "zsh", "fish", "powershell", "pwsh", "ps1"].includes(normalized);
}

function isTrustedSource(sourceType: SkillSourceType): boolean {
  return sourceType === "local" || sourceType === "project" || sourceType === "user";
}

function toSkillSummaryFromParsed(
  filePath: string,
  root: string,
  cwd: string,
  parsed: { metadata: SkillMetadata; body: string },
): SkillSummary {
  const defaultName = path.basename(path.dirname(filePath));
  const allowedTools = metadataValueToList(getMetadataValue(parsed.metadata, "allowed-tools"));
  const pathPatterns = metadataValueToList(getMetadataValue(parsed.metadata, "paths")).map(normalizeSlashes);
  const sourceType = deriveSourceType(parsed.metadata, root, cwd);
  const containsShellCommands = containsShellFence(parsed.body);
  return {
    name: metadataValueToString(getMetadataValue(parsed.metadata, "name")) || defaultName,
    description: metadataValueToString(getMetadataValue(parsed.metadata, "description")) || deriveDescription(parsed.body),
    path: filePath,
    root,
    metadata: parsed.metadata,
    allowedTools,
    model: metadataValueToString(getMetadataValue(parsed.metadata, "model")),
    pathPatterns,
    sourceType,
    containsShellCommands,
    canRunShell: isTrustedSource(sourceType) && allowedTools.some(isShellTool),
    contentLength: parsed.body.length,
    conditional: pathPatterns.length > 0,
  };
}

function toSkillSummary(filePath: string, root: string, cwd: string): SkillSummary {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = parseFrontmatter(raw);
  return toSkillSummaryFromParsed(filePath, root, cwd, parsed);
}

function toLoadedSkillDefinition(filePath: string, root: string, cwd: string): LoadedSkillDefinition {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = parseFrontmatter(raw);
  const summary = toSkillSummaryFromParsed(filePath, root, cwd, parsed);
  return {
    ...summary,
    baseDir: path.dirname(filePath),
    content: parsed.body,
  };
}

function readPackageVersion(packageRoot: string): string {
  try {
    const raw = fs.readFileSync(path.join(packageRoot, "skill.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version.trim() : "";
  } catch {
    return "";
  }
}

function toBoundSkillDefinition(
  binding: AgentSkillBinding,
  filePath: string,
  root: string,
  cwd: string,
): BoundSkillResolution {
  try {
    const loaded = toLoadedSkillDefinition(filePath, root, cwd);
    const skill = {
      ...loaded,
      sourceType: binding.sourceType === "builtin" ? loaded.sourceType : binding.sourceType,
    };
    const packageVersion = readPackageVersion(path.dirname(filePath));
    const metadataVersion = metadataValueToString(getMetadataValue(skill.metadata, "version")) ?? "";
    const resolvedVersion = packageVersion || metadataVersion;
    if (binding.version && resolvedVersion !== binding.version) {
      return {
        ok: false,
        issues: [
          {
            skillId: binding.skillId,
            version: binding.version,
            sourceType: binding.sourceType,
            code: "SKILL_VERSION_MISMATCH",
            message: `skill ${binding.skillId} is ${resolvedVersion || "(unknown)"}, not ${binding.version}`,
          },
        ],
      };
    }
    return { ok: true, skills: [skill] };
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          skillId: binding.skillId,
          version: binding.version,
          sourceType: binding.sourceType,
          code: "SKILL_PACKAGE_INVALID",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

function uniqueSkillsByName<T extends SkillSummary>(skills: T[]): T[] {
  const seenNames = new Set<string>();
  const results: T[] = [];
  for (const skill of skills) {
    const normalizedName = skill.name.trim().toLowerCase();
    if (!normalizedName || seenNames.has(normalizedName)) {
      continue;
    }
    seenNames.add(normalizedName);
    results.push(skill);
  }
  return results.sort((left, right) => left.name.localeCompare(right.name));
}

export function listSkillSummaries(options: SkillLoaderOptions = {}): SkillSummary[] {
  const skills: SkillSummary[] = [];
  const cwd = options.cwd ?? process.cwd();
  for (const root of resolveSkillRoots(options)) {
    for (const filePath of listSkillFiles(root)) {
      skills.push(toSkillSummary(filePath, root, cwd));
    }
  }
  return uniqueSkillsByName(skills);
}

export function listSkills(options: SkillLoaderOptions = {}): SkillDefinition[] {
  const skills: SkillDefinition[] = [];
  const seenNames = new Set<string>();
  const cwd = options.cwd ?? process.cwd();
  for (const root of resolveSkillRoots(options)) {
    for (const filePath of listSkillFiles(root)) {
      const skill = toLoadedSkillDefinition(filePath, root, cwd);
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

function packagePathForBinding(root: string, binding: AgentSkillBinding): string {
  return path.join(root, binding.sourceType, binding.skillId, binding.version, "SKILL.md");
}

function resolveRemoteOrCustomBinding(binding: AgentSkillBinding, options: SkillLoaderOptions): BoundSkillResolution {
  for (const root of resolveSkillHubRoots(options)) {
    const filePath = packagePathForBinding(root, binding);
    if (fs.existsSync(filePath)) {
      return toBoundSkillDefinition(binding, filePath, root, options.cwd ?? process.cwd());
    }
  }
  return {
    ok: false,
    issues: [
      {
        skillId: binding.skillId,
        version: binding.version,
        sourceType: binding.sourceType,
        code: "SKILL_PACKAGE_NOT_FOUND",
        message: `skill package not found: ${binding.sourceType}/${binding.skillId}/${binding.version}`,
      },
    ],
  };
}

function resolveBuiltinBinding(binding: AgentSkillBinding, options: SkillLoaderOptions): BoundSkillResolution {
  const skill = loadSkill(binding.skillId, options);
  if (!skill) {
    return {
      ok: false,
      issues: [
        {
          skillId: binding.skillId,
          version: binding.version,
          sourceType: binding.sourceType,
          code: "SKILL_PACKAGE_NOT_FOUND",
          message: `builtin skill not found: ${binding.skillId}`,
        },
      ],
    };
  }
  const version = metadataValueToString(getMetadataValue(skill.metadata, "version")) ?? "";
  if (binding.version && version !== binding.version) {
    return {
      ok: false,
      issues: [
        {
          skillId: binding.skillId,
          version: binding.version,
          sourceType: binding.sourceType,
          code: "SKILL_VERSION_MISMATCH",
          message: `builtin skill ${binding.skillId} is ${version || "(unknown)"}, not ${binding.version}`,
        },
      ],
    };
  }
  return { ok: true, skills: [skill] };
}

export function resolveBoundSkills(
  context: AgentRuntimeSkillContext,
  options: SkillLoaderOptions = {},
): BoundSkillResolution {
  const skills: SkillDefinition[] = [];
  const issues: BoundSkillLoadIssue[] = [];
  const bindingsById = new Map(context.skills.map((binding) => [binding.skillId, binding] as const));
  for (const binding of bindingsById.values()) {
    const resolved =
      binding.sourceType === "builtin"
        ? resolveBuiltinBinding(binding, options)
        : resolveRemoteOrCustomBinding(binding, options);
    if (resolved.ok) {
      skills.push(...resolved.skills);
    } else {
      issues.push(...resolved.issues);
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, skills: uniqueSkillsByName(skills) };
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
  const availableDefinitions = listSkillSummaries(options);
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
      allowedTools: skill.allowedTools,
      model: skill.model,
      pathPatterns: skill.pathPatterns,
      sourceType: skill.sourceType,
      containsShellCommands: skill.containsShellCommands,
      canRunShell: skill.canRunShell,
      contentLength: skill.contentLength,
      conditional: skill.conditional,
    })),
    loadedNames: loadedDefinitions.map((skill) => skill.name),
    missingNames,
    includeAll: configured.includeAll,
  };
}

export function getConfiguredSkillSummaries(options: SkillLoaderOptions = {}): {
  selected: SkillSummary[];
  missingNames: string[];
  includeAll: boolean;
} {
  const availableDefinitions = listSkillSummaries(options);
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
  const selected: SkillSummary[] = [];
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

export function expandSkillContent(skill: SkillDefinition, options: SkillExpansionOptions = {}): string {
  const skillDir = skill.baseDir;
  const expanded = skill.content
    .replaceAll("${SKILL_DIR}", skillDir)
    .replaceAll("${SESSION_ID}", options.sessionId ?? "");
  return [`Base directory for this skill: ${skillDir}`, "", expanded].join("\n");
}

function escapeRegex(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

function globToRegex(pattern: string): RegExp {
  const placeholder = "__DOUBLE_STAR__";
  const escaped = escapeRegex(normalizeSlashes(pattern))
    .replaceAll("**", placeholder)
    .replaceAll("*", "[^/]*");
  return new RegExp(`^${escaped.replaceAll(placeholder, ".*")}$`);
}

function pathMatchesPattern(candidatePath: string, pattern: string): boolean {
  const normalizedPath = normalizeSlashes(candidatePath);
  const normalizedPattern = normalizeSlashes(pattern);
  if (!normalizedPattern) {
    return false;
  }
  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
  }
  if (normalizedPattern.includes("*")) {
    return globToRegex(normalizedPattern).test(normalizedPath);
  }
  return normalizedPath === normalizedPattern || normalizedPath.startsWith(`${normalizedPattern}/`);
}

export function skillMatchesPaths(skill: SkillSummary, paths: string[]): boolean {
  if (skill.pathPatterns.length === 0) {
    return true;
  }
  if (paths.length === 0) {
    return false;
  }
  return paths.some((candidatePath) =>
    skill.pathPatterns.some((pattern) => pathMatchesPattern(candidatePath, pattern)),
  );
}

export function selectSkillsForContext<T extends SkillSummary>(skills: T[], paths: string[]): T[] {
  return skills.filter((skill) => skillMatchesPaths(skill, paths));
}

export function activateConditionalSkillsForPaths<T extends SkillSummary>(skills: T[], paths: string[]): T[] {
  return skills.filter((skill) => skill.conditional && skillMatchesPaths(skill, paths));
}

export function toPromptSkillBlocks(
  skills: SkillDefinition[],
  options: SkillExpansionOptions = {},
): string[] {
  return skills.map((skill) => {
    const content = expandSkillContent(skill, options).trim() || skill.description.trim() || "(empty skill body)";
    const metadata = [
      `source=${skill.sourceType}`,
      skill.allowedTools.length > 0 ? `allowed_tools=${skill.allowedTools.join(",")}` : null,
      skill.model ? `model=${skill.model}` : null,
      skill.pathPatterns.length > 0 ? `paths=${skill.pathPatterns.join(",")}` : null,
      `can_run_shell=${skill.canRunShell ? "true" : "false"}`,
    ].filter(Boolean);
    return `### ${skill.name}\n[skill ${metadata.join(" ")}]\n${content}`.trim();
  });
}

export function toPromptSkillCatalogBlocks(
  skills: SkillSummary[],
  options: { includeConditional?: boolean } = {},
): string[] {
  return skills
    .filter((skill) => options.includeConditional || !skill.conditional)
    .map((skill) => {
      const metadata = [
        `source=${skill.sourceType}`,
        skill.allowedTools.length > 0 ? `allowed_tools=${skill.allowedTools.join(",")}` : null,
        skill.model ? `model=${skill.model}` : null,
        skill.pathPatterns.length > 0 ? `paths=${skill.pathPatterns.join(",")}` : null,
        `can_run_shell=${skill.canRunShell ? "true" : "false"}`,
        `content_chars=${skill.contentLength}`,
        `path=${skill.path}`,
      ].filter(Boolean);
      const lines = [
        `### ${skill.name}`,
        `[skill_summary ${metadata.join(" ")}]`,
        skill.description.trim() || "(no description)",
        `Call load_skill with name "${skill.name}" before following this skill's full instructions.`,
      ];
      return lines.join("\n").trim();
    });
}
