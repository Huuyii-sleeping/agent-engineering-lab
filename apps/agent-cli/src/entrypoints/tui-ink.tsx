import type { ReadStream, WriteStream } from "node:tty";
import { render } from "ink";
import type OpenAI from "openai";
import { createAgentAppRuntime } from "../bootstrap/app-runtime.js";
import { CliComposerStore } from "../cli/composer.js";
import { CliPaletteStore } from "../cli/palette.js";
import { CliTranscriptBrowserStore } from "../cli/transcript.js";
import type { CliWorkflowMode } from "../cli/workflow.js";
import { createClient, getStaticPromptSource } from "../config.js";
import { AgentService } from "../service-api/index.js";
import {
  handleTerminalTuiCommand,
  resolveDaemonTuiService,
  type DaemonTuiServiceResolution,
  type TerminalTuiServiceLike,
} from "./tui.js";
import {
  InkTuiPreviewApp,
  buildInkTuiPreviewSnapshot,
  createPreviewResponse,
  type InkTuiPreviewMessage,
} from "../terminal-ui/ink-tui.js";

export type InkTerminalTuiIo = {
  input: NodeJS.ReadableStream & { isTTY?: boolean };
  output: NodeJS.WritableStream;
  errorOutput?: NodeJS.WritableStream;
  service?: TerminalTuiServiceLike;
  resolveDaemonService?: () => Promise<DaemonTuiServiceResolution | null>;
};

async function readStdin(input: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function outputToMessage(line: string, output: string): InkTuiPreviewMessage {
  return {
    role: line.startsWith("/") || line.startsWith("!") ? "tool" : "assistant",
    marker: line.startsWith("/") || line.startsWith("!") ? "$" : "*",
    text: output.trim() || `handled ${line}`,
    tone: line.startsWith("/") || line.startsWith("!") ? "accent" : "assistant",
  };
}

async function createInkService(input: InkTerminalTuiIo): Promise<{
  service: TerminalTuiServiceLike;
  startupIssue: Error | null;
}> {
  if (input.service) {
    return { service: input.service, startupIssue: null };
  }
  const resolved = await (input.resolveDaemonService ?? (() => resolveDaemonTuiService()))().catch(
    () => null,
  );
  if (resolved) {
    return { service: resolved.service, startupIssue: null };
  }
  try {
    return { service: new AgentService(createAgentAppRuntime()), startupIssue: null };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing environment variable: MODEL_ID")) {
      return {
        service: new AgentService(
          createAgentAppRuntime({
            client: {} as OpenAI,
            model: "unset-model",
            promptSource: getStaticPromptSource(),
          }),
        ),
        startupIssue: error,
      };
    }
    throw error;
  }
}

function createInkCommandRunner(service: TerminalTuiServiceLike, startupIssue: Error | null) {
  const composer = new CliComposerStore();
  const paletteStore = new CliPaletteStore();
  const transcriptBrowser = new CliTranscriptBrowserStore();
  let activeSessionId: string | null = null;
  let workflow: CliWorkflowMode = "agent";
  let currentModel = service instanceof AgentService ? process.env.MODEL_ID?.trim() || "unset-model" : "daemon-host";

  return async (line: string): Promise<{ messages: InkTuiPreviewMessage[]; exit: boolean }> => {
    const result = await handleTerminalTuiCommand({
      line,
      service,
      activeSessionId,
      model: currentModel,
      workflow,
      startupIssue,
      setModel: async (model) => {
        process.env.MODEL_ID = model;
        currentModel = model;
        return false;
      },
      setWorkflow: (nextWorkflow) => {
        workflow = nextWorkflow;
        return true;
      },
      composer,
      paletteStore,
      transcriptBrowser,
    });
    activeSessionId = result.activeSessionId;
    workflow = result.workflow;
    return {
      exit: result.exit,
      messages: result.output.trim()
        ? [outputToMessage(line, result.output)]
        : [createPreviewResponse(line)],
    };
  };
}

async function runScriptedInput(script: string, submit: (line: string) => Promise<{ messages: InkTuiPreviewMessage[]; exit: boolean }>): Promise<InkTuiPreviewMessage[]> {
  const messages: InkTuiPreviewMessage[] = [];
  for (const rawLine of script.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (line === "q" || line === "exit" || line === "\u001b" || line === "\u0003") {
      break;
    }
    messages.push({ role: "user", marker: ">", text: rawLine, tone: "user" });
    const result = await submit(rawLine);
    messages.push(...result.messages);
    if (result.exit) {
      break;
    }
  }
  return messages;
}

/** Start the Ink/TSX terminal CLI surface. */
export async function runInkTerminalTui(input: InkTerminalTuiIo): Promise<void> {
  const { service, startupIssue } = await createInkService(input);
  const submit = createInkCommandRunner(service, startupIssue);
  if (!input.input.isTTY) {
    const script = await readStdin(input.input);
    const extraMessages = await runScriptedInput(script, submit);
    const app = render(
      <InkTuiPreviewApp snapshot={buildInkTuiPreviewSnapshot({ extraMessages })} interactive={false} />,
      {
        stdin: input.input as ReadStream,
        stdout: input.output as WriteStream,
        stderr: input.errorOutput as WriteStream | undefined,
        exitOnCtrlC: false,
      },
    );
    app.unmount();
    return;
  }

  const snapshot = buildInkTuiPreviewSnapshot();

  await new Promise<void>((resolve) => {
    let settled = false;
    const renderOptions: Parameters<typeof render>[1] = {
      // Ink's public types are TTY-specific, while the CLI dispatcher keeps IO injectable.
      stdin: input.input as ReadStream,
      stdout: input.output as WriteStream,
      exitOnCtrlC: false,
    };
    if (input.errorOutput) {
      renderOptions.stderr = input.errorOutput as WriteStream;
    }
    const app = render(<InkTuiPreviewApp snapshot={snapshot} onSubmitInput={async (line) => {
      const result = await submit(line);
      if (result.exit) {
        finish();
      }
      return result.messages;
    }} onExit={() => finish()} />, {
      ...renderOptions,
    });

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      input.input.off("end", onEnd);
      app.unmount();
      resolve();
    };
    const onEnd = () => {
      if (!input.input.isTTY) {
        finish();
      }
    };

    input.input.on("end", onEnd);
    input.input.resume();
  });
}
