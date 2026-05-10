import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SchedulerManager } from "../../src/tools/scheduler.js";

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
  });

  it("fires matching schedules into durable notifications and avoids duplicate firing in the same minute", async () => {
    const { scheduler } = await createManager();
    await scheduler.createSchedule("5 9 * * *", "scheduled prompt", true, true);

    const atMinute = new Date("2026-05-11T09:05:10+08:00");
    const first = await scheduler.tick(atMinute);
    expect(first.fired).toHaveLength(1);

    const second = await scheduler.tick(new Date("2026-05-11T09:05:45+08:00"));
    expect(second.fired).toHaveLength(0);

    expect(await scheduler.peekNotificationCount()).toBe(1);
    const drained = await scheduler.drainNotifications();
    expect(drained).toHaveLength(1);
    expect(await scheduler.peekNotificationCount()).toBe(0);
  });

  it("disables one-shot schedules after the first fire", async () => {
    const { scheduler } = await createManager();
    await scheduler.createSchedule("30 8 * * *", "one shot", false, true);
    await scheduler.tick(new Date("2026-05-11T08:30:00+08:00"));
    const listed = await scheduler.listSchedules();
    expect(listed[0]?.enabled).toBe(false);
    const nextDay = await scheduler.tick(new Date("2026-05-12T08:30:00+08:00"));
    expect(nextDay.fired).toHaveLength(0);
  });

  it("restores durable schedules after restart", async () => {
    const { root, scheduler } = await createManager();
    await scheduler.createSchedule("45 7 * * *", "durable prompt", true, true);
    const restarted = new SchedulerManager(() => path.join(root, ".schedule"));
    const listed = await restarted.listSchedules();
    expect(listed).toHaveLength(1);
    const fired = await restarted.tick(new Date("2026-05-11T07:45:00+08:00"));
    expect(fired.fired).toHaveLength(1);
  });
});
