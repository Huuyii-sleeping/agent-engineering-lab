## ADDED Requirements

### Requirement: Scheduler SHALL trigger overdue cron schedules from next_run_at

Scheduler tick SHALL treat a cron schedule as due when `next_run_at` is not null and `next_run_at <= now`. If tick runs after the exact cron match time, scheduler MUST generate at most one scheduled prompt notification for that overdue schedule in the current tick.

#### Scenario: late tick fires overdue cron once
- **WHEN** a cron schedule has `next_run_at` earlier than or equal to the current tick time
- **THEN** scheduler generates one scheduled prompt notification for that schedule
- **AND** scheduler does not require the current second to exactly match the cron expression

#### Scenario: fired cron advances next_run_at
- **WHEN** an overdue cron schedule is fired
- **THEN** scheduler advances `next_run_at` to the next cron match after the current tick time
- **AND** the advanced `next_run_at` is greater than the current tick time

### Requirement: Scheduler explain SHALL report overdue next_run_at state

`schedule_explain` SHALL use the same due semantics as scheduler tick for cron schedules. When `next_run_at <= now`, explain MUST return `due = true` and a reason that states the schedule is overdue or due by `next_run_at`.

#### Scenario: explain overdue cron schedule
- **WHEN** a user explains a cron schedule whose `next_run_at` is earlier than the current time
- **THEN** `schedule_explain` returns `ok = true`
- **AND** `due = true`
- **AND** the reason explains that `next_run_at` has already arrived
