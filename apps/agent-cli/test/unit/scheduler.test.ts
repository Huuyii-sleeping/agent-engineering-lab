import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SchedulerManager, runScheduleList } from "../../src/tools/scheduler.js";
import { SchedulerStore } from "../../src/tools/scheduler-store.js";

const tempDirs: string[] = [];

async function createManager(): Promise<{ root: string; scheduler: SchedulerManager }> {
  const root = await mkdtemp(path.join(tmpdir(), "scheduler-unit-"));
  tempDirs.push(root);
  return {
    root,
    scheduler: new SchedulerManager(() => path.join(root, ".schedule")),
  };
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
});

describe("scheduler manager", () => {
  it("persists created schedules", async () => {
    const { scheduler } = await createManager();
    const created = await scheduler.createSchedule("15 10 * * *", "do the thing", false, true);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error("expected created schedule");
    }
    const listed = await scheduler.listSchedules();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.cron).toBe("15 10 * * *");
    expect(listed[0]?.prompt).toBe("do the thing");
    expect(typeof listed[0]?.created_at).toBe("number");
    expect(listed[0]?.kind).toBe("cron");
    expect(listed[0]?.status).toBe("enabled");
    expect(listed[0]?.run_count).toBe(0);
  });

  it("creates delay-based one-shot schedules and fires them once", async () => {
    const { scheduler } = await createManager();
    const now = new Date("2026-05-11T09:05:12+08:00");
    const created = await scheduler.createSchedule(undefined, "drink water", undefined, true, { delayMs: 1000, now });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error("expected delay schedule");
    }
    expect(created.schedule.kind).toBe("once");
    expect(created.schedule.once_at).toBe(now.getTime() + 1000);
    expect(created.schedule.recurring).toBe(false);

    expect((await scheduler.tick(new Date(now.getTime() + 500))).fired).toHaveLength(0);
    expect((await scheduler.tick(new Date(now.getTime() + 1000))).fired).toHaveLength(1);
    expect((await scheduler.tick(new Date(now.getTime() + 2000))).fired).toHaveLength(0);

    const listed = await scheduler.listSchedules();
    expect(listed[0]?.status).toBe("disabled");
    expect(listed[0]?.enabled).toBe(false);
    expect(listed[0]?.run_count).toBe(1);
    expect(listed[0]?.next_run_at).toBeNull();
  });

  it("fires second-level cron schedules into durable notifications and avoids duplicate firing in the same second", async () => {
    const { scheduler } = await createManager();
    await scheduler.createSchedule("*/3 * * * * *", "scheduled prompt", true, true);

    const first = await scheduler.tick(new Date("2026-05-11T09:05:12+08:00"));
    expect(first.fired).toHaveLength(1);

    const second = await scheduler.tick(new Date("2026-05-11T09:05:12.800+08:00"));
    expect(second.fired).toHaveLength(0);

    const third = await scheduler.tick(new Date("2026-05-11T09:05:15+08:00"));
    expect(third.fired).toHaveLength(1);

    expect(await scheduler.peekNotificationCount()).toBe(2);
    const drained = await scheduler.drainNotifications();
    expect(drained).toHaveLength(2);
    expect(drained[0]?.firedAt).toBe(new Date("2026-05-11T09:05:12+08:00").getTime());
    expect(await scheduler.peekNotificationCount()).toBe(0);
  });

  it("keeps 5-field cron semantics minute-based with seconds defaulting to zero", async () => {
    const { scheduler } = await createManager();
    await scheduler.createSchedule("5 9 * * *", "minute prompt", true, true);

    const miss = await scheduler.tick(new Date("2026-05-11T09:05:10+08:00"));
    expect(miss.fired).toHaveLength(0);

    const hit = await scheduler.tick(new Date("2026-05-11T09:05:00+08:00"));
    expect(hit.fired).toHaveLength(1);
  });

  it("disables one-shot schedules after the first fire", async () => {
    const { scheduler } = await createManager();
    await scheduler.createSchedule("0 30 8 * * *", "one shot", false, true);
    await scheduler.tick(new Date("2026-05-11T08:30:00+08:00"));
    const listed = await scheduler.listSchedules();
    expect(listed[0]?.enabled).toBe(false);
    expect(listed[0]?.status).toBe("disabled");
    const nextDay = await scheduler.tick(new Date("2026-05-12T08:30:00+08:00"));
    expect(nextDay.fired).toHaveLength(0);
  });

  it("skips tick while another scheduler owner holds the local lock", async () => {
    const { root, scheduler } = await createManager();
    const store = new SchedulerStore(() => path.join(root, ".schedule"));
    const held = await store.acquireTickLock("other-owner", new Date("2026-05-11T09:05:11+08:00").getTime(), 10_000);
    expect(held.acquired).toBe(true);
    await scheduler.createSchedule("*/1 * * * * *", "locked prompt", true, true);

    const skipped = await scheduler.tick(new Date("2026-05-11T09:05:12+08:00"));

    expect(skipped.fired).toHaveLength(0);
    expect(skipped.locked).toBe(true);
    expect(await scheduler.peekNotificationCount()).toBe(0);
  });

  it("persists fired history and exposes it in schedule state", async () => {
    const { scheduler } = await createManager();
    await scheduler.createSchedule("*/1 * * * * *", "history prompt", true, true);

    await scheduler.tick(new Date("2026-05-11T09:05:12+08:00"));
    const state = await scheduler.listScheduleState();

    expect(state.schedules[0]?.run_count).toBe(1);
    expect(state.history).toHaveLength(1);
    expect(state.history[0]?.status).toBe("fired");
    expect(state.history[0]?.prompt).toBe("history prompt");
  });

  it("restores durable schedules after restart", async () => {
    const { root, scheduler } = await createManager();
    await scheduler.createSchedule("0 45 7 * * *", "durable prompt", true, true);
    const restarted = new SchedulerManager(() => path.join(root, ".schedule"));
    const listed = await restarted.listSchedules();
    expect(listed).toHaveLength(1);
    const fired = await restarted.tick(new Date("2026-05-11T07:45:00+08:00"));
    expect(fired.fired).toHaveLength(1);
  });

  it("loads legacy iso timestamps and rewrites them as numeric milliseconds", async () => {
    const { root, scheduler } = await createManager();
    const scheduleRoot = path.join(root, ".schedule");
    await scheduler.createSchedule("0 0 * * * *", "placeholder", true, true);
    await writeFile(
      path.join(scheduleRoot, "records.json"),
      `${JSON.stringify(
        [
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
        ],
        null,
        2,
      )}\n`,
      "utf8",
    );

    const listed = await scheduler.listSchedules();
    expect(listed[0]?.created_at).toBe(Date.parse("2026-05-10T05:58:30.805Z"));
    expect(listed[0]?.last_fired_at).toBe(Date.parse("2026-05-10T05:58:32.000Z"));

    await scheduler.tick(new Date("2026-05-10T13:58:34+08:00"));
    const recordsRaw = await readFile(path.join(scheduleRoot, "records.json"), "utf8");
    expect(recordsRaw).toContain(`"created_at": ${Date.parse("2026-05-10T05:58:30.805Z")}`);
    expect(recordsRaw).toContain(`"last_fired_at": ${Date.parse("2026-05-10T05:58:34.000Z")}`);
    expect(recordsRaw).toContain(`"last_run_at": ${Date.parse("2026-05-10T05:58:34.000Z")}`);
  });
});

describe("scheduler facade", () => {
  it("lists lifecycle schedules with recent history", async () => {
    const listed = JSON.parse(await runScheduleList()) as { ok: true; schedules: unknown[]; history: unknown[] };

    expect(listed.ok).toBe(true);
    expect(Array.isArray(listed.schedules)).toBe(true);
    expect(Array.isArray(listed.history)).toBe(true);
  });
});
