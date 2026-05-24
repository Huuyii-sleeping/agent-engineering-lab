import type { ReadStream, WriteStream } from "node:tty";
import { render } from "ink";
import { InkTuiPreviewApp, buildInkTuiPreviewSnapshot } from "../terminal-ui/ink-tui.js";

export type InkTerminalTuiIo = {
  input: NodeJS.ReadableStream & { isTTY?: boolean };
  output: NodeJS.WritableStream;
  errorOutput?: NodeJS.WritableStream;
};

function isExitInput(chunk: Buffer | string): boolean {
  const value = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
  return value.includes("q") || value.includes("\u001b") || value.includes("\u0003");
}

/** Start the experimental Ink/TSX terminal UI preview. */
export async function runInkTerminalTui(input: InkTerminalTuiIo): Promise<void> {
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
    const app = render(<InkTuiPreviewApp snapshot={snapshot} />, {
      ...renderOptions,
    });

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      input.input.off("data", onData);
      input.input.off("end", onEnd);
      app.unmount();
      resolve();
    };
    const onData = (chunk: Buffer | string) => {
      if (isExitInput(chunk)) {
        finish();
      }
    };
    const onEnd = () => {
      if (!input.input.isTTY) {
        finish();
      }
    };

    input.input.on("data", onData);
    input.input.on("end", onEnd);
    input.input.resume();
  });
}
