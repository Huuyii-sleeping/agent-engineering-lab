import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const MAIN_PATH = path.resolve(process.cwd(), "dist/main.js");

async function resolveFreePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  server.close();
  if (!address || typeof address === "string") {
    throw new Error("failed to allocate free port");
  }
  return address.port;
}

async function runAgentCli(workspace, env, args, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MAIN_PATH, ...args], {
      cwd: workspace,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(String(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({
        exitCode,
        stdout: stdout.join(""),
        stderr: stderr.join(""),
      });
    });
    child.stdin.end(input);
  });
}

async function waitForReadyStatus(workspace, env, timeoutMs, daemonState) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await runAgentCli(workspace, env, ["daemon", "status"]);
    if (last.exitCode === 0 && last.stdout.includes("ready")) {
      return last;
    }
    await sleep(200);
  }
  throw new Error(
    `daemon did not become ready in time
status stdout:
${last?.stdout ?? ""}
status stderr:
${last?.stderr ?? ""}
daemon exit:
${String(daemonState.child?.exitCode ?? null)}
daemon stdout:
${daemonState.stdout.join("")}
daemon stderr:
${daemonState.stderr.join("")}`,
  );
}

async function terminateIfNeeded(child) {
  if (child.exitCode !== null || child.killed) {
    return;
  }
  child.kill("SIGKILL");
  await once(child, "close").catch(() => {});
}

async function waitForChildExit(child) {
  if (child.exitCode !== null) {
    return child.exitCode;
  }
  const [exitCode] = await once(child, "close");
  return exitCode;
}

async function main() {
  await access(MAIN_PATH);
  const workspace = await mkdtemp(path.join(tmpdir(), "prd20-daemon-control-smoke-"));
  let daemon = null;
  const daemonState = {
    child: null,
    stdout: [],
    stderr: [],
  };

  try {
    const port = await resolveFreePort();
    const env = {
      ...process.env,
      MODEL_ID: process.env.MODEL_ID || "smoke-daemon-model",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || "smoke-daemon-key",
      AGENT_HTTP_PORT: String(port),
    };

    daemon = spawn(process.execPath, [MAIN_PATH, "daemon"], {
      cwd: workspace,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    daemonState.child = daemon;
    daemon.stdout?.on("data", (chunk) => daemonState.stdout.push(String(chunk)));
    daemon.stderr?.on("data", (chunk) => daemonState.stderr.push(String(chunk)));

    const ready = await waitForReadyStatus(workspace, env, 10_000, daemonState);
    assert(ready.stdout.includes("daemon running"), "daemon status should report running");
    assert(ready.stdout.includes("ready"), "daemon status should report ready");

    const attached = await runAgentCli(workspace, env, [], "exit\n");
    assert(attached.exitCode === 0, `interactive CLI should exit cleanly\n${attached.stderr}`);
    assert(attached.stdout.includes("Connected to daemon"), "interactive CLI should attach to daemon");
    assert(
      !attached.stdout.includes("daemon attach failed"),
      "interactive CLI should not fall back from daemon attach",
    );

    const stopped = await runAgentCli(workspace, env, ["daemon", "stop"]);
    assert(stopped.exitCode === 0, `daemon stop should succeed\n${stopped.stdout}\n${stopped.stderr}`);
    assert(stopped.stdout.includes("daemon not running"), "daemon stop should converge to not running");

    if (daemon) {
      const exitCode = await waitForChildExit(daemon);
      assert(exitCode === 0, `daemon process should exit cleanly (got ${String(exitCode)})`);
    }

    const finalStatus = await runAgentCli(workspace, env, ["daemon", "status"]);
    assert(finalStatus.exitCode === 1, "daemon status should return non-zero after stop");
    assert(finalStatus.stdout.includes("daemon not running"), "final status should report not running");

    console.log("PRD20_DAEMON_CONTROL_SMOKE_OK");
  } finally {
    if (daemon) {
      await terminateIfNeeded(daemon);
    }
    await rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error("PRD20_DAEMON_CONTROL_SMOKE_FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
