import { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
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
  extraMessages?: InkTuiPreviewMessage[];
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
    cursorIndex?: number;
  };
  footerHints: string[];
};

export type InkTuiInputState = {
  draft: string;
  cursorIndex?: number;
  messages: InkTuiPreviewMessage[];
  shouldExit: boolean;
};

export type InkTuiInputEvent = {
  input?: string;
  key?: {
    backspace?: boolean;
    delete?: boolean;
    return?: boolean;
    escape?: boolean;
    ctrl?: boolean;
    leftArrow?: boolean;
    rightArrow?: boolean;
    home?: boolean;
    end?: boolean;
    name?: string;
  };
};

export type InkPromptInputRender = {
  draft: string;
  placeholder: string;
  cursor: string;
  visibleText: string;
  beforeCursor: string;
  afterCursor: string;
  cursorIndex: number;
  empty: boolean;
};

function splitDraft(draft: string): string[] {
  return Array.from(draft);
}

function clampCursorIndex(draft: string, cursorIndex: number | undefined): number {
  const max = splitDraft(draft).length;
  if (typeof cursorIndex !== "number" || !Number.isFinite(cursorIndex)) {
    return max;
  }
  return Math.max(0, Math.min(Math.trunc(cursorIndex), max));
}

function replaceDraft(chars: string[], cursorIndex: number): Pick<InkTuiInputState, "draft" | "cursorIndex"> {
  return {
    draft: chars.join(""),
    cursorIndex,
  };
}

/** Build a stable prompt input render model so cursor placement is testable outside a TTY. */
export function renderInkPromptInput({
  draft,
  cursorIndex,
  placeholder,
  showCursor,
}: {
  draft: string;
  cursorIndex?: number;
  placeholder: string;
  showCursor: boolean;
}): InkPromptInputRender {
  const empty = draft.length === 0;
  const chars = splitDraft(draft);
  const resolvedCursorIndex = clampCursorIndex(draft, cursorIndex);
  const cursor = showCursor ? "▌" : "";
  const beforeCursor = chars.slice(0, resolvedCursorIndex).join("");
  const afterCursor = chars.slice(resolvedCursorIndex).join("");
  return {
    draft,
    placeholder: empty ? placeholder : "",
    cursor,
    visibleText: empty ? `${cursor}${placeholder}` : `${beforeCursor}${cursor}${afterCursor}`,
    beforeCursor,
    afterCursor,
    cursorIndex: resolvedCursorIndex,
    empty,
  };
}

export function createPreviewResponse(input: string): InkTuiPreviewMessage {
  return {
    role: "assistant",
    marker: "*",
    text: `submitted "${input}" to the CLI runtime; no output was produced.`,
    tone: "assistant",
  };
}

/** Reduce prompt keystrokes without depending on Ink runtime state. */
export function reduceInkTuiInput(state: InkTuiInputState, event: InkTuiInputEvent): InkTuiInputState {
  const draft = state.draft;
  const chars = splitDraft(draft);
  const cursorIndex = clampCursorIndex(draft, state.cursorIndex);
  if (event.key?.return) {
    const line = draft.trim();
    if (!line) {
      return { ...state, draft: "", cursorIndex: 0 };
    }
    return {
      draft: "",
      cursorIndex: 0,
      shouldExit: false,
      messages: [
        ...state.messages,
        { role: "user", marker: ">", text: draft, tone: "user" },
        createPreviewResponse(draft),
      ],
    };
  }
  if (event.key?.leftArrow) {
    return { ...state, cursorIndex: Math.max(0, cursorIndex - 1) };
  }
  if (event.key?.rightArrow) {
    return { ...state, cursorIndex: Math.min(chars.length, cursorIndex + 1) };
  }
  if (event.key?.home) {
    return { ...state, cursorIndex: 0 };
  }
  if (event.key?.end) {
    return { ...state, cursorIndex: chars.length };
  }
  if (event.key?.backspace || event.key?.name === "backspace") {
    if (cursorIndex === 0) {
      return { ...state, cursorIndex };
    }
    const nextChars = [...chars.slice(0, cursorIndex - 1), ...chars.slice(cursorIndex)];
    return { ...state, ...replaceDraft(nextChars, cursorIndex - 1) };
  }
  if (event.key?.delete) {
    if (cursorIndex >= chars.length) {
      return { ...state, cursorIndex };
    }
    const nextChars = [...chars.slice(0, cursorIndex), ...chars.slice(cursorIndex + 1)];
    return { ...state, ...replaceDraft(nextChars, cursorIndex) };
  }
  if (event.key?.escape || (event.key?.ctrl && event.input === "c")) {
    return draft.length === 0 ? { ...state, shouldExit: true } : state;
  }
  if (event.input === "q" && draft.length === 0) {
    return { ...state, shouldExit: true };
  }
  if (event.input && !event.key?.ctrl) {
    const inputChars = splitDraft(event.input);
    const nextChars = [...chars.slice(0, cursorIndex), ...inputChars, ...chars.slice(cursorIndex)];
    return { ...state, ...replaceDraft(nextChars, cursorIndex + inputChars.length) };
  }
  return state;
}

/** Append scheduled messages without changing React state when there is nothing to render. */
export function mergeInkTuiScheduledMessages(
  state: InkTuiInputState,
  messages: InkTuiPreviewMessage[],
): InkTuiInputState {
  if (messages.length === 0) {
    return state;
  }
  return {
    ...state,
    messages: [...state.messages, ...messages],
  };
}

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
    byline: "Agent CLI - Ink/TSX interactive CLI",
    messages: [
      {
        role: "system",
        marker: "!",
        text: "Ink/TSX surface is the default interactive CLI. Use agent-cli classic for readline fallback.",
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
      ...(input.extraMessages ?? []),
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
      `model ${input.model ?? "local-runtime"}`,
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

/** Render the componentized terminal CLI surface with Ink. */
export function InkTuiPreviewApp({
  snapshot,
  onSubmitInput,
  onScheduledTick,
  onExit,
  interactive = true,
  schedulerIntervalMs,
}: {
  snapshot: InkTuiPreviewSnapshot;
  onSubmitInput?: (line: string) => Promise<InkTuiPreviewMessage[]>;
  onScheduledTick?: () => Promise<InkTuiPreviewMessage[]>;
  onExit?: () => void;
  interactive?: boolean;
  schedulerIntervalMs?: number;
}) {
  const [state, setState] = useState<InkTuiInputState>({
    draft: snapshot.prompt.value,
    cursorIndex: clampCursorIndex(snapshot.prompt.value, snapshot.prompt.cursorIndex),
    messages: snapshot.messages,
    shouldExit: false,
  });
  const [busy, setBusy] = useState(false);
  const scheduledBusyRef = useRef(false);

  useEffect(() => {
    if (!interactive || !onScheduledTick || !schedulerIntervalMs) {
      return;
    }
    const interval = setInterval(() => {
      if (scheduledBusyRef.current) {
        return;
      }
      scheduledBusyRef.current = true;
      void onScheduledTick()
        .then((messages) => {
          if (messages.length === 0) {
            return;
          }
          setState((current) => mergeInkTuiScheduledMessages(current, messages));
        })
        .finally(() => {
          scheduledBusyRef.current = false;
        });
    }, schedulerIntervalMs);
    return () => clearInterval(interval);
  }, [interactive, onScheduledTick, schedulerIntervalMs]);

  useInput(
    (input, key) => {
      if (busy) {
        return;
      }
      const next = reduceInkTuiInput(state, { input, key });
      if (next.shouldExit) {
        onExit?.();
        return;
      }
      if (key.return && state.draft.trim()) {
        const submitted = state.draft;
        const userMessage: InkTuiPreviewMessage = {
          role: "user",
          marker: ">",
          text: submitted,
          tone: "user",
        };
        setState({ draft: "", cursorIndex: 0, shouldExit: false, messages: [...state.messages, userMessage] });
        if (onSubmitInput) {
          setBusy(true);
          void onSubmitInput(submitted)
            .then((messages) => {
              setState((current) => ({
                ...current,
                messages: [...current.messages, ...messages],
              }));
            })
            .finally(() => setBusy(false));
        } else {
          setState(next);
        }
        return;
      }
      setState(next);
    },
    { isActive: interactive },
  );

  const promptInput = renderInkPromptInput({
    draft: state.draft,
    cursorIndex: state.cursorIndex,
    placeholder: snapshot.prompt.placeholder,
    showCursor: interactive,
  });

  return (
    <Box flexDirection="column" paddingX={1} width="100%">
      <Box marginBottom={1}>
        <Text bold>{snapshot.byline}</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {state.messages.map((message, index) => (
          <MessageRow key={`${message.role}-${index}`} message={message} />
        ))}
        {busy ? <MessageRow message={{ role: "system", marker: ".", text: "running...", tone: "muted" }} /> : null}
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
          {promptInput.empty ? (
            <Text>
              <Text color="cyan">
                {promptInput.cursor}
              </Text>
              <Text dimColor>{promptInput.placeholder}</Text>
            </Text>
          ) : (
            <Text>
              {promptInput.beforeCursor}
              <Text color="cyan">
                {promptInput.cursor}
              </Text>
              {promptInput.afterCursor}
            </Text>
          )}
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
