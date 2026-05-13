import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { AgentService } from "../agent-service.js";
import { createAgentAppRuntime } from "../bootstrap/app-runtime.js";

export type TerminalTuiServiceLike = {
  bridgeManifest(): Record<string, unknown>;
  createSession(): { id: string };
  listSessions(): Array<{ id: string; busy: boolean; history: unknown[] }>;
  toolsMetadata(): Promise<Array<Record<string, string>>>;
  chat(input: { session_id?: string; message?: string }): Promise<Record<string, unknown>>;
};

export type TerminalTuiState = {
  activeSessionId: string | null;
  sessionCount: number;
  toolCount: number;
  bridgeEndpoint: string;
};

export function renderTerminalTuiDashboard(state: TerminalTuiState): string {
  return [
    "\u001b[2J\u001b[Hagent-cli TUI",
    "",
    `active session: ${state.activeSessionId ?? "(none)"}`,
    `sessions: ${state.sessionCount}`,
    `tools: ${state.toolCount}`,
    `bridge: ${state.bridgeEndpoint}`,
    "",
    "commands: /help /new /sessions /tools /use <session_id> /exit",
    "",
  ].join("\n");
}

function formatSessions(sessions: Array<{ id: string; busy: boolean; history: unknown[] }>, activeSessionId: string | null): string {
  if (sessions.length === 0) {
    return "no sessions";
  }
  return sessions
    .map((session) => {
      const active = session.id === activeSessionId ? "*" : " ";
      return `${active} ${session.id} messages=${session.history.length} busy=${session.busy}`;
    })
    .join("\n");
}

function formatTools(tools: Array<Record<string, string>>): string {
  if (tools.length === 0) {
    return "no tools";
  }
  return tools
    .map((tool) => `${tool.name ?? "(unnamed)"} [${tool.target ?? "unknown"}] ${tool.description ?? ""}`.trim())
    .join("\n");
}

export async function handleTerminalTuiCommand(input: {
  line: string;
  service: TerminalTuiServiceLike;
  activeSessionId: string | null;
}): Promise<{ activeSessionId: string | null; output: string; exit: boolean }> {
  const line = input.line.trim();
  if (!line) {
    return { activeSessionId: input.activeSessionId, output: "", exit: false };
  }
  if (line === "/exit" || line === "/quit") {
    return { activeSessionId: input.activeSessionId, output: "bye", exit: true };
  }
  if (line === "/help") {
    return {
      activeSessionId: input.activeSessionId,
      output: "commands: /help /new /sessions /tools /use <session_id> /exit",
      exit: false,
    };
  }
  if (line === "/new") {
    const session = input.service.createSession();
    return {
      activeSessionId: session.id,
      output: `created session ${session.id}`,
      exit: false,
    };
  }
  if (line === "/sessions") {
    return {
      activeSessionId: input.activeSessionId,
      output: formatSessions(input.service.listSessions(), input.activeSessionId),
      exit: false,
    };
  }
  if (line === "/tools") {
    return {
      activeSessionId: input.activeSessionId,
      output: formatTools(await input.service.toolsMetadata()),
      exit: false,
    };
  }
  if (line.startsWith("/use ")) {
    const sessionId = line.slice("/use ".length).trim();
    const found = input.service.listSessions().some((session) => session.id === sessionId);
    return {
      activeSessionId: found ? sessionId : input.activeSessionId,
      output: found ? `using session ${sessionId}` : `session not found: ${sessionId}`,
      exit: false,
    };
  }

  const result = await input.service.chat({
    session_id: input.activeSessionId ?? undefined,
    message: line,
  });
  const session = result.session as { id?: unknown } | undefined;
  const nextSessionId = typeof session?.id === "string" ? session.id : input.activeSessionId;
  if (result.ok === false) {
    const error = result.error as { message?: unknown } | undefined;
    return {
      activeSessionId: nextSessionId,
      output: `error: ${String(error?.message ?? "chat failed")}`,
      exit: false,
    };
  }
  return {
    activeSessionId: nextSessionId,
    output: String(result.assistant ?? ""),
    exit: false,
  };
}

export type TerminalTuiOptions = {
  service?: TerminalTuiServiceLike;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
};

export async function runTerminalTui(opts: TerminalTuiOptions = {}): Promise<void> {
  const service = opts.service ?? new AgentService(createAgentAppRuntime());
  const input = opts.input ?? stdin;
  const output = opts.output ?? stdout;
  let activeSessionId: string | null = null;

  const tools = await service.toolsMetadata();
  output.write(
    renderTerminalTuiDashboard({
      activeSessionId,
      sessionCount: service.listSessions().length,
      toolCount: tools.length,
      bridgeEndpoint: String(
        (service.bridgeManifest().endpoints as { events?: unknown } | undefined)?.events ?? "/events",
      ),
    }),
  );

  const rl = createInterface({ input, output });
  try {
    while (true) {
      const line = await rl.question("agent:tui > ");
      const result = await handleTerminalTuiCommand({ line, service, activeSessionId });
      activeSessionId = result.activeSessionId;
      if (result.output) {
        output.write(`${result.output}\n`);
      }
      if (result.exit) {
        break;
      }
    }
  } finally {
    rl.close();
  }
}
