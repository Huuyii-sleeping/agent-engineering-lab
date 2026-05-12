import { exec } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import type { CommandResult, WorktreeRecord } from "./worktree-types.js";

export function execPromise(command: string, cwd: string): Promise<CommandResult> {
  return new Promise((resolve) => {
    exec(command, { cwd, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ stdout, stderr, code: error ? 1 : 0 });
    });
  });
}

export class WorktreeRunner {
  async run(command: string, cwd: string): Promise<CommandResult> {
    return execPromise(command, cwd);
  }

  async isGitRepo(): Promise<boolean> {
    const result = await this.run("git rev-parse --is-inside-work-tree", process.cwd());
    return result.code === 0 && result.stdout.trim() === "true";
  }

  async hasGitMetadata(cwd: string): Promise<boolean> {
    try {
      await access(path.join(cwd, ".git"));
      return true;
    } catch {
      return false;
    }
  }

  async getDirtyFiles(record: WorktreeRecord): Promise<string[] | null> {
    if (!(await this.hasGitMetadata(record.path))) {
      return null;
    }
    const result = await this.run("git status --short", record.path);
    if (result.code !== 0) {
      return null;
    }
    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);
  }
}
