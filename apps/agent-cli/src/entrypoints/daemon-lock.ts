import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";

export type DaemonLockRecord = {
  pid: number;
  cwd: string;
  startedAt: number;
};

export type DaemonLockStatus = {
  state: "running" | "not_running" | "stale";
  filePath: string;
  pid: number | null;
  cwd: string | null;
  startedAt: number | null;
  detail: string | null;
};

type DaemonLockDeps = {
  pid?: () => number;
  cwd?: () => string;
  now?: () => number;
  processExists?: (pid: number) => boolean;
};

function createDaemonAlreadyRunningError(details: string): Error & { code: string } {
  const error = new Error(`agent-cli daemon is already running${details ? ` (${details})` : ""}`) as Error & {
    code: string;
  };
  error.code = "AGENT_DAEMON_ALREADY_RUNNING";
  return error;
}

export class DaemonLock {
  constructor(
    private readonly runtimeRoot = path.join(process.cwd(), ".runtime"),
    private readonly deps: DaemonLockDeps = {},
  ) {}

  private filePath(): string {
    return path.join(this.runtimeRoot, "daemon.lock");
  }

  private summarizeRecord(record: Partial<DaemonLockRecord>): Omit<DaemonLockStatus, "state" | "filePath" | "detail"> {
    return {
      pid: typeof record.pid === "number" ? record.pid : null,
      cwd: typeof record.cwd === "string" ? record.cwd : null,
      startedAt: typeof record.startedAt === "number" ? record.startedAt : null,
    };
  }

  private buildRecord(): DaemonLockRecord {
    return {
      pid: (this.deps.pid ?? (() => process.pid))(),
      cwd: (this.deps.cwd ?? (() => process.cwd()))(),
      startedAt: (this.deps.now ?? Date.now)(),
    };
  }

  private async ensureRoot(): Promise<void> {
    await mkdir(this.runtimeRoot, { recursive: true });
  }

  private async describeExistingLock(): Promise<string> {
    const raw = await readFile(this.filePath(), "utf8").catch(() => "");
    if (!raw.trim()) {
      return "";
    }
    try {
      const parsed = JSON.parse(raw) as Partial<DaemonLockRecord>;
      const pid = typeof parsed.pid === "number" ? `pid=${parsed.pid}` : null;
      const cwd = typeof parsed.cwd === "string" && parsed.cwd ? `cwd=${parsed.cwd}` : null;
      return [pid, cwd].filter(Boolean).join(" ");
    } catch {
      return raw.trim();
    }
  }

  private isProcessAlive(pid: number): boolean {
    if (!Number.isInteger(pid) || pid <= 0) {
      return false;
    }
    const processExists = this.deps.processExists;
    if (processExists) {
      return processExists(pid);
    }
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException | undefined)?.code === "EPERM";
    }
  }

  private async clearStaleLockIfNeeded(): Promise<boolean> {
    const raw = await readFile(this.filePath(), "utf8").catch(() => "");
    if (!raw.trim()) {
      await unlink(this.filePath()).catch(() => {});
      return true;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<DaemonLockRecord>;
      if (typeof parsed.pid === "number" && this.isProcessAlive(parsed.pid)) {
        return false;
      }
      await unlink(this.filePath()).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  async status(): Promise<DaemonLockStatus> {
    const filePath = this.filePath();
    const raw = await readFile(filePath, "utf8").catch((error) => {
      if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
        return null;
      }
      throw error;
    });
    if (raw === null) {
      return {
        state: "not_running",
        filePath,
        pid: null,
        cwd: null,
        startedAt: null,
        detail: null,
      };
    }
    const text = raw.trim();
    if (!text) {
      return {
        state: "stale",
        filePath,
        pid: null,
        cwd: null,
        startedAt: null,
        detail: "empty lock file",
      };
    }
    try {
      const parsed = JSON.parse(text) as Partial<DaemonLockRecord>;
      const record = this.summarizeRecord(parsed);
      if (typeof parsed.pid === "number" && this.isProcessAlive(parsed.pid)) {
        return {
          state: "running",
          filePath,
          ...record,
          detail: null,
        };
      }
      return {
        state: "stale",
        filePath,
        ...record,
        detail:
          typeof parsed.pid === "number"
            ? "recorded process is not running"
            : "lock file does not contain a valid pid",
      };
    } catch {
      return {
        state: "stale",
        filePath,
        pid: null,
        cwd: null,
        startedAt: null,
        detail: "invalid lock file contents",
      };
    }
  }

  async acquire(): Promise<void> {
    await this.ensureRoot();
    const record = `${JSON.stringify(this.buildRecord(), null, 2)}\n`;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await writeFile(this.filePath(), record, { encoding: "utf8", flag: "wx" });
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException | undefined)?.code !== "EEXIST") {
          throw error;
        }
        if (attempt === 0 && (await this.clearStaleLockIfNeeded())) {
          continue;
        }
        throw createDaemonAlreadyRunningError(await this.describeExistingLock());
      }
    }
  }

  async release(): Promise<void> {
    await unlink(this.filePath()).catch((error) => {
      if ((error as NodeJS.ErrnoException | undefined)?.code !== "ENOENT") {
        throw error;
      }
    });
  }

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      await this.release();
    }
  }
}
