import type { SkillManifest, SkillMaturity, SkillPackageInput, SkillValidationResult } from "./types.js";

const maxPackageFiles = 32;
const maxFileBytes = 128 * 1024;
const skillIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

function parseFrontmatter(raw: string): Record<string, string> {
  const normalized = raw.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return {};
  }
  const frontmatterEnd = normalized.indexOf("\n---", 4);
  if (frontmatterEnd === -1) {
    return {};
  }
  const fields: Record<string, string> = {};
  for (const line of normalized.slice(4, frontmatterEnd).split("\n")) {
    const delimiterIndex = line.indexOf(":");
    if (delimiterIndex === -1) {
      continue;
    }
    const key = line.slice(0, delimiterIndex).trim();
    const value = line.slice(delimiterIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (key) {
      fields[key] = value;
    }
  }
  return fields;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  return asObject(JSON.parse(raw) as unknown);
}

/** Validate publishable JSON skill packages before they enter the registry store. */
export function validateSkillPackage(input: unknown): SkillValidationResult {
  const record = asObject(input);
  const rawFiles = Array.isArray(record.files) ? record.files : [];
  const errors: string[] = [];
  if (rawFiles.length === 0) {
    errors.push("package must include files");
  }
  if (rawFiles.length > maxPackageFiles) {
    errors.push(`package cannot include more than ${maxPackageFiles} files`);
  }
  const files = rawFiles.map((item) => {
    const file = asObject(item);
    return {
      path: cleanText(file.path, "", 240),
      content: typeof file.content === "string" ? file.content : "",
    };
  });
  for (const file of files) {
    if (!file.path || file.path.startsWith("/") || file.path.includes("\\") || file.path.split("/").some((part) => !part || part === "..")) {
      errors.push(`invalid file path: ${file.path || "<empty>"}`);
    }
    if (file.path.startsWith("scripts/")) {
      errors.push("scripts are not allowed in first-stage registry packages");
    }
    if (Buffer.byteLength(file.content, "utf8") > maxFileBytes) {
      errors.push(`file is too large: ${file.path}`);
    }
  }
  const skillFile = files.find((file) => file.path === "SKILL.md");
  const metadataFile = files.find((file) => file.path === "skill.json");
  if (!skillFile) {
    errors.push("package must include SKILL.md");
  }
  if (!metadataFile) {
    errors.push("package must include skill.json");
  }
  if (errors.length > 0 || !skillFile || !metadataFile) {
    return { ok: false, errors };
  }

  const definition = parseFrontmatter(skillFile.content);
  const id = cleanText(definition.name, "", 80);
  const description = cleanText(definition.description, "", 1200);
  if (!id || !skillIdPattern.test(id)) {
    errors.push("SKILL.md frontmatter name must be a kebab-case skill id");
  }
  if (!description) {
    errors.push("SKILL.md frontmatter description is required");
  }

  let metadata: Record<string, unknown> = {};
  try {
    metadata = parseJsonObject(metadataFile.content);
  } catch {
    errors.push("skill.json must be valid JSON");
  }
  const metadataId = cleanText(metadata.id, "", 80);
  const name = cleanText(metadata.name, "", 80);
  const version = cleanText(metadata.version, "", 40);
  if (!metadataId) {
    errors.push("skill.json id is required");
  }
  if (!name) {
    errors.push("skill.json name is required");
  }
  if (!version) {
    errors.push("skill.json version is required");
  }
  if (metadataId !== id) {
    errors.push("skill.json id must match SKILL.md frontmatter name");
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const manifest: SkillManifest = {
    id,
    name,
    description,
    summary: cleanText(metadata.summary, description, 220),
    category: cleanText(metadata.category, "未分类", 40),
    provider: cleanText(metadata.provider, "Registry", 80),
    version,
    runtime: cleanText(metadata.runtime, "Skill runtime", 80),
    permissions: cleanStringList(metadata.permissions, 16, 40),
    updatedAt: cleanText(metadata.updatedAt, "", 32),
    maturity: normalizeMaturity(metadata.maturity),
    tags: cleanStringList(metadata.tags, 16, 40),
    entry: "SKILL.md",
  };
  return { ok: true, manifest, files };
}
