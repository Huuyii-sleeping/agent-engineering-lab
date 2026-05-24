import { Box, Text } from "ink";
import { CliPaletteStore } from "../cli/palette.js";
import type { CliWorkflowMode } from "../cli/workflow.js";

/** Input used to build a deterministic Ink TUI preview snapshot. */
export type InkTuiPreviewSnapshotInput = {
  model?: string;
  workflow?: CliWorkflowMode;
  activeSessionId?: string | null;
  sessionCount?: number;
  toolCount?: number;
  bridgeEndpoint?: string;
};

export type InkTuiPreviewMessage = {
  role: "user" | "assistant" | "system" | "tool";
  marker: string;
  text: string;
  tone: "user" | "assistant" | "muted" | "accent";
};

/** Structured view model consumed by the Ink/TSX terminal preview. */
export type InkTuiPreviewSnapshot = {
  byline: string;
  messages: InkTuiPreviewMessage[];
  slashPane: {
    title: string;
    items: string[];
  };
  statusLine: string;
  prompt: {
    mode: string;
    placeholder: string;
    value: string;
  };
  footerHints: string[];
};

/** Build the preview view model without depending on a live TTY. */
export function buildInkTuiPreviewSnapshot(
  input: InkTuiPreviewSnapshotInput = {},
): InkTuiPreviewSnapshot {
  const workflow = input.workflow ?? "agent";
  const sessionCount = input.sessionCount ?? 0;
  const activeSessionId = input.activeSessionId ?? null;
  const palette = new CliPaletteStore().search(
    activeSessionId,
    {
      sessions: activeSessionId
        ? [{ id: activeSessionId, messageCount: 0, busy: false, active: true }]
        : [],
      helpTopics: [
        "draft",
        "sessions",
        "runtime",
        "features",
        "approvals",
        "transcript",
        "workflow",
        "palette",
        "all",
      ],
      composerActive: false,
      pendingApprovals: 0,
      workflow,
    },
    "feature",
  );

  return {
    byline: "Agent CLI - Ink/TSX REPL preview",
    messages: [
      {
        role: "system",
        marker: "!",
        text: "tui-ink is a component preview; the existing agent-cli tui remains unchanged.",
        tone: "muted",
      },
      {
        role: "user",
        marker: ">",
        text: "Build with TSX terminal components",
        tone: "user",
      },
      {
        role: "assistant",
        marker: "*",
        text: "Rendering a REPL-style surface: message stream, slash pane, statusline, prompt, footer.",
        tone: "assistant",
      },
      {
        role: "tool",
        marker: "$",
        text: `palette search returned ${palette.total} feature disclosure candidate(s).`,
        tone: "accent",
      },
    ],
    slashPane: {
      title: "/palette feature",
      items: [
        ...palette.candidates
          .slice(0, 3)
          .map((candidate) => `${candidate.command}  ${candidate.summary}`),
        "/features  feature disclosure",
      ].filter((item, index, items) => items.indexOf(item) === index),
    },
    statusLine: [
      `model ${input.model ?? "local-preview"}`,
      `workflow ${workflow}`,
      `session ${activeSessionId ? `${activeSessionId}/${sessionCount}` : "none"}`,
      `tools ${input.toolCount ?? 0}`,
      `bridge ${input.bridgeEndpoint ?? "embedded"}`,
    ].join("  |  "),
    prompt: {
      mode: "agent",
      placeholder: "Type a message, / for commands, ! for shell",
      value: "",
    },
    footerHints: ["Ctrl+K palette", "Ctrl+G help", "Shift+Tab mode", "q exit"],
  };
}

/** Render the componentized terminal UI preview with Ink. */
export function InkTuiPreviewApp({ snapshot }: { snapshot: InkTuiPreviewSnapshot }) {
  return (
    <Box flexDirection="column" paddingX={1} width="100%">
      <Box marginBottom={1}>
        <Text bold>{snapshot.byline}</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {snapshot.messages.map((message, index) => (
          <MessageRow key={`${message.role}-${index}`} message={message} />
        ))}
      </Box>

      <SlashPane title={snapshot.slashPane.title} items={snapshot.slashPane.items} />

      <Box paddingX={1} marginTop={1}>
        <Text dimColor wrap="truncate">
          {snapshot.statusLine}
        </Text>
      </Box>

      <Box
        flexDirection="row"
        alignItems="flex-start"
        borderColor="cyan"
        borderStyle="round"
        borderLeft={false}
        borderRight={false}
        borderBottom
        width="100%"
        paddingX={1}
      >
        <Text color="cyan">{snapshot.prompt.mode.padEnd(7)}</Text>
        <Box flexGrow={1}>
          <Text dimColor>{snapshot.prompt.value || snapshot.prompt.placeholder}</Text>
        </Box>
      </Box>

      <Box paddingX={1}>
        <Text dimColor>{snapshot.footerHints.join("  |  ")}</Text>
      </Box>
    </Box>
  );
}

function MessageRow({ message }: { message: InkTuiPreviewMessage }) {
  const markerColor =
    message.tone === "user" ? "cyan" : message.tone === "accent" ? "yellow" : undefined;
  const textColor =
    message.tone === "assistant" ? "green" : message.tone === "accent" ? "yellow" : undefined;
  return (
    <Box flexDirection="row" width="100%" marginBottom={message.role === "assistant" ? 1 : 0}>
      <Box minWidth={3}>
        <Text color={markerColor} dimColor={message.tone === "muted"}>
          {message.marker}
        </Text>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        <Text color={textColor} dimColor={message.tone === "muted"}>
          {message.text}
        </Text>
      </Box>
    </Box>
  );
}

function SlashPane({ title, items }: { title: string; items: string[] }) {
  return (
    <Box flexDirection="column" marginTop={1} paddingX={2}>
      <Text color="cyan">-------------------------------------------------------- {title}</Text>
      {items.map((item) => (
        <Text key={item} dimColor>
          {item}
        </Text>
      ))}
    </Box>
  );
}
