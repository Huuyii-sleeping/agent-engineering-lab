import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildPromptEnvelope } from "./builder.js";
import { sanitizeAndRedactText } from "../security/data-hygiene.js";
import { buildArtifactMetadata, isExpired } from "../security/local-retention.js";
import type { StaticPromptSource } from "./types.js";

export type PromptDump = {
  inspectionMode: "default" | "protected";
  primarySystemPrompt: string;
  supplementalSystemMessages: string[];
  stableSectionIds: string[];
  dynamicSectionIds: string[];
  protectedExportPath: string | null;
};

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

export function inspectPromptSource(
  source: StaticPromptSource,
  mode: "default" | "protected" = "default",
): PromptDump {
  const envelope = buildPromptEnvelope(source);
  return {
    inspectionMode: mode,
    primarySystemPrompt: sanitizeAndRedactText(envelope.primarySystemPrompt),
    supplementalSystemMessages: protectSupplementalMessages(envelope.supplementalSystemMessages, mode),
    stableSectionIds: envelope.stableSections.map((section) => section.id),
    dynamicSectionIds: envelope.dynamicSections.map((section) => section.id),
    protectedExportPath: null,
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
  source: StaticPromptSource,
  rootDir = process.cwd(),
): Promise<PromptDump> {
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
