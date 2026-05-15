import { describe, expect, it, vi } from "vitest";
import { runDaemonStop } from "../../../src/entrypoints/daemon-stop.js";

describe("entrypoints/daemon-stop", () => {
  it("returns non-zero when the daemon is not running", async () => {
    const output = {
      chunks: [] as string[],
      write(chunk: string) {
        this.chunks.push(String(chunk));
        return true;
      },
    };

    await expect(
      runDaemonStop({
        output: output as unknown as NodeJS.WritableStream,
        lock: {
          status: async () => ({
            state: "not_running",
            filePath: "/tmp/.runtime/daemon.lock",
            pid: null,
            cwd: null,
            startedAt: null,
            detail: null,
          }),
        },
      }),
    ).resolves.toBe(1);
    expect(output.chunks.join("")).toContain("agent-cli daemon not running");
  });

  it("sends SIGTERM and waits for the daemon to stop", async () => {
    const output = {
      chunks: [] as string[],
      write(chunk: string) {
        this.chunks.push(String(chunk));
        return true;
      },
    };
    const sendSignal = vi.fn();
    const status = vi
      .fn()
      .mockResolvedValueOnce({
        state: "running",
        filePath: "/tmp/.runtime/daemon.lock",
        pid: 4242,
        cwd: "/workspace",
        startedAt: 1,
        detail: null,
      })
      .mockResolvedValueOnce({
        state: "not_running",
        filePath: "/tmp/.runtime/daemon.lock",
        pid: null,
        cwd: null,
        startedAt: null,
        detail: null,
      });

    await expect(
      runDaemonStop({
        output: output as unknown as NodeJS.WritableStream,
        lock: { status },
        sendSignal,
        sleep: async () => undefined,
        timeoutMs: 500,
        pollIntervalMs: 0,
      }),
    ).resolves.toBe(0);

    expect(sendSignal).toHaveBeenCalledWith(4242, "SIGTERM");
    expect(output.chunks.join("")).toContain("agent-cli daemon stopping pid=4242");
    expect(output.chunks.join("")).toContain("agent-cli daemon not running");
  });

  it("returns non-zero when stop times out", async () => {
    const output = {
      chunks: [] as string[],
      write(chunk: string) {
        this.chunks.push(String(chunk));
        return true;
      },
    };

    await expect(
      runDaemonStop({
        output: output as unknown as NodeJS.WritableStream,
        lock: {
          status: async () => ({
            state: "running",
            filePath: "/tmp/.runtime/daemon.lock",
            pid: 4242,
            cwd: "/workspace",
            startedAt: 1,
            detail: null,
          }),
        },
        sendSignal: vi.fn(),
        sleep: async () => undefined,
        timeoutMs: 0,
        pollIntervalMs: 0,
      }),
    ).resolves.toBe(1);

    expect(output.chunks.join("")).toContain("agent-cli daemon stop timed out");
  });
});
