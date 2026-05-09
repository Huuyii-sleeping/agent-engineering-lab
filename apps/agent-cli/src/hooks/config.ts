import { readFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import type { CommandHookDefinition, HookEventName, HooksFile } from "./types.js";

const HOOK_EVENTS: HookEventName[] = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"];

function normalizeHookDefinition(raw: unknown): CommandHookDefinition | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const input = raw as Record<string, unknown>;
  if (input.type !== "command") {
    return null;
  }
  const command = String(input.command ?? "").trim();
  if (!command) {
    return null;
  }
  const args = Array.isArray(input.args) ? input.args.map((item) => String(item)) : undefined;
  const matcherRaw = input.matcher;
  const matcher =
    matcherRaw && typeof matcherRaw === "object"
      ? {
          tools: Array.isArray((matcherRaw as Record<string, unknown>).tools)
            ? ((matcherRaw as Record<string, unknown>).tools as unknown[]).map((item) => String(item))
            : undefined,
        }
      : undefined;
  return { type: "command", command, args, matcher };
}

export async function loadHooksConfig(): Promise<HooksFile> {
  const configPath = path.join(process.cwd(), ".codex", "hooks.json");
  const raw = await readFile(configPath, "utf8").catch(() => "");
  if (!raw.trim()) {
    return { hooks: {} };
  }
  try {
    const parsed = JSON.parse(raw) as HooksFile;
    const hooks: Partial<Record<HookEventName, CommandHookDefinition[]>> = {};
    for (const event of HOOK_EVENTS) {
      const values = Array.isArray(parsed.hooks?.[event]) ? parsed.hooks?.[event] : [];
      hooks[event] = values.map((item) => normalizeHookDefinition(item)).filter((item): item is CommandHookDefinition => Boolean(item));
    }
    return { hooks };
  } catch {
    return { hooks: {} };
  }
}
