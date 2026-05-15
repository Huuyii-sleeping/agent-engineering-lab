import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runDaemon, waitForDaemonShutdown } from "../../../src/entrypoints/daemon.js";
import { DaemonLock } from "../../../src/entrypoints/daemon-lock.js";

class FakeServer extends EventEmitter {
  readonly closeAllConnections = vi.fn();
  readonly closeIdleConnections = vi.fn();

  listen(_port: number, _host: string, callback: () => void): void {
    callback();
  }

  close(callback?: (error?: Error) => void): this {
    callback?.();
    this.emit("close");
    return this;
  }
}

class FakeSignalSource extends EventEmitter {
  override on(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }

  override off(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return super.off(event, listener);
  }
}

let runtimeRoot = "";

afterEach(async () => {
  if (runtimeRoot) {
    await rm(runtimeRoot, { recursive: true, force: true }).catch(() => {});
    runtimeRoot = "";
  }
});

describe("entrypoints/daemon", () => {
  it("holds the daemon lock until shutdown completes", async () => {
    runtimeRoot = await mkdtemp(path.join(tmpdir(), "agent-daemon-lock-"));
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
    const server = new FakeServer();
    let resolveStarted = () => undefined as void;
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve;
    });
    let resolveShutdown = () => undefined as void;
    const shutdown = new Promise<void>((resolve) => {
      resolveShutdown = resolve;
    });
    const startHttpServer = vi.fn(async () => {
      resolveStarted();
      return server;
    });
    const waitForShutdown = vi.fn(async () => shutdown);

    const running = runDaemon({
      runtimeRoot,
      output: output as unknown as NodeJS.WritableStream,
      host: host as { initialize(): Promise<void> },
      startHttpServer,
      waitForShutdown,
    });

    await started;
    await expect(new DaemonLock(runtimeRoot).status()).resolves.toMatchObject({
      state: "running",
    });

    resolveShutdown();
    await running;

    await expect(new DaemonLock(runtimeRoot).status()).resolves.toMatchObject({
      state: "not_running",
    });
    expect(host.initialize).toHaveBeenCalledTimes(1);
    expect(startHttpServer).toHaveBeenCalledTimes(1);
    expect(waitForShutdown).toHaveBeenCalledWith({
      output: output as unknown as NodeJS.WritableStream,
      server,
      signalSource: undefined,
    });
    expect(output.chunks.join("")).toContain("agent-cli daemon host started");
  });

  it("rejects a second daemon start while the first instance holds the runtime lock", async () => {
    runtimeRoot = await mkdtemp(path.join(tmpdir(), "agent-daemon-lock-"));
    let resolveFirstStarted = () => undefined as void;
    const firstStarted = new Promise<void>((resolve) => {
      resolveFirstStarted = resolve;
    });
    let resolveFirstShutdown = () => undefined as void;
    const firstShutdown = new Promise<void>((resolve) => {
      resolveFirstShutdown = resolve;
    });
    const firstHost = {
      initialize: vi.fn(async () => undefined),
    };
    const secondHost = {
      initialize: vi.fn(async () => undefined),
    };
    const firstStartHttpServer = vi.fn(async () => {
      resolveFirstStarted();
      return new FakeServer();
    });
    const secondStartHttpServer = vi.fn(async () => new FakeServer());

    try {
      const firstRun = runDaemon({
        runtimeRoot,
        host: firstHost as { initialize(): Promise<void> },
        startHttpServer: firstStartHttpServer,
        waitForShutdown: async () => firstShutdown,
      });
      await firstStarted;

      await expect(
        runDaemon({
          runtimeRoot,
          host: secondHost as { initialize(): Promise<void> },
          startHttpServer: secondStartHttpServer,
          waitForShutdown: async () => undefined,
        }),
      ).rejects.toThrow(/already running/i);

      expect(secondHost.initialize).not.toHaveBeenCalled();
      expect(secondStartHttpServer).not.toHaveBeenCalled();

      resolveFirstShutdown();
      await firstRun;
    } finally {
      await rm(runtimeRoot, { recursive: true, force: true }).catch(() => {});
      runtimeRoot = "";
    }
  });

  it("releases the daemon runtime lock after shutdown completes", async () => {
    runtimeRoot = await mkdtemp(path.join(tmpdir(), "agent-daemon-lock-"));
    const firstHost = {
      initialize: vi.fn(async () => undefined),
    };
    const secondHost = {
      initialize: vi.fn(async () => undefined),
    };
    const firstStartHttpServer = vi.fn(async () => new FakeServer());
    const secondStartHttpServer = vi.fn(async () => new FakeServer());

    await runDaemon({
      runtimeRoot,
      host: firstHost as { initialize(): Promise<void> },
      startHttpServer: firstStartHttpServer,
      waitForShutdown: async () => undefined,
    });

    await runDaemon({
      runtimeRoot,
      host: secondHost as { initialize(): Promise<void> },
      startHttpServer: secondStartHttpServer,
      waitForShutdown: async () => undefined,
    });

    expect(firstStartHttpServer).toHaveBeenCalledTimes(1);
    expect(secondStartHttpServer).toHaveBeenCalledTimes(1);
  });

  it("closes the daemon server when a shutdown signal arrives", async () => {
    const output = {
      chunks: [] as string[],
      write(chunk: string) {
        this.chunks.push(String(chunk));
        return true;
      },
    };
    const signalSource = new FakeSignalSource();
    const server = new FakeServer();

    const waiting = waitForDaemonShutdown({
      server,
      output: output as unknown as NodeJS.WritableStream,
      signalSource: signalSource as unknown as {
        on(event: NodeJS.Signals, listener: () => void): unknown;
        off(event: NodeJS.Signals, listener: () => void): unknown;
      },
    });
    signalSource.emit("SIGTERM");
    await waiting;

    expect(server.closeIdleConnections).toHaveBeenCalledTimes(1);
    expect(server.closeAllConnections).toHaveBeenCalledTimes(1);
    expect(output.chunks.join("")).toContain("agent-cli daemon stopping (SIGTERM)");
  });
});
