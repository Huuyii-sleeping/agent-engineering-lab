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

  it("fires overdue cron schedules from next_run_at when tick runs late", async () => {
    const { scheduler } = await createManager();
    const createdAt = new Date("2026-05-11T09:05:10+08:00");
    const created = await scheduler.createSchedule("*/5 * * * * *", "late prompt", true, true, { now: createdAt });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error("expected created schedule");
    }
    expect(created.schedule.next_run_at).toBe(new Date("2026-05-11T09:05:15+08:00").getTime());

    const late = await scheduler.tick(new Date("2026-05-11T09:05:16+08:00"));

    expect(late.fired).toHaveLength(1);
    expect(late.fired[0]?.prompt).toBe("late prompt");
    const listed = await scheduler.listSchedules();
    expect(listed[0]?.next_run_at).toBe(new Date("2026-05-11T09:05:20+08:00").getTime());
  });

  it("skips overdue cron schedules when misfire policy is skip", async () => {
    const { root, scheduler } = await createManager();
    const createdAt = new Date("2026-05-11T09:05:10+08:00");
    const created = await scheduler.createSchedule("*/5 * * * * *", "skip late prompt", true, true, { now: createdAt });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error("expected created schedule");
    }
    await writeFile(
      path.join(root, ".schedule", "records.json"),
      `${JSON.stringify([{ ...created.schedule, misfire_policy: "skip", max_catch_up: 5 }], null, 2)}\n`,
      "utf8",
    );

    const late = await scheduler.tick(new Date("2026-05-11T09:05:16+08:00"));

    expect(late.fired).toHaveLength(0);
    expect(await scheduler.peekNotificationCount()).toBe(0);
    const state = await scheduler.listScheduleState();
    expect(state.schedules[0]?.next_run_at).toBe(new Date("2026-05-11T09:05:20+08:00").getTime());
    expect(state.history[0]?.status).toBe("skipped");
    expect(state.history[0]?.error).toContain("misfire_policy=skip");
  });

  it("catches up overdue cron schedules within max_catch_up", async () => {
    const { root, scheduler } = await createManager();
    const createdAt = new Date("2026-05-11T09:05:10+08:00");
    const created = await scheduler.createSchedule("*/5 * * * * *", "catch up prompt", true, true, { now: createdAt });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error("expected created schedule");
    }
    await writeFile(
      path.join(root, ".schedule", "records.json"),
      `${JSON.stringify([{ ...created.schedule, misfire_policy: "catch_up", max_catch_up: 3 }], null, 2)}\n`,
      "utf8",
    );

    const late = await scheduler.tick(new Date("2026-05-11T09:05:31+08:00"));

    expect(late.fired).toHaveLength(3);
    expect(late.fired.map((item) => item.firedAt)).toEqual([
      new Date("2026-05-11T09:05:15+08:00").getTime(),
      new Date("2026-05-11T09:05:20+08:00").getTime(),
      new Date("2026-05-11T09:05:25+08:00").getTime(),
    ]);
    const listed = await scheduler.listSchedules();
    expect(listed[0]?.run_count).toBe(3);
    expect(listed[0]?.next_run_at).toBe(new Date("2026-05-11T09:05:35+08:00").getTime());
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

  it("skips due schedules held by an active foreign lease", async () => {
    const { root, scheduler } = await createManager();
    const now = new Date("2026-05-11T09:05:12+08:00");
    const created = await scheduler.createSchedule("*/1 * * * * *", "leased prompt", true, true);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error("expected created schedule");
    }
    await writeFile(
      path.join(root, ".schedule", "records.json"),
      `${JSON.stringify(
        [
          {
            ...created.schedule,
            lease_owner: "other-owner",
            lease_until: now.getTime() + 10_000,
          },
        ],
        null,
        2,
      )}\n`,
      "utf8",
    );

    const result = await scheduler.tick(now);

    expect(result.fired).toHaveLength(0);
    expect(await scheduler.peekNotificationCount()).toBe(0);
    const listed = await scheduler.listSchedules();
    expect(listed[0]?.run_count).toBe(0);
    const state = await scheduler.listScheduleState();
    expect(state.history[0]?.status).toBe("skipped");
    expect(state.history[0]?.error).toContain("active lease");
  });

  it("recovers stale schedule leases and clears the lease after firing", async () => {
    const { root, scheduler } = await createManager();
    const now = new Date("2026-05-11T09:05:12+08:00");
    const created = await scheduler.createSchedule("*/1 * * * * *", "stale lease prompt", true, true);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error("expected created schedule");
    }
    await writeFile(
      path.join(root, ".schedule", "records.json"),
      `${JSON.stringify(
        [
          {
            ...created.schedule,
            lease_owner: "dead-owner",
            lease_until: now.getTime() - 1,
          },
        ],
        null,
        2,
      )}\n`,
      "utf8",
    );

    const result = await scheduler.tick(now);

    expect(result.fired).toHaveLength(1);
    const listed = await scheduler.listSchedules();
    expect((listed[0] as { lease_owner?: unknown }).lease_owner).toBeNull();
    expect((listed[0] as { lease_until?: unknown }).lease_until).toBeNull();
    expect(listed[0]?.run_count).toBe(1);
  });

  it("explains active leases and missing schedules", async () => {
    const { root, scheduler } = await createManager();
    const now = new Date("2026-05-11T09:05:12+08:00");
    const created = await scheduler.createSchedule("*/1 * * * * *", "explain leased prompt", true, true);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error("expected created schedule");
    }
    await writeFile(
      path.join(root, ".schedule", "records.json"),
      `${JSON.stringify(
        [
          {
            ...created.schedule,
            lease_owner: "other-owner",
            lease_until: now.getTime() + 10_000,
          },
        ],
        null,
        2,
      )}\n`,
      "utf8",
    );

    const explained = await scheduler.explainSchedule(created.schedule.id, now);
    expect(explained.ok).toBe(true);
    if (!explained.ok) {
      throw new Error("expected schedule explain result");
    }
    expect(explained.lease.owner).toBe("other-owner");
    expect(explained.lease.active).toBe(true);
    expect(explained.reason).toContain("active lease");

    const missing = await scheduler.explainSchedule("missing", now);
    expect(missing.ok).toBe(false);
    if (missing.ok) {
      throw new Error("expected missing schedule error");
    }
    expect(missing.error.code).toBe("SCHEDULE_NOT_FOUND");
  });

  it("explains overdue cron schedules using next_run_at", async () => {
    const { scheduler } = await createManager();
    const createdAt = new Date("2026-05-11T09:05:10+08:00");
    const created = await scheduler.createSchedule("*/5 * * * * *", "explain late prompt", true, true, {
      now: createdAt,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error("expected created schedule");
    }

    const explained = await scheduler.explainSchedule(created.schedule.id, new Date("2026-05-11T09:05:16+08:00"));

    expect(explained.ok).toBe(true);
    if (!explained.ok) {
      throw new Error("expected schedule explain result");
    }
    expect(explained.due).toBe(true);
    expect(explained.reason).toContain("next_run_at");
  });

  it("pauses, resumes, and updates schedules", async () => {
    const { scheduler } = await createManager();
    const createdAt = new Date("2026-05-11T09:05:10+08:00");
    const created = await scheduler.createSchedule("*/5 * * * * *", "managed prompt", true, true, { now: createdAt });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error("expected created schedule");
    }

    const paused = await (
      scheduler as unknown as { pauseSchedule: (id: unknown) => Promise<{ ok: true }> }
    ).pauseSchedule(created.schedule.id);
    expect(paused.ok).toBe(true);
    expect((await scheduler.tick(new Date("2026-05-11T09:05:16+08:00"))).fired).toHaveLength(0);

    const resumed = await (
      scheduler as unknown as { resumeSchedule: (id: unknown, now?: Date) => Promise<{ ok: true }> }
    ).resumeSchedule(created.schedule.id, new Date("2026-05-11T09:05:16+08:00"));
    expect(resumed.ok).toBe(true);

    const updated = await (
      scheduler as unknown as {
        updateSchedule: (
          id: unknown,
          updates: Record<string, unknown>,
          now?: Date,
        ) => Promise<{ ok: true; schedule: { prompt: string; cron: string; next_run_at: number | null } }>;
      }
    ).updateSchedule(
      created.schedule.id,
      { prompt: "updated prompt", cron: "*/10 * * * * *", misfire_policy: "catch_up", max_catch_up: 2 },
      new Date("2026-05-11T09:05:16+08:00"),
    );
    expect(updated.ok).toBe(true);
    expect(updated.schedule.prompt).toBe("updated prompt");
    expect(updated.schedule.cron).toBe("*/10 * * * * *");
    expect(updated.schedule.next_run_at).toBe(new Date("2026-05-11T09:05:20+08:00").getTime());
  });

  it("reports scheduler production stats", async () => {
    const { root, scheduler } = await createManager();
    const createdAt = new Date("2026-05-11T09:05:10+08:00");
    const created = await scheduler.createSchedule("*/5 * * * * *", "stats prompt", true, true, { now: createdAt });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error("expected created schedule");
    }
    await scheduler.tick(new Date("2026-05-11T09:05:11+08:00"));
    await writeFile(
      path.join(root, ".schedule", "records.json"),
      `${JSON.stringify(
        [
          {
            ...created.schedule,
            lease_owner: "other-owner",
            lease_until: new Date("2026-05-11T09:05:30+08:00").getTime(),
          },
        ],
        null,
        2,
      )}\n`,
      "utf8",
    );

    const stats = await (
      scheduler as unknown as {
        getStats: (now?: Date) => Promise<{
          ok: true;
          schedules: { total: number; enabled: number; disabled: number; overdue: number; active_leases: number };
          pending_notifications: number;
          history_entries: number;
          last_tick_at: number | null;
        }>;
      }
    ).getStats(new Date("2026-05-11T09:05:16+08:00"));

    expect(stats.ok).toBe(true);
    expect(stats.schedules.total).toBe(1);
    expect(stats.schedules.enabled).toBe(1);
    expect(stats.schedules.disabled).toBe(0);
    expect(stats.schedules.overdue).toBe(1);
    expect(stats.schedules.active_leases).toBe(1);
    expect(stats.last_tick_at).toBe(new Date("2026-05-11T09:05:11+08:00").getTime());
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
