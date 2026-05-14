import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runDaemon } from "../../../src/entrypoints/daemon.js";

describe("entrypoints/daemon", () => {
  it("initializes the provided host, prints a startup line, and starts the daemon service", async () => {
    const output = {
      chunks: [] as string[],
      write(chunk: string) {
        this.chunks.push(String(chunk));
        return true;
      },
    };
    const host = {
      initialize: vi.fn(async () => undefined),
    };
    const startHttpServer = vi.fn(async () => undefined);

    await runDaemon({
      output: output as unknown as NodeJS.WritableStream,
      host: host as { initialize(): Promise<void> },
      startHttpServer,
    });

    expect(host.initialize).toHaveBeenCalledTimes(1);
    expect(startHttpServer).toHaveBeenCalledTimes(1);
    expect(startHttpServer).toHaveBeenCalledWith({
      host,
      output: output as unknown as NodeJS.WritableStream,
      errorOutput: expect.anything(),
    });
    expect(output.chunks.join("")).toContain("agent-cli daemon host started");
  });

  it("rejects a second daemon start while the first instance holds the runtime lock", async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), "agent-daemon-lock-"));
    const releaseFirst = { resolve: () => undefined as void };
    let resolveFirstStarted = () => undefined as void;
    const firstStarted = new Promise<void>((resolve) => {
      resolveFirstStarted = resolve;
    });
    const firstHost = {
      initialize: vi.fn(async () => undefined),
    };
    const secondHost = {
      initialize: vi.fn(async () => undefined),
    };
    const firstStartHttpServer = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFirstStarted();
          releaseFirst.resolve = resolve;
        }),
    );
    const secondStartHttpServer = vi.fn(async () => undefined);

    try {
      const firstRun = runDaemon({
        runtimeRoot,
        host: firstHost as { initialize(): Promise<void> },
        startHttpServer: firstStartHttpServer,
      });
      await firstStarted;

      await expect(
        runDaemon({
          runtimeRoot,
          host: secondHost as { initialize(): Promise<void> },
          startHttpServer: secondStartHttpServer,
        }),
      ).rejects.toThrow(/already running/i);

      expect(secondHost.initialize).not.toHaveBeenCalled();
      expect(secondStartHttpServer).not.toHaveBeenCalled();

      releaseFirst.resolve();
      await firstRun;
    } finally {
      await rm(runtimeRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("releases the daemon runtime lock after the service exits", async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), "agent-daemon-lock-"));
    const firstHost = {
      initialize: vi.fn(async () => undefined),
    };
    const secondHost = {
      initialize: vi.fn(async () => undefined),
    };
    const firstStartHttpServer = vi.fn(async () => undefined);
    const secondStartHttpServer = vi.fn(async () => undefined);

    try {
      await runDaemon({
        runtimeRoot,
        host: firstHost as { initialize(): Promise<void> },
        startHttpServer: firstStartHttpServer,
      });

      await runDaemon({
        runtimeRoot,
        host: secondHost as { initialize(): Promise<void> },
        startHttpServer: secondStartHttpServer,
      });

      expect(firstStartHttpServer).toHaveBeenCalledTimes(1);
      expect(secondStartHttpServer).toHaveBeenCalledTimes(1);
    } finally {
      await rm(runtimeRoot, { recursive: true, force: true }).catch(() => {});
    }
  });
});
