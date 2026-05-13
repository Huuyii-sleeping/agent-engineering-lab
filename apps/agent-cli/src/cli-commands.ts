import {
  renderCliCompactSummary,
  renderCliConfig,
  renderCliDoctor,
  renderCliError,
  renderCliHelp,
  renderCliPermissions,
  renderCliSessions,
  renderCliStatus,
  renderCliTools,
  renderCliUsage,
  type CliCompactSummary,
  type CliConfigSnapshot,
  type CliPermissionSnapshot,
  type CliSessionSummary,
  type CliStatusSnapshot,
  type CliThemeName,
  type CliUsageSnapshot,
} from "./cli-ui.js";
import type { CliDoctorReport } from "./cli-ui.js";
import type { CliPermissionMode } from "./cli-permissions.js";

export type CliCommandResult =
  | { handled: false }
  | {
      handled: true;
      output: string;
      clearScreen?: boolean;
      exit?: boolean;
      showBanner?: boolean;
      nextSessionId?: string | null;
    };

export type CliCommandContext = {
  activeSessionId: string | null;
  createSession(): { id: string };
  listSessions(): CliSessionSummary[];
  useSession(sessionId: string): boolean;
  listTools(): Promise<Array<Record<string, string>>>;
  getStatus(): Promise<CliStatusSnapshot>;
  getConfig(): Promise<CliConfigSnapshot>;
  getPermissions(): Promise<CliPermissionSnapshot>;
  setPermissionMode(mode: CliPermissionMode): boolean;
  getUsage(): Promise<CliUsageSnapshot>;
  compactSession(keepRecent?: number): Promise<CliCompactSummary>;
  getModel(): string;
  setModel(model: string): Promise<boolean>;
  addWorkspaceRoot(root: string): Promise<{ ok: true; root: string } | { ok: false; error: string }>;
  runDoctor(): Promise<CliDoctorReport>;
  getTheme(): CliThemeName;
  setTheme(theme: CliThemeName): boolean;
};

function parseArgs(input: string): { command: string; args: string[] } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }
  const [command, ...args] = trimmed.slice(1).split(/\s+/).filter(Boolean);
  return { command: (command ?? "").toLowerCase(), args };
}

export async function dispatchCliCommand(
  input: string,
  context: CliCommandContext,
): Promise<CliCommandResult> {
  const parsed = parseArgs(input);
  if (!parsed) {
    return { handled: false };
  }

  if (parsed.command === "help") {
    return { handled: true, output: renderCliHelp() };
  }
  if (parsed.command === "status") {
    return { handled: true, output: renderCliStatus(await context.getStatus()) };
  }
  if (parsed.command === "config") {
    return { handled: true, output: renderCliConfig(await context.getConfig()) };
  }
  if (parsed.command === "model") {
    const nextModel = parsed.args.join(" ").trim();
    if (!nextModel) {
      return { handled: true, output: `model: ${context.getModel()}` };
    }
    const changed = await context.setModel(nextModel);
    if (!changed) {
      return {
        handled: true,
        output: renderCliError("model update failed", `unable to switch to model: ${nextModel}`),
      };
    }
    return {
      handled: true,
      output: `model set to ${nextModel}`,
      showBanner: true,
    };
  }
  if (parsed.command === "permissions") {
    const nextMode = parsed.args[0]?.trim().toLowerCase();
    if (!nextMode) {
      return { handled: true, output: renderCliPermissions(await context.getPermissions()) };
    }
    if (nextMode !== "default" && nextMode !== "accept-edits" && nextMode !== "plan") {
      return {
        handled: true,
        output: renderCliError(
          "unknown permission mode",
          `unsupported permission mode: ${nextMode}`,
          "use /permissions default | accept-edits | plan",
        ),
      };
    }
    context.setPermissionMode(nextMode);
    return {
      handled: true,
      output: renderCliPermissions(await context.getPermissions()),
      showBanner: true,
    };
  }
  if (parsed.command === "cost" || parsed.command === "usage") {
    return { handled: true, output: renderCliUsage(await context.getUsage()) };
  }
  if (parsed.command === "compact") {
    const keepRecent = parsed.args[0] ? Number(parsed.args[0]) : undefined;
    if (parsed.args[0] && (!Number.isInteger(keepRecent) || Number(keepRecent) <= 0)) {
      return {
        handled: true,
        output: renderCliError("invalid keep_recent", `unsupported value: ${parsed.args[0]}`, "use /compact or /compact 20"),
      };
    }
    return {
      handled: true,
      output: renderCliCompactSummary(await context.compactSession(keepRecent)),
    };
  }
  if (parsed.command === "add-dir") {
    const root = parsed.args.join(" ").trim();
    if (!root) {
      return {
        handled: true,
        output: renderCliError("missing path", "use /add-dir <directory>"),
      };
    }
    const added = await context.addWorkspaceRoot(root);
    if (!added.ok) {
      return {
        handled: true,
        output: renderCliError("add-dir failed", added.error),
      };
    }
    return {
      handled: true,
      output: `added workspace root ${added.root}`,
      showBanner: true,
    };
  }
  if (parsed.command === "tools") {
    return { handled: true, output: renderCliTools(await context.listTools()) };
  }
  if (parsed.command === "sessions") {
    return { handled: true, output: renderCliSessions(context.listSessions()) };
  }
  if (parsed.command === "doctor") {
    return { handled: true, output: renderCliDoctor(await context.runDoctor()) };
  }
  if (parsed.command === "theme") {
    const nextTheme = parsed.args[0]?.toLowerCase();
    if (!nextTheme) {
      return { handled: true, output: `theme: ${context.getTheme()}` };
    }
    if (nextTheme !== "atlas" && nextTheme !== "plain") {
      return {
        handled: true,
        output: renderCliError("unknown theme", `unsupported theme: ${nextTheme}`, "use /theme atlas or /theme plain"),
      };
    }
    context.setTheme(nextTheme);
    return {
      handled: true,
      output: `theme set to ${nextTheme}`,
      clearScreen: true,
      showBanner: true,
    };
  }
  if (parsed.command === "redraw") {
    return {
      handled: true,
      output: "",
      clearScreen: true,
      showBanner: true,
    };
  }
  if (parsed.command === "clear" || parsed.command === "new") {
    const session = context.createSession();
    return {
      handled: true,
      output: `started fresh session ${session.id}`,
      showBanner: true,
      nextSessionId: session.id,
      clearScreen: parsed.command === "clear",
    };
  }
  if (parsed.command === "use") {
    const sessionId = parsed.args[0]?.trim() ?? "";
    if (!sessionId) {
      return {
        handled: true,
        output: renderCliError("missing session id", "use /use <session_id>"),
      };
    }
    if (!context.useSession(sessionId)) {
      return {
        handled: true,
        output: renderCliError("session not found", `unknown session: ${sessionId}`, "run /sessions to inspect available sessions"),
      };
    }
    return {
      handled: true,
      output: `using session ${sessionId}`,
      showBanner: true,
      nextSessionId: sessionId,
    };
  }
  if (parsed.command === "exit" || parsed.command === "quit") {
    return { handled: true, output: "bye", exit: true };
  }

  return {
    handled: true,
    output: renderCliError("unknown command", `/${parsed.command} is not available`, "run /help for the supported command set"),
  };
}
