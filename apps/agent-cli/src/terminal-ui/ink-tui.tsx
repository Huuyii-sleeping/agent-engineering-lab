import { Box, Text } from "ink";
import { CliPaletteStore } from "../cli/palette.js";
import { renderCliGuideLines, renderCliShortcutLines } from "../cli/ui.js";
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

/** Structured view model consumed by the Ink/TSX terminal preview. */
export type InkTuiPreviewSnapshot = {
  title: string;
  badges: string[];
  status: Array<{ label: string; value: string }>;
  guide: string[];
  shortcuts: string[];
  paletteSummary: string[];
  footer: string;
};

/** Build the preview view model without depending on a live TTY. */
export function buildInkTuiPreviewSnapshot(
  input: InkTuiPreviewSnapshotInput = {},
): InkTuiPreviewSnapshot {
  const workflow = input.workflow ?? "agent";
  const sessionCount = input.sessionCount ?? 0;
  const activeSessionId = input.activeSessionId ?? null;
  const guide = renderCliGuideLines({
    composerActive: false,
    sessionCount,
    pendingApprovals: 0,
    workflow,
  });
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
    title: "Agent CLI Ink/TSX Preview",
    badges: ["tsx", "ink", "preview"],
    status: [
      { label: "model", value: input.model ?? "local-preview" },
      { label: "workflow", value: workflow },
      {
        label: "session",
        value: activeSessionId ? `${activeSessionId} (${sessionCount} total)` : "none",
      },
      { label: "tools", value: String(input.toolCount ?? 0) },
      { label: "bridge", value: input.bridgeEndpoint ?? "embedded" },
    ],
    guide: [
      ...guide.slice(0, 4),
      ...(guide.some((line) => line.includes("/palette or Ctrl+K"))
        ? []
        : ["palette   /palette or Ctrl+K launches local actions"]),
    ],
    shortcuts: [
      "q / Esc / Ctrl+C exit",
      ...renderCliShortcutLines({ composerActive: false })
        .slice(0, 4)
        .map((line) =>
          line.replace(/^ctrl\+([a-z])\s+/, (_match, key: string) => `Ctrl+${key.toUpperCase()} `),
        ),
    ],
    paletteSummary: [
      "feature disclosure",
      ...palette.candidates.slice(0, 4).map((candidate, index) => {
        return `[${index + 1}] ${candidate.command} - ${candidate.summary}`;
      }),
    ],
    footer: "Preview only: existing agent-cli tui remains unchanged.",
  };
}

/** Render the componentized terminal UI preview with Ink. */
export function InkTuiPreviewApp({ snapshot }: { snapshot: InkTuiPreviewSnapshot }) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1} flexDirection="column">
        <Text bold color="cyan">
          {snapshot.title}
        </Text>
        <Text color="green">{snapshot.badges.map((badge) => `[${badge}]`).join(" ")}</Text>
      </Box>

      <Box
        marginBottom={1}
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        paddingX={1}
      >
        <Text bold>Runtime</Text>
        {snapshot.status.map((item) => (
          <Text key={item.label}>
            {item.label.padEnd(9)}
            {item.value}
          </Text>
        ))}
      </Box>

      <Box
        marginBottom={1}
        flexDirection="column"
        borderStyle="round"
        borderColor="green"
        paddingX={1}
      >
        <Text bold>Guide</Text>
        {snapshot.guide.map((line) => (
          <Text key={line}>{line}</Text>
        ))}
      </Box>

      <Box
        marginBottom={1}
        flexDirection="column"
        borderStyle="round"
        borderColor="yellow"
        paddingX={1}
      >
        <Text bold>Palette Preview</Text>
        {snapshot.paletteSummary.map((line) => (
          <Text key={line}>{line}</Text>
        ))}
      </Box>

      <Box
        marginBottom={1}
        flexDirection="column"
        borderStyle="round"
        borderColor="magenta"
        paddingX={1}
      >
        <Text bold>Shortcuts</Text>
        {snapshot.shortcuts.map((line) => (
          <Text key={line}>{line}</Text>
        ))}
      </Box>

      <Text dimColor>{snapshot.footer}</Text>
    </Box>
  );
}
