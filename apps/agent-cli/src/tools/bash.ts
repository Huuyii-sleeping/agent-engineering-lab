import { exec, type ExecException } from "node:child_process";
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { RUNTIME_CONFIG } from "../runtime-config.js";

const DANGEROUS_SNIPPETS = ["rm -rf /", "sudo", "shutdown", "reboot"];
const SCRUBBED_ENV_KEYS = [
  "BASH_ENV",
  "ENV",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_ASKPASS",
  "GIT_CEILING_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_CONFIG",
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_SYSTEM",
  "GIT_DIR",
  "GIT_DISCOVERY_ACROSS_FILESYSTEM",
  "GIT_EXEC_PATH",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_OPTIONAL_LOCKS",
  "GIT_SSH",
  "GIT_SSH_COMMAND",
  "GIT_WORK_TREE",
  "PROMPT_COMMAND",
  "PS4",
  "SSH_ASKPASS",
];
const BARE_REPO_SCAN_SKIP = new Set([".codex", ".git", ".pnpm-store", "coverage", "dist", "node_modules"]);

type ToolError = {
  ok: false;
  error: {
    code: "DANGEROUS_COMMAND" | "TIMEOUT";
    message: string;
  };
};

export const BASH_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "bash",
      description: "Execute a shell command.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
        },
        required: ["command"],
      },
    },
  },
];

function toToolError(code: ToolError["error"]["code"], message: string): string {
  return JSON.stringify({ ok: false, error: { code, message } } satisfies ToolError);
}

function truncateOutput(value: string): string {
  const text = value.trim();
  if (!text) {
    return "(no output)";
  }
  if (text.length <= RUNTIME_CONFIG.bashMaxOutputChars) {
    return text;
  }
  return `${text.slice(0, RUNTIME_CONFIG.bashMaxOutputChars)}\n...[truncated to ${RUNTIME_CONFIG.bashMaxOutputChars} chars]`;
}

function scrubbedEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of SCRUBBED_ENV_KEYS) {
    delete env[key];
  }
  return env;
}

async function isBareRepoCandidate(target: string): Promise<boolean> {
  try {
    const [head, objects, refs] = await Promise.all([
      stat(path.join(target, "HEAD")),
      stat(path.join(target, "objects")),
      stat(path.join(target, "refs")),
    ]);
    return head.isFile() && objects.isDirectory() && refs.isDirectory() && path.basename(target) !== ".git";
  } catch {
    return false;
  }
}

async function collectBareRepoCandidates(root: string, depth = 0): Promise<Set<string>> {
  const found = new Set<string>();
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (BARE_REPO_SCAN_SKIP.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(root, entry.name);
    if (await isBareRepoCandidate(fullPath)) {
      found.add(fullPath);
      continue;
    }
    if (depth >= 4) {
      continue;
    }
    const nested = await collectBareRepoCandidates(fullPath, depth + 1);
    for (const item of nested) {
      found.add(item);
    }
  }
  return found;
}

async function createBareRepoScrubber(root: string): Promise<() => Promise<string[]>> {
  const before = await collectBareRepoCandidates(root);
  return async () => {
    const after = await collectBareRepoCandidates(root);
    const introduced = [...after].filter((candidate) => !before.has(candidate));
    for (const candidate of introduced) {
      await rm(candidate, { recursive: true, force: true }).catch(() => {});
    }
    return introduced.map((candidate) => path.relative(root, candidate) || candidate);
  };
}

export function readCommandArgs(argumentsJson: string): string {
  try {
    const parsed = JSON.parse(argumentsJson || "{}") as { command?: unknown };
    return String(parsed.command ?? "");
  } catch {
    return "";
  }
}

export function runBash(command: string): Promise<string> {
  if (DANGEROUS_SNIPPETS.some((snippet) => command.includes(snippet))) {
    return Promise.resolve(toToolError("DANGEROUS_COMMAND", "blocked dangerous command"));
  }

  return new Promise((resolve) => {
    void (async () => {
      const cwd = process.cwd();
      const scrubBareRepos = await createBareRepoScrubber(cwd);
      exec(
        command,
        {
          cwd,
          env: scrubbedEnvironment(),
          timeout: RUNTIME_CONFIG.bashTimeoutMs,
          windowsHide: true,
        },
        (error: ExecException | null, stdout: string, stderr: string) => {
          void (async () => {
            const scrubbed = await scrubBareRepos();
            if (error) {
              const timeoutError = (error as NodeJS.ErrnoException).code === "ETIMEDOUT";
              if (timeoutError) {
                resolve(toToolError("TIMEOUT", "command timed out"));
                return;
              }
            }
            const scrubNote =
              scrubbed.length > 0 ? `\n[security] scrubbed bare repo candidates: ${scrubbed.join(", ")}` : "";
            resolve(truncateOutput(`${stdout}${stderr}${scrubNote}`));
          })();
        },
      );
    })();
  });
}
