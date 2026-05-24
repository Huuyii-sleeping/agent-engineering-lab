import { readFileSync } from "node:fs";
import * as process from "node:process";

type CliMode =
  | "interactive"
  | "help"
  | "version"
  | "server"
  | "daemon"
  | "daemon-status"
  | "daemon-stop"
  | "print"
  | "mcp-server"
  | "tui"
  | "tui-ink"
  | "architecture"
  | "data-usage"
  | "dump-system-prompt";

export type CliInvocation =
  | { mode: "interactive" }
  | { mode: "help" }
  | { mode: "version" }
  | { mode: "server" }
  | { mode: "daemon" }
  | { mode: "daemon-status" }
  | { mode: "daemon-stop" }
  | { mode: "print"; prompt: string }
  | { mode: "mcp-server" }
  | { mode: "tui" }
  | { mode: "tui-ink" }
  | { mode: "architecture" }
  | { mode: "data-usage" }
  | { mode: "dump-system-prompt" };

export type CliIo = {
  stdin: NodeJS.ReadableStream & { isTTY?: boolean };
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
};

function readPackageVersion(): string {
  try {
    const packageJsonUrl = new URL("../../package.json", import.meta.url);
    const packageJson = JSON.parse(readFileSync(packageJsonUrl, "utf8")) as { version?: unknown };
    return typeof packageJson.version === "string" ? packageJson.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function renderCliHelp(): string {
  return [
    "agent-cli",
    "",
    "Usage:",
    "  agent-cli                       Start interactive CLI",
    "  agent-cli --print <prompt>      Run one headless query",
    "  agent-cli print <prompt>        Run one headless query",
    "  agent-cli server                Start HTTP service",
    "  agent-cli daemon                Start background daemon host",
    "  agent-cli daemon status         Check daemon host status",
    "  agent-cli daemon stop           Stop the running daemon host",
    "  agent-cli mcp-server            Start stdio MCP server",
    "  agent-cli tui                   Start terminal TUI console",
    "  agent-cli tui-ink               Start Ink/TSX terminal UI preview",
    "  agent-cli architecture          Print the local architecture overview",
    "  agent-cli data-usage            Print the local user data governance overview",
    "  agent-cli dump-system-prompt    Print the current stable system prompt",
    "  agent-cli --version             Print version",
    "  agent-cli --help                Print help",
    "",
  ].join("\n");
}

export function parseCliInvocation(argv: string[]): CliInvocation {
  const [mode, ...rest] = argv;
  if (!mode) {
    return { mode: "interactive" };
  }

  const normalized = mode.trim();
  if (normalized === "--help" || normalized === "-h" || normalized === "help") {
    return { mode: "help" };
  }
  if (normalized === "--version" || normalized === "-v" || normalized === "version") {
    return { mode: "version" };
  }
  if (normalized === "--server" || normalized === "server") {
    return { mode: "server" };
  }
  if (normalized === "--daemon" || normalized === "daemon") {
    if (rest[0]?.trim() === "status") {
      return { mode: "daemon-status" };
    }
    if (rest[0]?.trim() === "stop") {
      return { mode: "daemon-stop" };
    }
    return { mode: "daemon" };
  }
  if (normalized === "--mcp-server" || normalized === "mcp-server") {
    return { mode: "mcp-server" };
  }
  if (normalized === "--tui" || normalized === "tui") {
    return { mode: "tui" };
  }
  if (normalized === "--tui-ink" || normalized === "tui-ink") {
    return { mode: "tui-ink" };
  }
  if (normalized === "--architecture" || normalized === "architecture") {
    return { mode: "architecture" };
  }
  if (normalized === "--data-usage" || normalized === "data-usage") {
    return { mode: "data-usage" };
  }
  if (normalized === "--dump-system-prompt" || normalized === "dump-system-prompt") {
    return { mode: "dump-system-prompt" };
  }
  if (normalized === "--print" || normalized === "-p" || normalized === "print") {
    return { mode: "print", prompt: rest.join(" ").trim() };
  }

  return { mode: "interactive" };
}

async function readStdin(input: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function resolvePrintPrompt(
  invocation: Extract<CliInvocation, { mode: "print" }>,
  io: CliIo,
): Promise<string> {
  if (invocation.prompt) {
    return invocation.prompt;
  }
  if (io.stdin.isTTY) {
    return "";
  }
  return readStdin(io.stdin);
}

export async function dispatchCli(
  argv: string[] = process.argv.slice(2),
  io: CliIo = { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr },
): Promise<number> {
  const invocation = parseCliInvocation(argv);

  if (invocation.mode === "help") {
    io.stdout.write(renderCliHelp());
    return 0;
  }
  if (invocation.mode === "version") {
    io.stdout.write(`${readPackageVersion()}\n`);
    return 0;
  }
  if (invocation.mode === "server") {
    const { runServer } = await import("../service-api/server.js");
    await runServer();
    return 0;
  }
  if (invocation.mode === "daemon") {
    const { runDaemon } = await import("./daemon.js");
    await runDaemon({ output: io.stdout, errorOutput: io.stderr });
    return 0;
  }
  if (invocation.mode === "daemon-status") {
    const { runDaemonStatus } = await import("./daemon-status.js");
    return runDaemonStatus({ output: io.stdout });
  }
  if (invocation.mode === "daemon-stop") {
    const { runDaemonStop } = await import("./daemon-stop.js");
    return runDaemonStop({ output: io.stdout });
  }
  if (invocation.mode === "mcp-server") {
    const { runAgentMcpServer } = await import("./mcp-server.js");
    await runAgentMcpServer({ input: io.stdin, output: io.stdout });
    return 0;
  }
  if (invocation.mode === "tui") {
    const { runTerminalTui } = await import("./tui.js");
    await runTerminalTui({ input: io.stdin, output: io.stdout });
    return 0;
  }
  if (invocation.mode === "tui-ink") {
    const { runInkTerminalTui } = await import("./tui-ink.js");
    await runInkTerminalTui({ input: io.stdin, output: io.stdout, errorOutput: io.stderr });
    return 0;
  }
  if (invocation.mode === "architecture") {
    const { runArchitectureOverview } = await import("./architecture.js");
    await runArchitectureOverview({ output: io.stdout });
    return 0;
  }
  if (invocation.mode === "data-usage") {
    const { runUserDataUsageOverview } = await import("./data-usage.js");
    await runUserDataUsageOverview({ output: io.stdout });
    return 0;
  }
  if (invocation.mode === "dump-system-prompt") {
    const { runDumpSystemPrompt } = await import("./dump-system-prompt.js");
    await runDumpSystemPrompt({ output: io.stdout });
    return 0;
  }
  if (invocation.mode === "print") {
    const prompt = await resolvePrintPrompt(invocation, io);
    if (!prompt) {
      io.stderr.write("prompt is required for --print\n");
      return 2;
    }
    const { runHeadlessQuery } = await import("./headless.js");
    return runHeadlessQuery({ prompt, output: io.stdout, errorOutput: io.stderr });
  }

  const { runCli } = await import("../cli/index.js");
  await runCli();
  return 0;
}

export type { CliMode };
