import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SchedulerStore } from "../../../src/tools/scheduler-store.js";

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

async function makeStore(): Promise<{ root: string; store: SchedulerStore }> {
  tempDir = await mkdtemp(path.join(tmpdir(), "scheduler-store-test-"));
  const root = path.join(tempDir, ".schedule");
  return {
    root,
    store: new SchedulerStore(() => root),
  };
}

describe("tools/scheduler-store", () => {
  it("replaces records through a temporary file", async () => {
    const { root, store } = await makeStore();
    await store.ensureInit();
    const recordsPath = path.join(root, "records.json");
    const before = await stat(recordsPath);

    await store.saveRecords([
      {
        id: "sch_atomic",
        cron: "*/5 * * * * *",
        kind: "cron",
        once_at: null,
        prompt: "atomic save",
        recurring: true,
        durable: true,
        created_at: 1,
        last_fired_at: null,
        last_run_at: null,
        next_run_at: 5,
        last_error: null,
        run_count: 0,
        status: "enabled",
        enabled: true,
        lease_owner: null,
        lease_until: null,
        misfire_policy: "fire_once",
        max_catch_up: 5,
      },
    ]);

    const after = await stat(recordsPath);
    expect(after.ino).not.toBe(before.ino);
    expect(await readFile(recordsPath, "utf8")).toContain('"id": "sch_atomic"');
  });

  it("loads legacy ISO timestamps as numeric milliseconds", async () => {
    const { root, store } = await makeStore();
    await store.ensureInit();
    await writeFile(
      path.join(root, "records.json"),
      `${JSON.stringify([
        {
          id: "sch_legacy",
          cron: "*/2 * * * * *",
          prompt: "legacy schedule",
          recurring: true,
          durable: true,
          created_at: "2026-05-10T05:58:30.805Z",
          last_fired_at: "2026-05-10T05:58:32.000Z",
          enabled: true,
        },
      ])}\n`,
      "utf8",
    );

    const records = await store.loadRecords();
    expect(records).toEqual([
      {
        id: "sch_legacy",
        cron: "*/2 * * * * *",
        prompt: "legacy schedule",
        recurring: true,
        durable: true,
        created_at: Date.parse("2026-05-10T05:58:30.805Z"),
        last_fired_at: Date.parse("2026-05-10T05:58:32.000Z"),
        kind: "cron",
        once_at: null,
        status: "enabled",
        next_run_at: null,
        last_run_at: Date.parse("2026-05-10T05:58:32.000Z"),
        last_error: null,
        run_count: 1,
        enabled: true,
        lease_owner: null,
        lease_until: null,
        misfire_policy: "fire_once",
        max_catch_up: 5,
      },
    ]);
  });

  it("persists notifications in stable JSON shape", async () => {
    const { root, store } = await makeStore();
    await store.saveNotifications([
      {
        id: "sched_evt_1",
        scheduleId: "sch_1",
        prompt: "follow up",
        recurring: true,
        firedAt: 123,
      },
    ]);

    const raw = await readFile(path.join(root, "notifications.json"), "utf8");
    expect(raw).toContain('"scheduleId": "sch_1"');
    expect(await store.loadNotifications()).toEqual([
      {
        id: "sched_evt_1",
        scheduleId: "sch_1",
        prompt: "follow up",
        recurring: true,
        firedAt: 123,
      },
    ]);
  });

  it("persists run history in stable JSON shape", async () => {
    const { root, store } = await makeStore();
    await store.saveHistory([
      {
        id: "sched_run_1",
        scheduleId: "sch_1",
        prompt: "follow up",
        status: "fired",
        startedAt: 123,
        finishedAt: 124,
        error: null,
      },
    ]);

    const raw = await readFile(path.join(root, "history.json"), "utf8");
    expect(raw).toContain('"scheduleId": "sch_1"');
    expect(await store.loadHistory()).toEqual([
      {
        id: "sched_run_1",
        scheduleId: "sch_1",
        prompt: "follow up",
        status: "fired",
        startedAt: 123,
        finishedAt: 124,
        error: null,
      },
    ]);
  });
});
