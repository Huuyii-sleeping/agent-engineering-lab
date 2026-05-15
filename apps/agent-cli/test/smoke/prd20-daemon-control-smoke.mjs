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

function parseSseBlock(block) {
  let id = null;
  let event = "message";
  let data = null;
  for (const line of block.split("\n")) {
    const normalized = line.replace(/\r$/, "");
    if (normalized.startsWith("id:")) {
      const parsed = Number(normalized.slice("id:".length).trim());
      id = Number.isInteger(parsed) ? parsed : null;
      continue;
    }
    if (normalized.startsWith("event:")) {
      event = normalized.slice("event:".length).trim() || "message";
      continue;
    }
    if (normalized.startsWith("data:")) {
      data = JSON.parse(normalized.slice("data:".length).trim());
    }
  }
  return { id, event, data };
}

async function readSseEvents(url, expectedCount, init = {}) {
  const response = await fetch(url, init);
  assert(response.ok, `SSE endpoint should be reachable: ${response.status}`);
  assert(response.body, "SSE response should have a body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let buffer = "";

  try {
    while (events.length < expectedCount) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      buffer += decoder.decode(chunk.value, { stream: true });
      while (events.length < expectedCount) {
        const boundary = buffer.indexOf("\n\n");
        if (boundary === -1) {
          break;
        }
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        events.push(parseSseBlock(block));
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  return events;
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

    const baseUrl = `http://127.0.0.1:${port}`;
    const initialBridgeState = await fetch(`${baseUrl}/bridge/state`).then((res) => res.json());
    assert(initialBridgeState.ok === true, "bridge state should return ok");
    assert(initialBridgeState.ready === true, "bridge state should report ready");
    assert(initialBridgeState.session_count === 0, "bridge state should start empty");
    assert(initialBridgeState.latest_event_id === null, "bridge state should start without events");

    const firstSession = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).then((res) => res.json());
    assert(firstSession.ok === true, "daemon bridge should create a shared session");
    assert(firstSession.session?.id, "daemon bridge should return a session id");

    const bridgeStateAfterCreate = await fetch(`${baseUrl}/bridge/state`).then((res) => res.json());
    assert(bridgeStateAfterCreate.session_count === 1, "bridge state should expose shared session count");
    assert(bridgeStateAfterCreate.latest_event_id === 0, "bridge state should expose latest event cursor");

    const replayedEvents = await readSseEvents(`${baseUrl}/events?since_id=-1`, 2);
    assert(replayedEvents[0]?.event === "bridge.ready", "events stream should emit bridge.ready first");
    assert(replayedEvents[1]?.event === "session.created", "events stream should replay buffered host events");
    assert(
      replayedEvents[1]?.data?.payload?.session?.id === firstSession.session.id,
      "replayed event should point at the created daemon session",
    );

    const secondSession = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).then((res) => res.json());
    assert(secondSession.ok === true, "daemon bridge should create a second session");
    const replayedFromHeader = await readSseEvents(`${baseUrl}/events`, 2, {
      headers: { "Last-Event-ID": "0" },
    });
    assert(replayedFromHeader[0]?.event === "bridge.ready", "header replay should still emit bridge.ready");
    assert(replayedFromHeader[0]?.data?.replay_from === 0, "bridge ready should reflect Last-Event-ID");
    assert(replayedFromHeader[1]?.id === 1, "header replay should resume from the next buffered cursor");
    assert(
      replayedFromHeader[1]?.data?.payload?.session?.id === secondSession.session.id,
      "header replay should return the second shared session event",
    );

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
