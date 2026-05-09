import { spawn } from "node:child_process";
import * as process from "node:process";
import { RUNTIME_CONFIG } from "../runtime-config.js";
import type { CommandHookDefinition, HookDecision, HookInvocation } from "./types.js";

function parseDecision(raw: string): HookDecision {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { action: "continue" };
  }
  const parsed = JSON.parse(trimmed) as Partial<HookDecision>;
  if (parsed.action === "block") {
    return { action: "block", reason: String((parsed as { reason?: unknown }).reason ?? "blocked by hook") };
  }
  if (parsed.action === "append_message") {
    return {
      action: "append_message",
      message: typeof (parsed as { message?: unknown }).message === "string" ? String((parsed as { message?: unknown }).message) : undefined,
      messages: Array.isArray((parsed as { messages?: unknown }).messages)
        ? ((parsed as { messages?: unknown[] }).messages ?? []).map((item) => String(item))
        : undefined,
    };
  }
  return { action: "continue" };
}

export async function runCommandHook(def: CommandHookDefinition, invocation: HookInvocation): Promise<HookDecision> {
  return new Promise((resolve) => {
    const child = spawn(def.command, def.args ?? [], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (decision: HookDecision): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(decision);
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ action: "continue" });
    }, RUNTIME_CONFIG.hookTimeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", () => {
      clearTimeout(timer);
      finish({ action: "continue" });
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        finish({ action: "continue" });
        return;
      }
      try {
        finish(parseDecision(stdout));
      } catch {
        void stderr;
        finish({ action: "continue" });
      }
    });

    child.stdin.write(JSON.stringify(invocation));
    child.stdin.end();
  });
}
