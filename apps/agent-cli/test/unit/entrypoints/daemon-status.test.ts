import { describe, expect, it } from "vitest";
import { formatDaemonStatusLine, runDaemonStatus } from "../../../src/entrypoints/daemon-status.js";
import type { DaemonLockStatus } from "../../../src/entrypoints/daemon-lock.js";

function createOutput() {
  return {
    chunks: [] as string[],
    write(chunk: string) {
      this.chunks.push(String(chunk));
      return true;
    },
  };
}

describe("entrypoints/daemon-status", () => {
  it("prints running status and returns success", async () => {
    const output = createOutput();
    const status: DaemonLockStatus = {
      state: "running",
      filePath: "/tmp/.runtime/daemon.lock",
      pid: 101,
      cwd: "/repo",
      startedAt: 1,
      detail: null,
    };

    await expect(
      runDaemonStatus({
        output: output as unknown as NodeJS.WritableStream,
        lock: { status: async () => status },
      }),
    ).resolves.toBe(0);
    expect(output.chunks.join("")).toContain("daemon running");
    expect(output.chunks.join("")).toContain("pid=101");
  });

  it("prints stale status and returns non-zero", async () => {
    const output = createOutput();
    const status: DaemonLockStatus = {
      state: "stale",
      filePath: "/tmp/.runtime/daemon.lock",
      pid: 101,
      cwd: "/repo",
      startedAt: 1,
      detail: "recorded process is not running",
    };

    await expect(
      runDaemonStatus({
        output: output as unknown as NodeJS.WritableStream,
        lock: { status: async () => status },
      }),
    ).resolves.toBe(1);
    expect(output.chunks.join("")).toContain("daemon stale");
  });

  it("formats not-running status compactly", () => {
    expect(
      formatDaemonStatusLine({
        state: "not_running",
        filePath: "/tmp/.runtime/daemon.lock",
        pid: null,
        cwd: null,
        startedAt: null,
        detail: null,
      }),
    ).toBe("agent-cli daemon not running");
  });
});
