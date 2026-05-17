import { describe, expect, it, vi } from "vitest";
import { probeDaemonServiceClient, resolveRunningDaemonServiceClient } from "../../../src/service-api/daemon-client.js";

describe("service-api/daemon-client", () => {
  it("returns null when the daemon lock is not running", async () => {
    const clientFactory = vi.fn(() => {
      throw new Error("should not construct client");
    });

    await expect(
      resolveRunningDaemonServiceClient({
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
        clientFactory,
      }),
    ).resolves.toBeNull();
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("initializes and returns the shared daemon client when the lock is running", async () => {
    const initialize = vi.fn(async () => undefined);
    const client = {
      initialize,
    };

    const resolved = await resolveRunningDaemonServiceClient({
      lock: {
        status: async () => ({
          state: "running",
          filePath: "/tmp/.runtime/daemon.lock",
          pid: 4242,
          cwd: "/workspace",
          startedAt: 123,
          detail: null,
        }),
      },
      clientFactory: () => client as never,
    });

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(resolved).toMatchObject({
      status: { state: "running", pid: 4242 },
      client,
    });
  });

  it("reports running-but-unready daemon probes without hiding the error", async () => {
    const initialize = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    });

    const probed = await probeDaemonServiceClient({
      lock: {
        status: async () => ({
          state: "running",
          filePath: "/tmp/.runtime/daemon.lock",
          pid: 4242,
          cwd: "/workspace",
          startedAt: 123,
          detail: null,
        }),
      },
      clientFactory: () =>
        ({
          initialize,
        }) as never,
    });

    expect(probed).toMatchObject({
      ready: false,
      client: null,
      status: { state: "running", pid: 4242 },
    });
    expect(probed.error?.message).toContain("ECONNREFUSED");
  });

  it("keeps attach failure explicit when the daemon process exists but service init fails", async () => {
    await expect(
      resolveRunningDaemonServiceClient({
        lock: {
          status: async () => ({
            state: "running",
            filePath: "/tmp/.runtime/daemon.lock",
            pid: 4242,
            cwd: "/workspace",
            startedAt: 123,
            detail: null,
          }),
        },
        clientFactory: () =>
          ({
            initialize: async () => {
              throw new Error("bridge unavailable");
            },
          }) as never,
      }),
    ).rejects.toThrow(/bridge unavailable/);
  });

  it("refuses automatic daemon attach when privacy mode is local-only", async () => {
    const previous = process.env.AGENT_PRIVACY_REMOTE_ATTACH_MODE;
    process.env.AGENT_PRIVACY_REMOTE_ATTACH_MODE = "local_only";
    const clientFactory = vi.fn(() => {
      throw new Error("should not construct client");
    });
    try {
      await expect(
        resolveRunningDaemonServiceClient({
          lock: {
            status: async () => ({
              state: "running",
              filePath: "/tmp/.runtime/daemon.lock",
              pid: 4242,
              cwd: "/workspace",
              startedAt: 123,
              detail: null,
            }),
          },
          clientFactory,
        }),
      ).resolves.toBeNull();
      expect(clientFactory).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_PRIVACY_REMOTE_ATTACH_MODE;
      } else {
        process.env.AGENT_PRIVACY_REMOTE_ATTACH_MODE = previous;
      }
    }
  });
});
