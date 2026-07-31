import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildPromptEnvelope } from "./builder.js";
import { getPrivacyConfig, isLocalPersistenceEnabled } from "../runtime-config.js";
import { sanitizeAndRedactText } from "../security/data-hygiene.js";
import { buildArtifactMetadata, isExpired } from "../security/local-retention.js";
import type { PromptBuilderInput, PromptSection } from "./types.js";

export type PromptSuppressedCategory = {
  id: string;
  reason: string;
};

export type PromptDump = {
  inspectionMode: "default" | "protected";
  primarySystemPrompt: string;
  supplementalSystemMessages: string[];
  stableSectionIds: string[];
  dynamicSectionIds: string[];
  sections: PromptSectionInspection[];
  suppressedCategories?: PromptSuppressedCategory[];
  protectedExportPath: string | null;
  persistenceBlockedReason?: string | null;
};

export type PromptSectionInspection = Pick<
  PromptSection,
  | "id"
  | "title"
  | "kind"
  | "source"
  | "cachePolicy"
  | "priority"
  | "estimatedTokens"
  | "inclusionReason"
>;

type PersistedPromptDumpEnvelope = {
  schemaVersion: 1;
  kind: "prompt_dump";
  createdAt: number;
  expiresAt: number;
  dump: PromptDump;
};

function protectSupplementalMessages(
  messages: string[],
  mode: "default" | "protected",
): string[] {
  if (mode === "protected") {
    return messages.map((message) => sanitizeAndRedactText(message));
  }
  return messages.map(
    (message, index) =>
      `[protected dynamic message ${index + 1}; ${sanitizeAndRedactText(message).length} chars hidden; use /prompt full]`,
  );
}

function toSectionInspection(section: PromptSection): PromptSectionInspection {
  return {
    id: section.id,
    title: section.title,
    kind: section.kind,
    source: section.source,
    cachePolicy: section.cachePolicy,
    priority: section.priority,
    estimatedTokens: section.estimatedTokens,
    inclusionReason: section.inclusionReason,
  };
}

export function inspectPromptSource(
  source: PromptBuilderInput,
  mode: "default" | "protected" = "default",
): PromptDump {
  const envelope = buildPromptEnvelope(source);
  const privacy = getPrivacyConfig();
  const suppressedCategories: PromptSuppressedCategory[] = [];
  if (privacy.memoryMode !== "default") {
    suppressedCategories.push({
      id: "memory_context",
      reason: `memory automation suppressed by privacy mode ${privacy.memoryMode}`,
    });
  }
  if (privacy.externalCapabilitiesMode !== "default") {
    suppressedCategories.push({
      id: "external_capabilities",
      reason: `external capabilities constrained by privacy mode ${privacy.externalCapabilitiesMode}`,
    });
  }
  return {
    inspectionMode: mode,
    primarySystemPrompt: sanitizeAndRedactText(envelope.primarySystemPrompt),
    supplementalSystemMessages: protectSupplementalMessages(envelope.supplementalSystemMessages, mode),
    stableSectionIds: envelope.stableSections.map((section) => section.id),
    dynamicSectionIds: envelope.dynamicSections.map((section) => section.id),
    sections: [...envelope.stableSections, ...envelope.dynamicSections].map(toSectionInspection),
    suppressedCategories,
    protectedExportPath: null,
    persistenceBlockedReason: null,
  };
}

async function pruneExpiredPromptDumps(root: string): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const filePath = path.join(root, entry.name);
        const raw = await readFile(filePath, "utf8").catch(() => "");
        if (!raw.trim()) {
          return;
        }
        try {
          const parsed = JSON.parse(raw) as Partial<PersistedPromptDumpEnvelope>;
          if (parsed.kind === "prompt_dump" && isExpired(parsed.expiresAt ?? null)) {
            await rm(filePath, { force: true });
          }
        } catch {
          return;
        }
      }),
  );
}

export async function exportProtectedPromptDump(
  source: PromptBuilderInput,
  rootDir = process.cwd(),
): Promise<PromptDump> {
  if (!isLocalPersistenceEnabled()) {
    return {
      ...inspectPromptSource(source, "protected"),
      protectedExportPath: null,
      persistenceBlockedReason: "protected prompt export blocked because local persistence is disabled",
    };
  }
  const outputRoot = path.join(rootDir, ".security", "prompt-dumps");
  await mkdir(outputRoot, { recursive: true });
  await pruneExpiredPromptDumps(outputRoot);

  const metadata = buildArtifactMetadata("prompt_dump");
  const dumpPath = path.join(outputRoot, `prompt_dump_${metadata.createdAt}.json`);
  const dump: PromptDump = {
    ...inspectPromptSource(source, "protected"),
    protectedExportPath: dumpPath,
  };
  const envelope: PersistedPromptDumpEnvelope = {
    schemaVersion: 1,
    kind: "prompt_dump",
    createdAt: metadata.createdAt,
    expiresAt: metadata.expiresAt,
    dump,
  };
  await writeFile(dumpPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  return dump;
}
