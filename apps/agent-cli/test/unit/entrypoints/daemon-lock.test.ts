import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DaemonLock } from "../../../src/entrypoints/daemon-lock.js";

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    tempDir = "";
  }
});

describe("entrypoints/daemon-lock", () => {
  it("reclaims a stale daemon lock when the recorded process is no longer alive", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "agent-daemon-lock-test-"));
    const runtimeRoot = path.join(tempDir, ".runtime");
    const stalePath = path.join(runtimeRoot, "daemon.lock");
    await mkdir(runtimeRoot, { recursive: true });
    await writeFile(
      stalePath,
      `${JSON.stringify({ pid: 101, cwd: "D:/stale", startedAt: 1 }, null, 2)}\n`,
      "utf8",
    );
    const processExists = vi.fn((pid: number) => pid === 202);
    const lock = new DaemonLock(runtimeRoot, {
      pid: () => 202,
      cwd: () => "D:/fresh",
      now: () => 2,
      processExists,
    });

    await lock.acquire();

    const nextRaw = await readFile(stalePath, "utf8");
    expect(processExists).toHaveBeenCalledWith(101);
    expect(JSON.parse(nextRaw)).toMatchObject({
      pid: 202,
      cwd: "D:/fresh",
      startedAt: 2,
    });

    await lock.release();
  });

  it("rejects an active daemon lock when the recorded process still exists", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "agent-daemon-lock-test-"));
    const runtimeRoot = path.join(tempDir, ".runtime");
    const stalePath = path.join(runtimeRoot, "daemon.lock");
    await mkdir(runtimeRoot, { recursive: true });
    await writeFile(
      stalePath,
      `${JSON.stringify({ pid: 101, cwd: "D:/active", startedAt: 1 }, null, 2)}\n`,
      "utf8",
    );
    const processExists = vi.fn((pid: number) => pid === 101);
    const lock = new DaemonLock(runtimeRoot, {
      pid: () => 202,
      cwd: () => "D:/fresh",
      now: () => 2,
      processExists,
    });

    await expect(lock.acquire()).rejects.toMatchObject({
      code: "AGENT_DAEMON_ALREADY_RUNNING",
    });
    await expect(lock.acquire()).rejects.toThrow(/pid=101/);
    expect(processExists).toHaveBeenCalledWith(101);
  });

  it("reports running status for an active daemon lock", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "agent-daemon-lock-test-"));
    const runtimeRoot = path.join(tempDir, ".runtime");
    const lockPath = path.join(runtimeRoot, "daemon.lock");
    await mkdir(runtimeRoot, { recursive: true });
    await writeFile(
      lockPath,
      `${JSON.stringify({ pid: 101, cwd: "D:/active", startedAt: 1 }, null, 2)}\n`,
      "utf8",
    );
    const lock = new DaemonLock(runtimeRoot, {
      processExists: (pid) => pid === 101,
    });

    await expect(lock.status()).resolves.toMatchObject({
      state: "running",
      pid: 101,
      cwd: "D:/active",
      startedAt: 1,
    });
  });

  it("reports stale status when the lock file points to a dead process", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "agent-daemon-lock-test-"));
    const runtimeRoot = path.join(tempDir, ".runtime");
    const lockPath = path.join(runtimeRoot, "daemon.lock");
    await mkdir(runtimeRoot, { recursive: true });
    await writeFile(
      lockPath,
      `${JSON.stringify({ pid: 101, cwd: "D:/stale", startedAt: 1 }, null, 2)}\n`,
      "utf8",
    );
    const lock = new DaemonLock(runtimeRoot, {
      processExists: () => false,
    });

    await expect(lock.status()).resolves.toMatchObject({
      state: "stale",
      pid: 101,
      cwd: "D:/stale",
      startedAt: 1,
    });
    await expect(readFile(lockPath, "utf8")).resolves.toContain("\"pid\": 101");
  });
});
