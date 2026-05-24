import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";

const tsxCliPath = path.resolve(process.cwd(), "node_modules/tsx/dist/cli.mjs");
const mainPath = path.resolve(process.cwd(), "src/main.ts");

const result = await new Promise<{ exitCode: number | null; stdout: string; stderr: string }>(
  (resolve, reject) => {
    const child = spawn(process.execPath, [tsxCliPath, mainPath, "tui-ink"], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
    });
    const stdout: string[] = [];
    const stderr: string[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ exitCode, stdout: stdout.join(""), stderr: stderr.join("") });
    });

    child.stdin.end("q");
  },
);

assert.equal(result.exitCode, 0, result.stderr);
assert.match(result.stdout, /Agent CLI - Ink\/TSX REPL preview/);
assert.match(result.stdout, /Build with TSX terminal components/);
assert.match(result.stdout, /Type a message/);
assert.match(result.stdout, /Ctrl\+K palette/);
assert.match(result.stdout, /feature disclosure/);

console.log("PRD-80 Ink TUI smoke passed");
