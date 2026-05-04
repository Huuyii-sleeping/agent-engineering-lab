import { exec, type ExecException } from "node:child_process";
import * as process from "node:process";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

const MAX_OUTPUT_CHARS = 50_000;
const BASH_TIMEOUT_MS = 120_000;
const DANGEROUS_SNIPPETS = ["rm -rf /", "sudo", "shutdown", "reboot"];

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
      description: "执行一个 shell 命令。",
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
  if (text.length <= MAX_OUTPUT_CHARS) {
    return text;
  }
  return `${text.slice(0, MAX_OUTPUT_CHARS)}\n...[truncated to ${MAX_OUTPUT_CHARS} chars]`;
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
    return Promise.resolve(toToolError("DANGEROUS_COMMAND", "已拦截危险命令"));
  }

  return new Promise((resolve) => {
    exec(
      command,
      {
        cwd: process.cwd(),
        timeout: BASH_TIMEOUT_MS,
        windowsHide: true,
      },
      (error: ExecException | null, stdout: string, stderr: string) => {
        if (error) {
          const timeoutError = (error as NodeJS.ErrnoException).code === "ETIMEDOUT";
          if (timeoutError) {
            resolve(toToolError("TIMEOUT", "命令执行超时（120秒）"));
            return;
          }
        }

        resolve(truncateOutput(`${stdout}${stderr}`));
      },
    );
  });
}
