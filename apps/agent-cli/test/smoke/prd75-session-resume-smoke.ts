import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAgentSessionRecord } from "../../src/service-api/sessions.js";
import { SessionStore } from "../../src/service-api/session-store.js";

const root = await mkdtemp(path.join(tmpdir(), "prd75-session-resume-"));

try {
  const store = new SessionStore(path.join(root, ".sessions"));
  const session = createAgentSessionRecord("prd75_session", 1000);
  session.history.push({ role: "user", content: "start" });
  session.runtimeState.roundCounter = 1;

  await store.save(session);

  const restarted = new SessionStore(path.join(root, ".sessions"));
  const resumed = await restarted.load(session.id);
  assert.ok(resumed, "session should resume after restart");
  assert.equal(resumed.runtimeState.roundCounter, 1);
  resumed.history.push({ role: "assistant", content: "continued" });
  resumed.runtimeState.roundCounter = 2;
  await restarted.save(resumed);

  const resumedAgain = await new SessionStore(path.join(root, ".sessions")).load(session.id);
  assert.ok(resumedAgain, "session should resume after continued save");
  assert.equal(resumedAgain.runtimeState.roundCounter, 2);
  assert.equal(resumedAgain.history.length, 2);

  const journal = await readFile(path.join(root, ".sessions", "session_prd75_session.jsonl"), "utf8");
  assert.equal(journal.trim().split("\n").length, 2);

  console.log("PRD-75 session resume smoke passed");
} finally {
  await rm(root, { recursive: true, force: true }).catch(() => {});
}
