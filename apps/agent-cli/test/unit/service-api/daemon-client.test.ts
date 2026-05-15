import { describe, expect, it, vi } from "vitest";
import { resolveRunningDaemonServiceClient } from "../../../src/service-api/daemon-client.js";

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
});
